const { promises: fs } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const AppError = require('../utils/AppError');

const MAX_BYTES = 10 * 1024 * 1024;
const root = () => process.env.CHECKLIST_EVIDENCE_DIR || path.join(os.tmpdir(), 'bastidor-checklist-evidence');
const OBJECT_KEY_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
const SUPABASE_PROVIDER = 'SUPABASE';
const LOCAL_PROVIDER = 'LOCAL_FS';

function configuredProvider(environment = process.env) {
    return environment.CHECKLIST_EVIDENCE_STORAGE_PROVIDER || environment.CHECKLIST_EVIDENCE_PROVIDER;
}

function normalizeProvider(value = configuredProvider()) {
    const candidate = String(value || '').trim().toUpperCase();
    if (!candidate) {
        if (process.env.NODE_ENV === 'production') {
            throw new AppError('Storage de evidências não configurado para produção.', 503);
        }
        return LOCAL_PROVIDER;
    }
    if (![LOCAL_PROVIDER, SUPABASE_PROVIDER].includes(candidate)) {
        throw new AppError('Provider de evidências inválido.', 503);
    }
    return candidate;
}

function supabaseConfig(environment = process.env) {
    const url = String(environment.SUPABASE_URL || '').trim().replace(/\/$/, '');
    const apiKey = String(environment.SUPABASE_SECRET_KEY || environment.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const bucket = String(environment.CHECKLIST_EVIDENCE_BUCKET || '').trim();
    if (!url || !apiKey || !bucket) {
        throw new AppError('Storage privado de evidências não configurado.', 503);
    }
    let parsed;
    try { parsed = new URL(url); } catch { throw new AppError('URL do storage de evidências inválida.', 503); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new AppError('URL do storage de evidências inválida.', 503);
    }
    if (!/^[a-z0-9][a-z0-9._-]{1,62}$/i.test(bucket)) {
        throw new AppError('Bucket de evidências inválido.', 503);
    }
    return { url, apiKey, bucket };
}

function detect(buffer) {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { contentType: 'image/jpeg', extension: 'jpg' };
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { contentType: 'image/png', extension: 'png' };
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { contentType: 'image/webp', extension: 'webp' };
    throw new AppError('A evidência deve ser JPEG, PNG ou WebP válido.', 422);
}

function stripJpegMetadata(buffer) {
    const chunks = [buffer.subarray(0, 2)];
    let offset = 2;
    while (offset + 4 <= buffer.length) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        if (marker === 0xda || marker === 0xd9) { chunks.push(buffer.subarray(offset)); return Buffer.concat(chunks); }
        if (marker >= 0xd0 && marker <= 0xd7) { chunks.push(buffer.subarray(offset, offset + 2)); offset += 2; continue; }
        const length = buffer.readUInt16BE(offset + 2);
        if (length < 2 || offset + 2 + length > buffer.length) throw new AppError('Arquivo JPEG inválido.', 422);
        if (![0xe1, 0xed].includes(marker)) chunks.push(buffer.subarray(offset, offset + 2 + length));
        offset += 2 + length;
    }
    throw new AppError('Arquivo JPEG incompleto.', 422);
}

function stripPngMetadata(buffer) {
    const chunks = [buffer.subarray(0, 8)];
    let offset = 8;
    const blocked = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt']);
    while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const end = offset + 12 + length;
        if (end > buffer.length) throw new AppError('Arquivo PNG inválido.', 422);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        if (!blocked.has(type)) chunks.push(buffer.subarray(offset, end));
        offset = end;
        if (type === 'IEND') return Buffer.concat(chunks);
    }
    throw new AppError('Arquivo PNG incompleto.', 422);
}

