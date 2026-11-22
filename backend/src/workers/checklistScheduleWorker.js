const scheduleService = require('../services/checklistScheduleService');

let running = false;

async function runChecklistScheduleCycle(options = {}) {
    if (running) return [];
    running = true;
    try {
        return await scheduleService.processDue(options);
    } finally {
        running = false;
    }
}

function startChecklistScheduleWorker(options = {}) {
    if (process.env.CHECKLIST_SCHEDULER_ENABLED === 'false') return null;
    const configured = Number(process.env.CHECKLIST_SCHEDULER_INTERVAL_MS || 60_000);
    const intervalMs = Number.isFinite(configured) ? Math.max(15_000, configured) : 60_000;
    const execute = () => runChecklistScheduleCycle(options).catch(error => {
        console.error('[CHECKLIST_SCHEDULER] Falha ao gerar ocorrências recorrentes:', error);
    });
    execute();
    const timer = setInterval(execute, intervalMs);
    timer.unref?.();
    return timer;
}

module.exports = { runChecklistScheduleCycle, startChecklistScheduleWorker };
