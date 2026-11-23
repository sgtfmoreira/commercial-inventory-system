const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { promises: fs } = require('node:fs');
const { createHash } = require('node:crypto');

const storage = require('../src/services/checklistEvidenceStorage');

function pngChunk(type, data = Buffer.alloc(0)) {
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    chunk.write(type, 4, 4, 'ascii');
    data.copy(chunk, 8);
    return chunk;
}

function samplePng() {
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk('IHDR', Buffer.alloc(13)),
        pngChunk('eXIf', Buffer.from('GPS metadata must disappear')),
        pngChunk('IDAT', Buffer.from([1, 2, 3])),
        pngChunk('IEND')
    ]);
}

test('storage local valida magic bytes, remove metadados e confirma checksum', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'checklist-evidence-test-'));
    process.env.CHECKLIST_EVIDENCE_DIR = directory;
    t.after(async () => {
        delete process.env.CHECKLIST_EVIDENCE_DIR;
        await fs.rm(directory, { recursive: true, force: true });
    });

    const saved = await storage.save(samplePng());
    assert.equal(saved.storageProvider, 'LOCAL_FS');
    assert.equal(saved.contentType, 'image/png');
    assert.match(saved.objectKey, /^[0-9a-f-]{36}\.png$/);
    const stored = await storage.read(saved.objectKey);
    assert.equal(stored.includes(Buffer.from('GPS metadata must disappear')), false);
    assert.equal(saved.sha256, createHash('sha256').update(stored).digest('hex'));
    assert.equal(saved.byteSize, stored.length);

    await storage.remove(saved.objectKey);
    await assert.rejects(storage.read(saved.objectKey), error => error.statusCode === 404);
});

test('storage local rejeita conteúdo arbitrário e chaves não opacas', async () => {
    await assert.rejects(storage.save(Buffer.from('not-an-image')), error => error.statusCode === 422);
    await assert.rejects(storage.read('../secret.png'), error => error.statusCode === 404);
});

test('produção falha fechada sem provider explícito', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousProvider = process.env.CHECKLIST_EVIDENCE_PROVIDER;
    const previousStorageProvider = process.env.CHECKLIST_EVIDENCE_STORAGE_PROVIDER;
    process.env.NODE_ENV = 'production';
    delete process.env.CHECKLIST_EVIDENCE_PROVIDER;
    delete process.env.CHECKLIST_EVIDENCE_STORAGE_PROVIDER;
    try {
        assert.throws(() => storage.normalizeProvider(), error => error.statusCode === 503);
    } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        if (previousProvider === undefined) delete process.env.CHECKLIST_EVIDENCE_PROVIDER;
        else process.env.CHECKLIST_EVIDENCE_PROVIDER = previousProvider;
        if (previousStorageProvider === undefined) delete process.env.CHECKLIST_EVIDENCE_STORAGE_PROVIDER;
        else process.env.CHECKLIST_EVIDENCE_STORAGE_PROVIDER = previousStorageProvider;
    }
});

test('provider documentado prevalece e nome legado continua compatível', () => {
    assert.equal(storage.configuredProvider({
        CHECKLIST_EVIDENCE_STORAGE_PROVIDER: 'SUPABASE',
        CHECKLIST_EVIDENCE_PROVIDER: 'LOCAL_FS'
    }), 'SUPABASE');
    assert.equal(storage.configuredProvider({ CHECKLIST_EVIDENCE_PROVIDER: 'SUPABASE' }), 'SUPABASE');
    assert.equal(storage.normalizeProvider(storage.configuredProvider({
        CHECKLIST_EVIDENCE_STORAGE_PROVIDER: 'SUPABASE'
    })), 'SUPABASE');
});

test('storage Supabase usa bucket privado, confirma checksum e remove objeto', async () => {
    const objects = new Map();
    const requests = [];
    const fakeFetch = async (url, options) => {
        requests.push({ url, options });
        const key = decodeURIComponent(url.split('/').pop());
        if (options.method === 'POST') {
            objects.set(key, Buffer.from(options.body));
            return { ok: true, status: 200 };
        }
        if (options.method === 'GET') {
            const value = objects.get(key);
            if (!value) return { ok: false, status: 404 };
            return { ok: true, status: 200, arrayBuffer: async () => value };
        }
        if (options.method === 'DELETE') {
            objects.delete(key);
            return { ok: true, status: 200 };
        }
        return { ok: false, status: 405 };
    };
    const remote = storage.createSupabaseStorage({
        url: 'https://example.supabase.co', serviceRoleKey: 'server-secret', bucket: 'checklist-evidence'
    }, fakeFetch);
    const sanitized = storage.sanitize(samplePng(), storage.detect(samplePng()));
    const saved = await remote.save(sanitized, { contentType: 'image/png', extension: 'png' });
    assert.equal(saved.storageProvider, 'SUPABASE');
    assert.equal(saved.sha256, createHash('sha256').update(sanitized).digest('hex'));
    assert.deepEqual(await remote.read(saved.objectKey), sanitized);
    assert.equal(requests[0].options.headers.apikey, 'server-secret');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer server-secret');
    assert.match(requests[0].url, /\/storage\/v1\/object\/checklist-evidence\//);
    await remote.remove(saved.objectKey);
    await assert.rejects(remote.read(saved.objectKey), error => error.statusCode === 404);
});

test('storage Supabase envia a secret key atual somente como apikey', async () => {
    const requests = [];
    const remote = storage.createSupabaseStorage({
        url: 'https://example.supabase.co', apiKey: 'sb_secret_example', bucket: 'checklist-evidence'
    }, async (url, options) => {
        requests.push({ url, options });
        return { ok: true, status: 200, arrayBuffer: async () => samplePng() };
    });

    await remote.read('00000000-0000-4000-8000-000000000000.png');
    assert.equal(requests[0].options.headers.apikey, 'sb_secret_example');
    assert.equal(requests[0].options.headers.Authorization, undefined);
});

test('configuração Supabase prioriza secret key atual e aceita service role legada', () => {
    const current = storage.supabaseConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SECRET_KEY: 'sb_secret_current',
        SUPABASE_SERVICE_ROLE_KEY: 'legacy',
        CHECKLIST_EVIDENCE_BUCKET: 'checklist-evidence'
    });
    assert.equal(current.apiKey, 'sb_secret_current');

    const legacy = storage.supabaseConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'legacy',
        CHECKLIST_EVIDENCE_BUCKET: 'checklist-evidence'
    });
    assert.equal(legacy.apiKey, 'legacy');
});

test('configuração Supabase rejeita segredo, URL ou bucket ausente', () => {
    assert.throws(() => storage.supabaseConfig({
        SUPABASE_URL: 'https://example.supabase.co', CHECKLIST_EVIDENCE_BUCKET: 'checklist-evidence'
    }), error => error.statusCode === 503);
    assert.throws(() => storage.supabaseConfig({
        SUPABASE_URL: 'http://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_example', CHECKLIST_EVIDENCE_BUCKET: 'checklist-evidence'
    }), error => error.statusCode === 503);
});
