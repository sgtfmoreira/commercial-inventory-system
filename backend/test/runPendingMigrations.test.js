const test = require('node:test');
const assert = require('node:assert/strict');

const runPendingMigrations = require('../src/utils/runPendingMigrations');
const { resolveMigrationDatabaseUrl } = runPendingMigrations;

test('prefere DIRECT_URL para migrations sem expor ou alterar DATABASE_URL', () => {
    const environment = {
        DATABASE_URL: 'postgresql://runtime.example:6543/postgres?pgbouncer=true',
        DIRECT_URL: 'postgresql://migration.example:5432/postgres'
    };

    assert.equal(resolveMigrationDatabaseUrl(environment), environment.DIRECT_URL);
    assert.equal(environment.DATABASE_URL, 'postgresql://runtime.example:6543/postgres?pgbouncer=true');
});

test('converte somente o pooler transacional do Supabase para sessão', () => {
    const migrationUrl = resolveMigrationDatabaseUrl({
        DATABASE_URL: 'postgresql://user:secret@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require'
    });
    const parsed = new URL(migrationUrl);

    assert.equal(parsed.port, '5432');
    assert.equal(parsed.hostname, 'aws-1-us-east-1.pooler.supabase.com');
    assert.equal(parsed.searchParams.has('pgbouncer'), false);
    assert.equal(parsed.searchParams.has('connection_limit'), false);
    assert.equal(parsed.searchParams.get('sslmode'), 'require');
});

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
    assert.equal(invocation.options.env.DATABASE_URL, 'postgresql://example');
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
        environment: { NODE_ENV: 'production', DATABASE_URL: 'postgresql://example' },
        prismaCli: '/app/node_modules/prisma/build/index.js',
        stdio: 'pipe',
        spawn: () => ({ status: 1 }),
        logger: { log: () => {} }
    }), /status 1/);
});
