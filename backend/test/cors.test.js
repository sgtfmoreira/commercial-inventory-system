const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cors = require('cors');

process.env.DATABASE_URL ||= 'postgresql://local:local@127.0.0.1:1/local';
process.env.JWT_SECRET ||= 'cors-test-local-secret-not-for-production';
const {
    DEFAULT_ALLOWED_ORIGINS,
    getAllowedOrigins,
    createCorsOptions
} = require('../src/app');

async function withServer(env, callback) {
    const app = express();
    app.use(cors(createCorsOptions(env)));
    app.use((req, res) => res.status(200).json({ ok: true }));
    const server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
        return await callback(server.address().port);
    } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
}

function request(port, { method = 'GET', origin, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1', port, path: '/', method,
            headers: { ...(origin === undefined ? {} : { Origin: origin }), ...headers }
        }, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
        req.end();
    });
}

test('aceita a origem explicitamente permitida e normaliza barra final', async () => {
    assert.deepEqual(getAllowedOrigins({ CORS_ALLOWED_ORIGINS: ' http://localhost:3001/ ' }), ['http://localhost:3001']);
    await withServer({ CORS_ALLOWED_ORIGINS: 'http://localhost:3001' }, async port => {
        const response = await request(port, { origin: 'http://localhost:3001' });
        assert.equal(response.status, 200);
        assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:3001');
        assert.equal(response.headers['access-control-allow-credentials'], 'true');
    });
});

test('rejeita origem não permitida', async () => {
    await withServer({ CORS_ALLOWED_ORIGINS: 'http://localhost:3001' }, async port => {
        const response = await request(port, { origin: 'http://localhost:3002' });
        assert.equal(response.status, 500);
        assert.equal(response.headers['access-control-allow-origin'], undefined);
    });
});

test('aceita lista de múltiplas origens sem duplicatas', async () => {
    const env = { CORS_ALLOWED_ORIGINS: 'https://one.example,http://localhost:3001,https://one.example/' };
    assert.deepEqual(getAllowedOrigins(env), ['https://one.example', 'http://localhost:3001']);
    await withServer(env, async port => {
        assert.equal((await request(port, { origin: 'https://one.example' })).status, 200);
        assert.equal((await request(port, { origin: 'http://localhost:3001' })).status, 200);
    });
});

test('rejeita origens inválidas, caminhos, query, fragmento e credenciais', () => {
    for (const value of [
        '', 'not-a-url', 'ftp://example.com', 'https://example.com/path',
        'https://example.com?x=1', 'https://example.com#x', 'https://user:pass@example.com',
        'https://one.example,,https://two.example'
    ]) {
        assert.throws(() => getAllowedOrigins({ CORS_ALLOWED_ORIGINS: value }), /CORS|Origem/);
    }
});

test('rejeita wildcard', () => {
    assert.throws(() => getAllowedOrigins({ CORS_ALLOWED_ORIGINS: '*' }), /Origem CORS inválida/);
});

test('rejeita Origin null como origem não confiável', async () => {
    await withServer({ CORS_ALLOWED_ORIGINS: 'http://localhost:3001' }, async port => {
        const response = await request(port, { origin: 'null' });
        assert.equal(response.status, 500);
        assert.equal(response.headers['access-control-allow-origin'], undefined);
    });
});

test('preserva preflight OPTIONS para origem permitida', async () => {
    await withServer({ CORS_ALLOWED_ORIGINS: 'http://localhost:3001' }, async port => {
        const response = await request(port, {
            method: 'OPTIONS', origin: 'http://localhost:3001',
            headers: { 'Access-Control-Request-Method': 'POST' }
        });
        assert.equal(response.status, 204);
        assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:3001');
        assert.match(response.headers['access-control-allow-methods'], /POST/);
    });
});

test('preserva requisições sem Origin', async () => {
    await withServer({ CORS_ALLOWED_ORIGINS: 'http://localhost:3001' }, async port => {
        const response = await request(port);
        assert.equal(response.status, 200);
        assert.equal(response.headers['access-control-allow-origin'], undefined);
    });
});

test('sem variável preserva exatamente a allowlist histórica', async () => {
    assert.deepEqual(getAllowedOrigins({}), [...DEFAULT_ALLOWED_ORIGINS]);
    await withServer({}, async port => {
        assert.equal((await request(port, { origin: 'http://localhost:3000' })).status, 200);
        assert.equal((await request(port, { origin: 'https://commercial-inventory-system.vercel.app' })).status, 200);
        assert.equal((await request(port, { origin: 'http://localhost:3001' })).status, 500);
    });
});
