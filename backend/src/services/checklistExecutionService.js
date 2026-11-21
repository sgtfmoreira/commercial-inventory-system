const AppError = require('../utils/AppError');
const { Prisma } = require('@prisma/client');
const repository = require('../repositories/checklistRunRepository');
const storage = require('./checklistEvidenceStorage');
const { calculateChecklistScore, ChecklistScoringError } = require('./checklistScoringService');

const MAX_RETRIES = 3;
const iso = value => value ? new Date(value).toISOString() : null;
const numberValue = value => value === null || value === undefined ? null : Number(value);

function evidenceDto(evidence) {
    return {
        id: evidence.id, contentType: evidence.contentType, byteSize: evidence.byteSize,
        sha256: evidence.sha256, uploadedAt: iso(evidence.uploadedAt),
        contentUrl: `/api/checklists/evidences/${evidence.id}/content`,
        approvalContentUrl: `/api/checklists/approval-evidences/${evidence.id}/content`
    };
}

function personDto(membership) {
    if (!membership) return null;
    return {
        membershipId: membership.id, userId: membership.user?.id,
        name: membership.user?.name, email: membership.user?.email
    };
}

function approvalDto(approval) {
    return {
        id: approval.id, decision: approval.decision, reason: approval.reason,
        approver: personDto(approval.approver), createdAt: iso(approval.createdAt)
    };
}

function responseDto(response) {
    return {
        id: response.id, templateItemId: response.templateItemId, value: response.valueJson,
        outcome: response.outcome, note: response.note, earnedPoints: numberValue(response.earnedPoints),
        maxPointsSnapshot: numberValue(response.maxPointsSnapshot), version: response.version,
        updatedAt: iso(response.updatedAt), evidences: (response.evidences || []).map(evidenceDto)
    };
}

function attemptDto(attempt) {
    const version = attempt.run.templateVersion;
    return {
        id: attempt.id, runId: attempt.runId, attemptNumber: attempt.attemptNumber,
        status: attempt.status, version: attempt.version, score: numberValue(attempt.score),
        earnedPoints: numberValue(attempt.earnedPoints), applicablePoints: numberValue(attempt.applicablePoints),
        isCompliant: attempt.isCompliant, criticalFailure: attempt.criticalFailure,
        startedAt: iso(attempt.startedAt), submittedAt: iso(attempt.submittedAt), decidedAt: iso(attempt.decidedAt),
        executor: personDto(attempt.executor), approvals: (attempt.approvals || []).map(approvalDto),
        run: { id: attempt.run.id, dueAt: iso(attempt.run.dueAt), status: attempt.run.status, version: attempt.run.version },
        template: {
            id: version.template.id, name: version.template.name, category: version.template.category,
            version: version.version, passingScore: numberValue(version.passingScore), approvalRequired: version.approvalRequired,
            sections: version.sections.map(section => ({
                id: section.id, stableKey: section.stableKey, title: section.title, description: section.description,
                position: section.position, items: section.items.map(item => ({
                    id: item.id, stableKey: item.stableKey, title: item.title, instructions: item.instructions,
                    position: item.position, responseType: item.responseType, required: item.required,
                    allowNotApplicable: item.allowNotApplicable, critical: item.critical,
                    evidenceRequired: item.evidenceRequired, maxPoints: numberValue(item.maxPoints),
                    answerConfigJson: item.answerConfigJson, scoringConfigJson: item.scoringConfigJson
                }))
            }))
        },
        responses: (attempt.responses || []).map(responseDto)
    };
}

function translate(error) {
    if (error instanceof AppError) throw error;
    if (error instanceof ChecklistScoringError) throw new AppError(error.message, 422);
    if (error?.code === 'P2034' || error?.code === 'P2002') throw new AppError('Conflito concorrente. Recarregue e tente novamente.', 409);
    if (error?.code === 'P2004' || /checklist/i.test(error?.message || '')) throw new AppError('A operação viola uma regra de integridade da execução.', 422);
    throw error;
}

