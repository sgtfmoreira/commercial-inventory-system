const prisma = require('../utils/prisma');

const runInclude = Object.freeze({
    templateVersion: {
        select: {
            id: true, version: true, approvalRequired: true, passingScore: true,
            template: { select: { id: true, name: true, category: true } }
        }
    },
    assignedTo: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
    createdBy: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
    assignments: {
        orderBy: { sequence: 'asc' },
        include: {
            previous: { select: { id: true, user: { select: { name: true, email: true } } } },
            assignedTo: { select: { id: true, user: { select: { name: true, email: true } } } },
            changedBy: { select: { id: true, user: { select: { name: true, email: true } } } }
        }
    }
});

const attemptInclude = Object.freeze({
    run: {
        include: {
            templateVersion: {
                include: {
                    template: { select: { id: true, name: true, category: true } },
                    sections: { orderBy: { position: 'asc' }, include: { items: { orderBy: { position: 'asc' } } } }
                }
            }
        }
    },
    responses: {
        orderBy: { answeredAt: 'asc' },
        include: { evidences: { where: { status: 'AVAILABLE' }, orderBy: { uploadedAt: 'asc' } } }
    },
    executor: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
    approvals: {
        orderBy: { createdAt: 'asc' },
        include: { approver: { select: { id: true, user: { select: { id: true, name: true, email: true } } } } }
    }
});

function listPublishedTemplates(organizationId, db = prisma) {
    return db.checklistTemplateVersion.findMany({
        where: { status: 'PUBLISHED', template: { organizationId, status: 'ACTIVE' } },
        orderBy: [{ template: { name: 'asc' } }, { version: 'desc' }],
        select: {
            id: true, version: true, approvalRequired: true, passingScore: true,
            publishedAt: true, template: { select: { id: true, name: true, category: true, description: true } }
        }
    });
}

function listActiveMemberships(establishmentId, db = prisma) {
    return db.userEstablishment.findMany({
        where: { establishmentId, isActive: true, establishment: { isActive: true } },
        orderBy: { user: { name: 'asc' } },
        include: {
            user: { select: { id: true, name: true, email: true } },
            establishment: { select: { organizationId: true, isActive: true } }
        }
    });
}

function findByClientRequest(organizationId, clientRequestId, db = prisma) {
    return db.checklistRun.findUnique({
        where: { organizationId_clientRequestId: { organizationId, clientRequestId } },
        include: runInclude
    });
}

function findScoped(runId, context, db = prisma) {
    return db.checklistRun.findFirst({
        where: { id: runId, organizationId: context.organizationId, establishmentId: context.establishmentId },
        include: runInclude
    });
}

function listScoped(context, db = prisma) {
    return db.checklistRun.findMany({
        where: { organizationId: context.organizationId, establishmentId: context.establishmentId },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        include: runInclude
    });
}

function listAssigned(context, db = prisma) {
    return db.checklistRun.findMany({
        where: {
            organizationId: context.organizationId,
            establishmentId: context.establishmentId,
            assignedMembershipId: context.membershipId,
            status: { in: ['ASSIGNED', 'IN_PROGRESS', 'REJECTED'] }
        },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        include: { ...runInclude, attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } }
    });
}

function findRunForExecutor(runId, context, db = prisma) {
    return db.checklistRun.findFirst({
        where: {
            id: runId, organizationId: context.organizationId,
            establishmentId: context.establishmentId, assignedMembershipId: context.membershipId
        },
        include: { ...runInclude, attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } }
    });
}

function findAttemptForExecutor(attemptId, context, db = prisma) {
    return db.checklistExecutionAttempt.findFirst({
        where: {
            id: attemptId, executorMembershipId: context.membershipId,
            run: { organizationId: context.organizationId, establishmentId: context.establishmentId, assignedMembershipId: context.membershipId }
        },
        include: attemptInclude
    });
}

function findResponseForExecutor(responseId, context, db = prisma) {
    return db.checklistResponse.findFirst({
        where: {
            id: responseId, answeredByMembershipId: context.membershipId,
            attempt: { run: { organizationId: context.organizationId, establishmentId: context.establishmentId, assignedMembershipId: context.membershipId } }
        },
        include: { item: true, attempt: { include: { run: true } }, evidences: true }
    });
}

function findEvidenceForExecutor(evidenceId, context, db = prisma) {
    return db.checklistEvidence.findFirst({
        where: {
            id: evidenceId, status: 'AVAILABLE',
            response: { attempt: { executorMembershipId: context.membershipId, run: { organizationId: context.organizationId, establishmentId: context.establishmentId } } }
        }
    });
}

