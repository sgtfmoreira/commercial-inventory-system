const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runPendingMigrations(options = {}) {
    const environment = options.environment || process.env;
    const logger = options.logger || console;

    const isProductionRuntime = environment.NODE_ENV === 'production' || environment.RENDER === 'true';
    if (!isProductionRuntime) {
        return { skipped: true };
    }

    const prismaCli = options.prismaCli || require.resolve('prisma/build/index.js');
    const spawn = options.spawn || spawnSync;
    const result = spawn(process.execPath, [prismaCli, 'migrate', 'deploy'], {
        cwd: path.resolve(__dirname, '../..'),
        env: environment,
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