async function serializable(callback, db) {
    let last;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
        try { return await repository.withSerializableTransaction(callback, db); }
        catch (error) { last = error; if (error?.code !== 'P2034' || attempt === MAX_RETRIES) break; }
    }
    throw last;
}

async function nextEvent(tx, runId, eventType, actorMembershipId, metadataJson) {
    const sequence = await tx.checklistRunEvent.count({ where: { runId } }) + 1;
    await tx.checklistRunEvent.create({ data: { runId, sequence, eventType, actorMembershipId, metadataJson } });
}

async function listMine(context, options = {}) {
    const rows = await repository.listAssigned(context, options.db);
    return rows.map(run => ({
        id: run.id, status: run.status, version: run.version, dueAt: iso(run.dueAt),
        template: { id: run.templateVersion.template.id, name: run.templateVersion.template.name, category: run.templateVersion.template.category, version: run.templateVersion.version },
        attempt: run.attempts?.[0] ? { id: run.attempts[0].id, status: run.attempts[0].status, version: run.attempts[0].version } : null
    }));
}

async function getAttempt(context, attemptId, options = {}) {
    const attempt = await repository.findAttemptForExecutor(attemptId, context, options.db);
    if (!attempt) throw new AppError('Tentativa de checklist não encontrada.', 404);
    return attemptDto(attempt);
}

async function start(context, runId, options = {}) {
    try {
        const attemptId = await serializable(async tx => {
            const run = await repository.findRunForExecutor(runId, context, tx);
            if (!run) throw new AppError('Checklist atribuído não encontrado.', 404);
            if (run.status === 'IN_PROGRESS' && run.attempts?.[0]?.status === 'IN_PROGRESS') return run.attempts[0].id;
            if (!['ASSIGNED', 'REJECTED'].includes(run.status)) throw new AppError('Este checklist não pode ser iniciado agora.', 409);
            const attemptNumber = (run.attempts?.[0]?.attemptNumber || 0) + 1;
            const created = await tx.checklistExecutionAttempt.create({
                data: { runId: run.id, attemptNumber, executorMembershipId: context.membershipId },
                select: { id: true }
            });
            const updated = await tx.checklistRun.updateMany({
                where: { id: run.id, version: run.version, status: run.status },
                data: { status: 'IN_PROGRESS', version: { increment: 1 } }
            });
            if (updated.count !== 1) throw new AppError('O checklist foi alterado em outra sessão.', 409);
            await nextEvent(tx, run.id, 'ATTEMPT_STARTED', context.membershipId, { attemptId: created.id, attemptNumber });
            return created.id;
        }, options.db);
        return getAttempt(context, attemptId, options);
    } catch (error) {
        if (error?.code === 'P2002') {
            const run = await repository.findRunForExecutor(runId, context, options.db);
            if (run?.attempts?.[0]?.status === 'IN_PROGRESS') return getAttempt(context, run.attempts[0].id, options);
        }
        return translate(error);
    }
}

function scoreInput(item, input) {
    return { itemKey: item.stableKey, value: input.value, notApplicable: input.notApplicable };
}

function scoringItem(item) {
    return {
        stableKey: item.stableKey,
        title: item.title,
        instructions: item.instructions,
        position: item.position,
        responseType: item.responseType,
        required: item.required,
        allowNotApplicable: item.allowNotApplicable,
        critical: item.critical,
        evidenceRequired: item.evidenceRequired,
        maxPoints: numberValue(item.maxPoints),
        answerConfigJson: item.answerConfigJson,
        scoringConfigJson: item.scoringConfigJson
    };
}

