const AppError = require('../utils/AppError');
const repository = require('../repositories/checklistRunRepository');
const auditRepository = require('../repositories/securityAuditRepository');
const storage = require('./checklistEvidenceStorage');
const { attemptDto } = require('./checklistExecutionService');

const MAX_RETRIES = 3;
const iso = value => value ? new Date(value).toISOString() : null;

function translate(error) {
    if (error instanceof AppError) throw error;
    if (['P2002', 'P2034'].includes(error?.code)) {
        throw new AppError('A tentativa já foi decidida em outra sessão.', 409);
    }
    if (error?.code === 'P2004' || /checklist/i.test(error?.message || '')) {
        throw new AppError('A decisão viola uma regra de integridade do checklist.', 422);
    }
    throw error;
}

async function serializable(callback, db) {
    let last;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
        try { return await repository.withSerializableTransaction(callback, db); }
        catch (error) {
            last = error;
            if (error?.code !== 'P2034' || attempt === MAX_RETRIES) break;
        }
    }
    throw last;
}

async function nextEvent(tx, runId, eventType, actorMembershipId, metadataJson) {
    const sequence = await tx.checklistRunEvent.count({ where: { runId } }) + 1;
    return tx.checklistRunEvent.create({
        data: { runId, sequence, eventType, actorMembershipId, metadataJson }
    });
}

function approvalAttemptDto(attempt) {
    return attemptDto(attempt);
}

async function listPending(context, options = {}) {
    const attempts = await repository.listPendingApprovals(context, options.db);
    return attempts.map(approvalAttemptDto);
}

async function getAttempt(context, attemptId, options = {}) {
    const attempt = await repository.findAttemptForApprover(attemptId, context, options.db);
    if (!attempt) throw new AppError('Tentativa para aprovação não encontrada.', 404);
    if (attempt.executorMembershipId === context.membershipId) {
        throw new AppError('O executor não pode aprovar a própria tentativa.', 403);
    }
    return approvalAttemptDto(attempt);
}

async function decide(context, attemptId, input, decision, options = {}) {
    try {
        await serializable(async tx => {
            const attempt = await repository.findAttemptForApprover(attemptId, context, tx);
            if (!attempt) throw new AppError('Tentativa para aprovação não encontrada.', 404);
            if (attempt.executorMembershipId === context.membershipId) {
                throw new AppError('O executor não pode aprovar a própria tentativa.', 403);
            }
            if (!attempt.run.templateVersion.approvalRequired) {
                throw new AppError('Esta tentativa não exige aprovação manual.', 409);
            }
            if (attempt.status !== 'SUBMITTED' || attempt.run.status !== 'SUBMITTED') {
                throw new AppError('Esta tentativa já foi decidida ou não está submetida.', 409);
            }
            if (attempt.version !== input.version) {
                throw new AppError('A tentativa foi alterada em outra sessão.', 409);
            }
            const reason = input.reason?.trim() || null;
            if (decision === 'REJECT' && (!reason || reason.length < 3)) {
                throw new AppError('Informe uma justificativa para rejeitar.', 422);
            }
            const approval = await tx.checklistApproval.create({
                data: {
                    attemptId: attempt.id, decision, reason,
                    approverMembershipId: context.membershipId
                }
            });
            const now = new Date();
            const targetStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
            const updatedAttempt = await tx.checklistExecutionAttempt.updateMany({
                where: { id: attempt.id, status: 'SUBMITTED', version: input.version },
                data: { status: targetStatus, decidedAt: now, version: { increment: 1 } }
            });
            if (updatedAttempt.count !== 1) throw new AppError('A tentativa foi alterada em outra sessão.', 409);
            const updatedRun = await tx.checklistRun.updateMany({
                where: { id: attempt.runId, status: 'SUBMITTED', version: attempt.run.version },
                data: {
                    status: targetStatus,
                    completedAt: decision === 'APPROVE' ? now : null,
                    version: { increment: 1 }
                }
            });
            if (updatedRun.count !== 1) throw new AppError('A ocorrência foi alterada em outra sessão.', 409);
            await nextEvent(
                tx, attempt.runId,
                decision === 'APPROVE' ? 'ATTEMPT_APPROVED' : 'ATTEMPT_REJECTED',
                context.membershipId,
                { attemptId: attempt.id, approvalId: approval.id, reason }
            );
            await auditRepository.create({
                organizationId: context.organizationId,
                establishmentId: context.establishmentId,
                actorUserId: context.userId,
                actorMembershipId: context.membershipId,
                targetUserId: attempt.executor.user.id,
                targetMembershipId: attempt.executorMembershipId,
                eventType: decision === 'APPROVE' ? 'CHECKLIST_ATTEMPT_APPROVED' : 'CHECKLIST_ATTEMPT_REJECTED',
                entityType: 'ChecklistExecutionAttempt',
                entityId: attempt.id,
                beforeJson: { status: 'SUBMITTED', version: attempt.version },
                afterJson: { status: targetStatus, version: attempt.version + 1 },
                metadataJson: { runId: attempt.runId, approvalId: approval.id, reason }
            }, tx);
        }, options.db);
        return getAttempt(context, attemptId, options);
    } catch (error) { return translate(error); }
}

const approve = (context, attemptId, input, options) => decide(context, attemptId, input, 'APPROVE', options);
const reject = (context, attemptId, input, options) => decide(context, attemptId, input, 'REJECT', options);

async function readEvidence(context, evidenceId, options = {}) {
    const evidence = await repository.findEvidenceForApprover(evidenceId, context, options.db);
    if (!evidence) throw new AppError('Evidência não encontrada.', 404);
    return { evidence, buffer: await (options.storage || storage).read(evidence.objectKey, evidence.storageProvider) };
}

function timelinePerson(membership) {
    if (!membership) return null;
    return { membershipId: membership.id, name: membership.user?.name, email: membership.user?.email };
}

async function history(context, runId, options = {}) {
    const run = await repository.findHistory(runId, context, options.db);
    if (!run) throw new AppError('Histórico do checklist não encontrado.', 404);
    return {
        run: {
            id: run.id, status: run.status, dueAt: iso(run.dueAt), completedAt: iso(run.completedAt),
            template: {
                id: run.templateVersion.template.id, name: run.templateVersion.template.name,
                version: run.templateVersion.version
            }
        },
        assignments: run.assignments.map(entry => ({
            sequence: entry.sequence, changeType: entry.changeType, reason: entry.reason,
            previous: timelinePerson(entry.previous), assignedTo: timelinePerson(entry.assignedTo),
            changedBy: timelinePerson(entry.changedBy), createdAt: iso(entry.createdAt)
        })),
        attempts: run.attempts.map(approvalAttemptDto),
        events: run.events.map(event => ({
            sequence: event.sequence, eventType: event.eventType,
            actor: timelinePerson(event.actor), metadata: event.metadataJson,
            occurredAt: iso(event.occurredAt)
        }))
    };
}

module.exports = { listPending, getAttempt, approve, reject, readEvidence, history, approvalAttemptDto };