function stripWebpMetadata(buffer) {
    const chunks = [];
    let offset = 12;
    while (offset + 8 <= buffer.length) {
        const type = buffer.toString('ascii', offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        const end = offset + 8 + size + (size % 2);
        if (end > buffer.length) throw new AppError('Arquivo WebP inválido.', 422);
        if (!['EXIF', 'XMP '].includes(type)) chunks.push(buffer.subarray(offset, end));
        offset = end;
    }
    const body = Buffer.concat(chunks);
    const header = Buffer.alloc(12);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(body.length + 4, 4);
    header.write('WEBP', 8, 'ascii');
    return Buffer.concat([header, body]);
}

function sanitize(buffer, type) {
    if (type.contentType === 'image/jpeg') return stripJpegMetadata(buffer);
    if (type.contentType === 'image/png') return stripPngMetadata(buffer);
    return stripWebpMetadata(buffer);
}

function validateObjectKey(objectKey) {
    if (!OBJECT_KEY_PATTERN.test(String(objectKey || ''))) {
        throw new AppError('Evidência não encontrada.', 404);
    }
    return objectKey;
}

async function saveLocal(buffer, type) {
    await fs.mkdir(root(), { recursive: true });
    const objectKey = `${randomUUID()}.${type.extension}`;
    const target = path.join(root(), objectKey);
    await fs.writeFile(target, buffer, { flag: 'wx' });
    const confirmed = await fs.readFile(target);
    const sha256 = createHash('sha256').update(confirmed).digest('hex');
    return { storageProvider: LOCAL_PROVIDER, objectKey, sha256, contentType: type.contentType, byteSize: confirmed.length };
}

function createSupabaseStorage(config = supabaseConfig(), fetchImpl = global.fetch) {
    if (typeof fetchImpl !== 'function') throw new AppError('Cliente do storage de evidências indisponível.', 503);
    const apiKey = config.apiKey || config.serviceRoleKey;
    const headers = contentType => ({
        apikey: apiKey,
        ...(!apiKey.startsWith('sb_') ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(contentType ? { 'Content-Type': contentType, 'x-upsert': 'false' } : {})
    });
    const endpoint = objectKey => `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeURIComponent(validateObjectKey(objectKey))}`;
    const request = async (objectKey, options) => {
        let response;
        try {
            response = await fetchImpl(endpoint(objectKey), { ...options, signal: AbortSignal.timeout(15_000) });
        } catch {
            throw new AppError('Storage de evidências temporariamente indisponível.', 503);
        }
        return response;
    };
    return {
        async save(buffer, type) {
            const objectKey = `${randomUUID()}.${type.extension}`;
            const uploaded = await request(objectKey, { method: 'POST', headers: headers(type.contentType), body: buffer });
            if (!uploaded.ok) throw new AppError('Não foi possível armazenar a evidência.', 503);
            try {
                const confirmed = await this.read(objectKey);
                return {
                    storageProvider: SUPABASE_PROVIDER, objectKey,
                    sha256: createHash('sha256').update(confirmed).digest('hex'),
                    contentType: type.contentType, byteSize: confirmed.length
                };
            } catch (error) {
                await this.remove(objectKey).catch(() => {});
                throw error;
            }
        },
        async read(objectKey) {
            const response = await request(objectKey, { method: 'GET', headers: headers() });
            if (response.status === 404) throw new AppError('Evidência não encontrada.', 404);
            if (!response.ok) throw new AppError('Storage de evidências temporariamente indisponível.', 503);
            return Buffer.from(await response.arrayBuffer());
        },
        async remove(objectKey) {
            const response = await request(objectKey, { method: 'DELETE', headers: headers() });
            if (!response.ok && response.status !== 404) {
                throw new AppError('Não foi possível remover a evidência.', 503);
            }
        }
    };
}

async function save(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_BYTES) throw new AppError('Evidência vazia ou acima de 10 MB.', 422);
    const type = detect(buffer);
    const sanitized = sanitize(buffer, type);
    if (!sanitized.length || sanitized.length > MAX_BYTES) throw new AppError('Evidência inválida após sanitização.', 422);
    if (normalizeProvider() === SUPABASE_PROVIDER) {
        return createSupabaseStorage().save(sanitized, type);
    }
    return saveLocal(sanitized, type);
}

async function read(objectKey, provider) {
    const selected = normalizeProvider(provider);
    if (selected === SUPABASE_PROVIDER) return createSupabaseStorage().read(objectKey);
    validateObjectKey(objectKey);
    try { return await fs.readFile(path.join(root(), objectKey)); }
    catch (error) { if (error.code === 'ENOENT') throw new AppError('Evidência não encontrada.', 404); throw error; }
}

async function remove(objectKey, provider) {
    if (!objectKey) return;
    const selected = normalizeProvider(provider);
    if (selected === SUPABASE_PROVIDER) return createSupabaseStorage().remove(objectKey);
    validateObjectKey(objectKey);
    await fs.unlink(path.join(root(), objectKey)).catch(error => { if (error.code !== 'ENOENT') throw error; });
}

module.exports = {
    MAX_BYTES, LOCAL_PROVIDER, SUPABASE_PROVIDER,
    detect, sanitize, configuredProvider, normalizeProvider, supabaseConfig, createSupabaseStorage,
    save, read, remove
};