async function saveResponse(context, attemptId, itemId, input, options = {}) {
    try {
        const responseId = await serializable(async tx => {
            const attempt = await repository.findAttemptForExecutor(attemptId, context, tx);
            if (!attempt || attempt.status !== 'IN_PROGRESS') throw new AppError('Tentativa aberta não encontrada.', 404);
            const item = attempt.run.templateVersion.sections.flatMap(section => section.items).find(candidate => candidate.id === itemId);
            if (!item) throw new AppError('Item não pertence a esta versão do checklist.', 404);
            const calculation = calculateChecklistScore({
                items: [scoringItem(item)],
                responses: [scoreInput(item, input)], passingScore: 0
            }).results[0];
            const existing = attempt.responses.find(response => response.templateItemId === itemId);
            if (!existing && input.version !== 0) throw new AppError('A resposta ainda não existe. Recarregue a execução.', 409);
            if (existing && existing.version !== input.version) throw new AppError('A resposta foi alterada em outra sessão.', 409);
            if (existing) {
                const updated = await tx.checklistResponse.updateMany({
                    where: { id: existing.id, version: input.version },
                    data: {
                        valueJson: input.notApplicable ? Prisma.DbNull : input.value,
                        outcome: calculation.outcome, note: input.note || null,
                        earnedPoints: calculation.earnedPoints, version: { increment: 1 }
                    }
                });
                if (updated.count !== 1) throw new AppError('A resposta foi alterada em outra sessão.', 409);
                await nextEvent(tx, attempt.runId, 'RESPONSE_SAVED', context.membershipId, { attemptId, itemId, responseId: existing.id });
                return existing.id;
            }
            const created = await tx.checklistResponse.create({ data: {
                attemptId, templateItemId: itemId, valueJson: input.notApplicable ? Prisma.DbNull : input.value,
                outcome: calculation.outcome, note: input.note || null, earnedPoints: calculation.earnedPoints,
                maxPointsSnapshot: item.maxPoints, answeredByMembershipId: context.membershipId
            }, select: { id: true } });
            await nextEvent(tx, attempt.runId, 'RESPONSE_SAVED', context.membershipId, { attemptId, itemId, responseId: created.id });
            return created.id;
        }, options.db);
        const attempt = await getAttempt(context, attemptId, options);
        return attempt.responses.find(response => response.id === responseId);
    } catch (error) { return translate(error); }
}

async function addEvidence(context, responseId, file, options = {}) {
    if (!file?.buffer) throw new AppError('Selecione uma imagem.', 422);
    const response = await repository.findResponseForExecutor(responseId, context, options.db);
    if (!response || response.attempt.status !== 'IN_PROGRESS') throw new AppError('Resposta aberta não encontrada.', 404);
    if (response.evidences.filter(item => item.status === 'AVAILABLE').length >= 5) throw new AppError('Limite de cinco fotos por item atingido.', 422);
    const saved = await (options.storage || storage).save(file.buffer);
    try {
        const evidence = await repository.withSerializableTransaction(async tx => {
            const current = await repository.findResponseForExecutor(responseId, context, tx);
            if (!current || current.attempt.status !== 'IN_PROGRESS') throw new AppError('Resposta aberta não encontrada.', 404);
            const created = await tx.checklistEvidence.create({ data: {
                responseId, ...saved, uploadedByMembershipId: context.membershipId, status: 'AVAILABLE'
            } });
            await nextEvent(tx, current.attempt.runId, 'EVIDENCE_ADDED', context.membershipId, { attemptId: current.attemptId, responseId, evidenceId: created.id, sha256: saved.sha256 });
            return created;
        }, options.db);
        return evidenceDto(evidence);
    } catch (error) {
        await (options.storage || storage).remove(saved.objectKey, saved.storageProvider).catch(() => {});
        return translate(error);
    }
}

async function readEvidence(context, evidenceId, options = {}) {
    const evidence = await repository.findEvidenceForExecutor(evidenceId, context, options.db);
    if (!evidence) throw new AppError('Evidência não encontrada.', 404);
    return { evidence, buffer: await (options.storage || storage).read(evidence.objectKey, evidence.storageProvider) };
}

