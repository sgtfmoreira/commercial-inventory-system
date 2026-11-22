const test = require('node:test');
const assert = require('node:assert/strict');

const runPendingMigrations = require('../src/utils/runPendingMigrations');

test('não executa migrations fora de produção', () => {
    let called = false;
    const result = runPendingMigrations({
        environment: { NODE_ENV: 'test' },
        spawn: () => { called = true; }
    });

    assert.deepEqual(result, { skipped: true });
    assert.equal(called, false);
});

test('executa prisma migrate deploy antes do servidor em produção', () => {
    let invocation;
    const messages = [];
    const result = runPendingMigrations({
        environment: { NODE_ENV: 'production', DATABASE_URL: 'postgresql://example' },
        prismaCli: '/app/node_modules/prisma/build/index.js',
        stdio: 'pipe',
        spawn: (command, args, options) => {
            invocation = { command, args, options };
            return { status: 0 };
        },
        logger: { log: message => messages.push(message) }
    });

    assert.deepEqual(result, { skipped: false });
    assert.equal(invocation.command, process.execPath);
    assert.deepEqual(invocation.args, ['/app/node_modules/prisma/build/index.js', 'migrate', 'deploy']);
    assert.equal(invocation.options.env.NODE_ENV, 'production');
    assert.deepEqual(messages, ['[DATABASE] Migrations pendentes aplicadas com sucesso.']);
});

test('reconhece o runtime do Render mesmo sem NODE_ENV explícito', () => {
    let called = false;
    runPendingMigrations({
        environment: { RENDER: 'true', DATABASE_URL: 'postgresql://example' },
        prismaCli: '/app/node_modules/prisma/build/index.js',
        stdio: 'pipe',
        spawn: () => { called = true; return { status: 0 }; },
        logger: { log: () => {} }
    });

    assert.equal(called, true);
});

test('interrompe a inicialização quando prisma migrate deploy falha', () => {
    assert.throws(() => runPendingMigrations({
        environment: { NODE_ENV: 'production' },
        prismaCli: '/app/node_modules/prisma/build/index.js',
        stdio: 'pipe',
        spawn: () => ({ status: 1 }),
        logger: { log: () => {} }
    }), /status 1/);
});
