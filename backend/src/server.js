const path = require('path');

// Força carregar o .env da pasta backend
require('dotenv').config({
    path: path.resolve(__dirname, '../.env')
});

const runPendingMigrations = require('./utils/runPendingMigrations');

const PORT = process.env.PORT || 3333;

function startServer() {
    try {
        runPendingMigrations();

        const app = require('./app');
        const { startChecklistScheduleWorker } = require('./workers/checklistScheduleWorker');
        app.listen(PORT, () => {
            console.log(`[SERVER] Running in ${process.env.NODE_ENV} mode.`);
            console.log(`[SERVER] Listening on port ${PORT}...`);
            startChecklistScheduleWorker();
        });
    } catch (error) {
        console.error('[SERVER] Falha ao aplicar migrations; servidor não iniciado.', error);
        process.exitCode = 1;
    }
}

startServer();
