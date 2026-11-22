const path = require('node:path');
const { spawnSync } = require('node:child_process');

function resolveMigrationDatabaseUrl(environment) {
    if (environment.DIRECT_URL?.trim()) return environment.DIRECT_URL.trim();

    const runtimeUrl = environment.DATABASE_URL?.trim();
    if (!runtimeUrl) {
        throw new Error('DIRECT_URL ou DATABASE_URL deve estar configurada para aplicar migrations.');
    }

    let parsed;
    try {
        parsed = new URL(runtimeUrl);
    } catch {
        throw new Error('DATABASE_URL inválida; migrations não foram iniciadas.');
    }

    const isSupabasePooler = parsed.hostname.endsWith('.pooler.supabase.com');
    if (isSupabasePooler && parsed.port === '6543') {
        parsed.port = '5432';
        parsed.searchParams.delete('pgbouncer');
        parsed.searchParams.delete('connection_limit');
        return parsed.toString();
    }

    return runtimeUrl;
}

function runPendingMigrations(options = {}) {
    const environment = options.environment || process.env;
    const logger = options.logger || console;

    const isProductionRuntime = environment.NODE_ENV === 'production' || environment.RENDER === 'true';
    if (!isProductionRuntime) {
        return { skipped: true };
    }

    const prismaCli = options.prismaCli || require.resolve('prisma/build/index.js');
    const spawn = options.spawn || spawnSync;
    const migrationDatabaseUrl = resolveMigrationDatabaseUrl(environment);
    const migrationEnvironment = {
        ...environment,
        DATABASE_URL: migrationDatabaseUrl,
        DIRECT_URL: migrationDatabaseUrl
    };
    const result = spawn(process.execPath, [prismaCli, 'migrate', 'deploy'], {
        cwd: path.resolve(__dirname, '../..'),
        env: migrationEnvironment,
        stdio: options.stdio || 'inherit'
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`Prisma migrate deploy terminou com status ${result.status}.`);
    }

    logger.log('[DATABASE] Migrations pendentes aplicadas com sucesso.');
    return { skipped: false };
}

module.exports = runPendingMigrations;
module.exports.resolveMigrationDatabaseUrl = resolveMigrationDatabaseUrl;