function listPendingApprovals(context, db = prisma) {
    return db.checklistExecutionAttempt.findMany({
        where: {
            status: 'SUBMITTED',
            executorMembershipId: { not: context.membershipId },
            run: {
                organizationId: context.organizationId,
                establishmentId: context.establishmentId,
                status: 'SUBMITTED',
                templateVersion: { approvalRequired: true }
            }
        },
        orderBy: { submittedAt: 'asc' },
        include: attemptInclude
    });
}

function findAttemptForApprover(attemptId, context, db = prisma) {
    return db.checklistExecutionAttempt.findFirst({
        where: {
            id: attemptId,
            run: { organizationId: context.organizationId, establishmentId: context.establishmentId }
        },
        include: attemptInclude
    });
}

function findEvidenceForApprover(evidenceId, context, db = prisma) {
    return db.checklistEvidence.findFirst({
        where: {
            id: evidenceId, status: 'AVAILABLE',
            response: { attempt: { run: { organizationId: context.organizationId, establishmentId: context.establishmentId } } }
        }
    });
}

function findHistory(runId, context, db = prisma) {
    return db.checklistRun.findFirst({
        where: { id: runId, organizationId: context.organizationId, establishmentId: context.establishmentId },
        include: {
            ...runInclude,
            events: {
                orderBy: { sequence: 'asc' },
                include: { actor: { select: { id: true, user: { select: { id: true, name: true, email: true } } } } }
            },
            attempts: { orderBy: { attemptNumber: 'asc' }, include: attemptInclude }
        }
    });
}

function reportWhere(context, filters) {
    const where = {
        organizationId: context.organizationId,
        establishmentId: context.establishmentId,
        dueAt: { gte: filters.from, lte: filters.to }
    };
    if (filters.responsibleMembershipId) where.assignedMembershipId = filters.responsibleMembershipId;
    if (filters.templateVersionId || filters.templateId) {
        where.templateVersion = {
            ...(filters.templateVersionId ? { id: filters.templateVersionId } : {}),
            ...(filters.templateId ? { templateId: filters.templateId } : {})
        };
    }
    return where;
}

function listReportRuns(context, filters, db = prisma) {
    return db.checklistRun.findMany({
        where: reportWhere(context, filters),
        orderBy: [{ dueAt: 'desc' }, { createdAt: 'desc' }],
        take: filters.maxRows + 1,
        select: {
            id: true, status: true, dueAt: true, createdAt: true, completedAt: true,
            assignedMembershipId: true,
            assignedTo: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
            templateVersion: {
                select: {
                    id: true, version: true,
                    template: { select: { id: true, name: true, category: true } }
                }
            },
            attempts: {
                where: { submittedAt: { not: null } },
                orderBy: { attemptNumber: 'desc' }, take: 1,
                select: {
                    id: true, attemptNumber: true, status: true, score: true, isCompliant: true,
                    criticalFailure: true, submittedAt: true, decidedAt: true,
                    executor: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
                    approvals: {
                        take: 1,
                        select: {
                            decision: true,
                            approver: { select: { id: true, user: { select: { id: true, name: true, email: true } } } }
                        }
                    },
                    responses: {
                        where: { outcome: 'FAIL' },
                        select: {
                            outcome: true,
                            item: { select: { id: true, stableKey: true, title: true, critical: true } }
                        }
                    }
                }
            }
        }
    });
}

async function listReportFilterOptions(context, db = prisma) {
    const scope = { organizationId: context.organizationId, establishmentId: context.establishmentId };
    const [templates, responsible] = await Promise.all([
        db.checklistRun.findMany({
            where: scope, distinct: ['templateVersionId'], orderBy: { templateVersionId: 'asc' },
            select: {
                templateVersion: {
                    select: { id: true, version: true, template: { select: { id: true, name: true } } }
                }
            }
        }),
        db.checklistRun.findMany({
            where: scope, distinct: ['assignedMembershipId'], orderBy: { assignedMembershipId: 'asc' },
            select: {
                assignedTo: { select: { id: true, user: { select: { id: true, name: true, email: true } } } }
            }
        })
    ]);
    return { templates, responsible };
}

const withSerializableTransaction = (callback, db = prisma) => db.$transaction(
    callback, { isolationLevel: 'Serializable' }
);

module.exports = {
    runInclude, attemptInclude, listPublishedTemplates, listActiveMemberships, findByClientRequest,
    findScoped, listScoped, listAssigned, findRunForExecutor, findAttemptForExecutor,
    findResponseForExecutor, findEvidenceForExecutor, listPendingApprovals, findAttemptForApprover,
    findEvidenceForApprover, findHistory, listReportRuns, listReportFilterOptions,
    reportWhere, withSerializableTransaction
};
