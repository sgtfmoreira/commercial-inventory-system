const path = require('path');

// Força carregar o .env da pasta backend
require('dotenv').config({
    path: path.resolve(__dirname, '../.env')
});

const app = require('./app');
const { startChecklistScheduleWorker } = require('./workers/checklistScheduleWorker');

const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
    console.log(`[SERVER] Running in ${process.env.NODE_ENV} mode.`);
    console.log(`[SERVER] Listening on port ${PORT}...`);
    startChecklistScheduleWorker();
});