async function submit(context, attemptId, input, options = {}) {
    try {
        await serializable(async tx => {
            const attempt = await repository.findAttemptForExecutor(attemptId, context, tx);
            if (!attempt || attempt.status !== 'IN_PROGRESS') throw new AppError('Tentativa aberta não encontrada.', 404);
            if (attempt.version !== input.version) throw new AppError('A tentativa foi alterada em outra sessão.', 409);
            const items = attempt.run.templateVersion.sections.flatMap(section => section.items);
            const responseByItem = new Map(attempt.responses.map(response => [response.templateItemId, response]));
            for (const item of items) {
                const response = responseByItem.get(item.id);
                if (item.evidenceRequired && response?.outcome !== 'NOT_APPLICABLE' && !(response?.evidences || []).some(evidence => evidence.status === 'AVAILABLE')) {
                    throw new AppError(`O item “${item.title}” exige uma foto.`, 422);
                }
            }
            const calculated = calculateChecklistScore({
                items: items.map(scoringItem),
                responses: attempt.responses.map(response => ({
                    itemKey: items.find(item => item.id === response.templateItemId)?.stableKey,
                    value: response.valueJson, notApplicable: response.outcome === 'NOT_APPLICABLE'
                })),
                passingScore: numberValue(attempt.run.templateVersion.passingScore)
            });
            for (const result of calculated.results) {
                const item = items.find(candidate => candidate.stableKey === result.itemKey);
                const response = responseByItem.get(item.id);
                if (response) await tx.checklistResponse.update({
                    where: { id: response.id },
                    data: { outcome: result.outcome, earnedPoints: result.earnedPoints, version: { increment: 1 } }
                });
            }
            const now = new Date();
            const updatedAttempt = await tx.checklistExecutionAttempt.updateMany({
                where: { id: attempt.id, version: input.version, status: 'IN_PROGRESS' },
                data: {
                    status: 'SUBMITTED', score: calculated.score, earnedPoints: calculated.earnedPoints,
                    applicablePoints: calculated.applicablePoints, isCompliant: calculated.isCompliant,
                    criticalFailure: calculated.criticalFailure, submittedAt: now, version: { increment: 1 }
                }
            });
            if (updatedAttempt.count !== 1) throw new AppError('A tentativa foi alterada em outra sessão.', 409);
            const updatedRun = await tx.checklistRun.updateMany({
                where: { id: attempt.runId, version: attempt.run.version, status: 'IN_PROGRESS' },
                data: { status: 'SUBMITTED', version: { increment: 1 } }
            });
            if (updatedRun.count !== 1) throw new AppError('A ocorrência foi alterada em outra sessão.', 409);
            await nextEvent(tx, attempt.runId, 'ATTEMPT_SUBMITTED', context.membershipId, { attemptId, score: calculated.score, isCompliant: calculated.isCompliant });
            if (!attempt.run.templateVersion.approvalRequired) {
                const approvedAttempt = await tx.checklistExecutionAttempt.updateMany({
                    where: { id: attempt.id, version: input.version + 1, status: 'SUBMITTED' },
                    data: { status: 'APPROVED', decidedAt: now, version: { increment: 1 } }
                });
                if (approvedAttempt.count !== 1) throw new AppError('A tentativa foi alterada em outra sessão.', 409);
                const approvedRun = await tx.checklistRun.updateMany({
                    where: { id: attempt.runId, version: attempt.run.version + 1, status: 'SUBMITTED' },
                    data: { status: 'APPROVED', completedAt: now, version: { increment: 1 } }
                });
                if (approvedRun.count !== 1) throw new AppError('A ocorrência foi alterada em outra sessão.', 409);
                await nextEvent(tx, attempt.runId, 'ATTEMPT_AUTO_APPROVED', null, { attemptId, score: calculated.score, isCompliant: calculated.isCompliant });
            }
        }, options.db);
        return getAttempt(context, attemptId, options);
    } catch (error) { return translate(error); }
}

module.exports = { listMine, start, getAttempt, saveResponse, addEvidence, readEvidence, submit, attemptDto };
