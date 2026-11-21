const AppError = require('../utils/AppError');
const repository = require('../repositories/checklistRunRepository');

const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';
const MAX_RANGE_DAYS = 366;
const MAX_AGGREGATE_ROWS = 5000;
const DAY_MS = 86_400_000;

const iso = value => value ? new Date(value).toISOString() : null;
const numberValue = value => value === null || value === undefined ? null : Number(value);
const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const percentage = (part, total) => total ? round(part / total * 100) : 0;

function businessDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function defaultPeriod(now = new Date()) {
    const to = businessDateKey(now);
    const start = new Date(`${to}T12:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - 29);
    return { from: start.toISOString().slice(0, 10), to };
}

function boundary(value, endOfDay = false) {
    return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}-03:00`);
}

function normalizeFilters(query, now = new Date()) {
    const defaults = defaultPeriod(now);
    const fromKey = query.from || defaults.from;
    const toKey = query.to || defaults.to;
    const from = boundary(fromKey);
    const to = boundary(toKey, true);
    const days = Math.floor((to - from) / DAY_MS) + 1;
    if (to < from) throw new AppError('A data final deve ser igual ou posterior à inicial.', 422);
    if (days > MAX_RANGE_DAYS) throw new AppError('O período máximo é de 366 dias.', 422);
    return {
        from, to, fromKey, toKey,
        templateId: query.templateId,
        templateVersionId: query.templateVersionId,
        responsibleMembershipId: query.responsibleMembershipId,
        page: query.page || 1, limit: query.limit || 25,
        maxRows: MAX_AGGREGATE_ROWS
    };
}

function person(membership) {
    if (!membership) return null;
    return {
        membershipId: membership.id, userId: membership.user?.id,
        name: membership.user?.name, email: membership.user?.email
    };
}

function incrementPerson(map, membership) {
    if (!membership) return;
    const current = map.get(membership.id) || { ...person(membership), count: 0 };
    current.count += 1;
    map.set(membership.id, current);
}

