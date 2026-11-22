const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

function dateKey(value, timeZone = BUSINESS_TIME_ZONE) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(value));
    const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${byType.year}-${byType.month}-${byType.day}`;
}

function addDays(key, days) {
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return date.toISOString().slice(0, 10);
}

function weekdayOf(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function localParts(value, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(value));
    return Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
}

function zonedDateTimeToUtc(key, localTime, timeZone = BUSINESS_TIME_ZONE) {
    const [year, month, day] = key.split('-').map(Number);
    const [hour, minute] = localTime.split(':').map(Number);
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
    let candidate = desired;
    for (let iteration = 0; iteration < 4; iteration += 1) {
        const actual = localParts(candidate, timeZone);
        const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour % 24, actual.minute, actual.second);
        const correction = desired - represented;
        candidate += correction;
        if (correction === 0) break;
    }
    return new Date(candidate);
}

function normalizeDateInput(value) {
    if (typeof value === 'string') return value.slice(0, 10);
    return new Date(value).toISOString().slice(0, 10);
}

function nextWeeklyOccurrence({ weekday, localTime, startsOn, endsOn, from = new Date(), timeZone = BUSINESS_TIME_ZONE }) {
    const fromDate = new Date(from);
    const startKey = normalizeDateInput(startsOn);
    const todayKey = dateKey(fromDate, timeZone);
    let candidateKey = startKey > todayKey ? startKey : todayKey;
    candidateKey = addDays(candidateKey, (weekday - weekdayOf(candidateKey) + 7) % 7);
    let candidate = zonedDateTimeToUtc(candidateKey, localTime, timeZone);
    if (candidate <= fromDate) {
        candidateKey = addDays(candidateKey, 7);
        candidate = zonedDateTimeToUtc(candidateKey, localTime, timeZone);
    }
    const endKey = endsOn ? normalizeDateInput(endsOn) : null;
    return endKey && candidateKey > endKey ? null : candidate;
}

module.exports = {
    BUSINESS_TIME_ZONE, dateKey, addDays, weekdayOf, zonedDateTimeToUtc, nextWeeklyOccurrence
};