function reportFromRows(rows, filters, options, now = new Date()) {
    const statusCounts = Object.fromEntries(['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'].map(status => [status, 0]));
    const templates = new Map();
    const responsible = new Map();
    const executors = new Map();
    const approvers = new Map();
    const failures = new Map();
    let scoredRuns = 0;
    let scoreTotal = 0;
    let compliantRuns = 0;
    let criticalFailureRuns = 0;
    let onTimeRuns = 0;
    let overdueRuns = 0;
    let notStartedOverdueRuns = 0;
    let reworkRuns = 0;

    const details = rows.map(run => {
        statusCounts[run.status] = (statusCounts[run.status] || 0) + 1;
        const attempt = run.attempts[0] || null;
        const score = numberValue(attempt?.score);
        const overdue = new Date(run.dueAt) < now && !['APPROVED', 'CANCELLED'].includes(run.status);
        const onTime = run.status === 'APPROVED' && run.completedAt && new Date(run.completedAt) <= new Date(run.dueAt);
        if (overdue) overdueRuns += 1;
        if (overdue && run.status === 'ASSIGNED') notStartedOverdueRuns += 1;
        if (onTime) onTimeRuns += 1;
        if ((attempt?.attemptNumber || 0) > 1) reworkRuns += 1;
        if (score !== null) {
            scoredRuns += 1;
            scoreTotal += score;
            if (attempt.isCompliant) compliantRuns += 1;
            if (attempt.criticalFailure) criticalFailureRuns += 1;
        }

        const version = run.templateVersion;
        const templateEntry = templates.get(version.id) || {
            templateVersionId: version.id, templateId: version.template.id,
            name: version.template.name, version: version.version,
            totalRuns: 0, scoredRuns: 0, scoreTotal: 0, compliantRuns: 0
        };
        templateEntry.totalRuns += 1;
        if (score !== null) {
            templateEntry.scoredRuns += 1;
            templateEntry.scoreTotal += score;
            if (attempt.isCompliant) templateEntry.compliantRuns += 1;
        }
        templates.set(version.id, templateEntry);

        const responsibleEntry = responsible.get(run.assignedTo.id) || {
            ...person(run.assignedTo), totalRuns: 0, scoredRuns: 0, scoreTotal: 0, compliantRuns: 0
        };
        responsibleEntry.totalRuns += 1;
        if (score !== null) {
            responsibleEntry.scoredRuns += 1;
            responsibleEntry.scoreTotal += score;
            if (attempt.isCompliant) responsibleEntry.compliantRuns += 1;
        }
        responsible.set(run.assignedTo.id, responsibleEntry);
        incrementPerson(executors, attempt?.executor);
        incrementPerson(approvers, attempt?.approvals?.[0]?.approver);

        for (const response of attempt?.responses || []) {
            const key = `${version.id}:${response.item.stableKey}`;
            const failure = failures.get(key) || {
                templateVersionId: version.id, templateId: version.template.id,
                templateName: version.template.name, version: version.version,
                itemId: response.item.id, stableKey: response.item.stableKey,
                title: response.item.title, critical: response.item.critical, failures: 0
            };
            failure.failures += 1;
            failures.set(key, failure);
        }

        return {
            id: run.id, status: run.status, dueAt: iso(run.dueAt), completedAt: iso(run.completedAt),
            overdue, onTime, assignedTo: person(run.assignedTo),
            template: {
                id: version.template.id, name: version.template.name,
                category: version.template.category, versionId: version.id, version: version.version
            },
            attempt: attempt ? {
                id: attempt.id, attemptNumber: attempt.attemptNumber, status: attempt.status,
                score, isCompliant: attempt.isCompliant, criticalFailure: attempt.criticalFailure,
                submittedAt: iso(attempt.submittedAt), decidedAt: iso(attempt.decidedAt),
                executor: person(attempt.executor), decision: attempt.approvals?.[0]?.decision || null
            } : null
        };
    });

    const summarizeScores = item => ({
        ...item,
        averageScore: item.scoredRuns ? round(item.scoreTotal / item.scoredRuns) : null,
        complianceRate: percentage(item.compliantRuns, item.scoredRuns)
    });
    const cleanScoreFields = item => {
        const { scoreTotal, compliantRuns: _compliantRuns, ...result } = summarizeScores(item);
        return result;
    };
    const total = rows.length;
    const offset = (filters.page - 1) * filters.limit;
    return {
        metadata: {
            generatedAt: now.toISOString(), timeZone: BUSINESS_TIME_ZONE,
            period: { from: filters.fromKey, to: filters.toKey }, maxRangeDays: MAX_RANGE_DAYS
        },
        filters: {
            templateId: filters.templateId || null,
            templateVersionId: filters.templateVersionId || null,
            responsibleMembershipId: filters.responsibleMembershipId || null
        },
        summary: {
            totalRuns: total, scoredRuns, averageScore: scoredRuns ? round(scoreTotal / scoredRuns) : null,
            complianceRate: percentage(compliantRuns, scoredRuns), completionRate: percentage(statusCounts.APPROVED, total),
            onTimeRuns, overdueRuns, notStartedOverdueRuns, criticalFailureRuns, reworkRuns,
            statusCounts
        },
        byTemplateVersion: [...templates.values()].map(cleanScoreFields).sort((a, b) => b.totalRuns - a.totalRuns || a.name.localeCompare(b.name)),
        byResponsible: [...responsible.values()].map(cleanScoreFields).sort((a, b) => b.totalRuns - a.totalRuns || a.name.localeCompare(b.name)),
        byExecutor: [...executors.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        byApprover: [...approvers.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        failedItems: [...failures.values()].sort((a, b) => b.failures - a.failures || a.title.localeCompare(b.title)).slice(0, 20),
        runs: details.slice(offset, offset + filters.limit),
        pagination: {
            page: filters.page, limit: filters.limit, total,
            totalPages: Math.max(1, Math.ceil(total / filters.limit))
        },
        options
    };
}

async function getReport(context, query = {}, options = {}) {
    const now = options.now || new Date();
    const filters = normalizeFilters(query, now);
    const [rows, filterRows] = await Promise.all([
        repository.listReportRuns(context, filters, options.db),
        repository.listReportFilterOptions(context, options.db)
    ]);
    if (rows.length > MAX_AGGREGATE_ROWS) {
        throw new AppError('O período retornou mais de 5.000 ocorrências. Reduza os filtros.', 422);
    }
    const optionMap = new Map();
    for (const row of filterRows.templates) {
        const version = row.templateVersion;
        optionMap.set(version.id, {
            templateVersionId: version.id, templateId: version.template.id,
            name: version.template.name, version: version.version
        });
    }
    const responsibleMap = new Map();
    for (const row of filterRows.responsible) {
        responsibleMap.set(row.assignedTo.id, person(row.assignedTo));
    }
    const reportOptions = {
        templates: [...optionMap.values()].sort((a, b) => a.name.localeCompare(b.name) || b.version - a.version),
        responsible: [...responsibleMap.values()].sort((a, b) => a.name.localeCompare(b.name))
    };
    return reportFromRows(rows, filters, reportOptions, now);
}

module.exports = {
    BUSINESS_TIME_ZONE, MAX_RANGE_DAYS, MAX_AGGREGATE_ROWS,
    businessDateKey, defaultPeriod, normalizeFilters, reportFromRows, getReport
};
