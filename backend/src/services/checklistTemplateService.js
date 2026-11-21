const { randomUUID } = require('node:crypto');
const AppError = require('../utils/AppError');
const repository = require('../repositories/checklistTemplateRepository');
const permissionResolver = require('./permissionResolverService');
const { getAuthorizationFlags } = require('../config/authorization');
const { validatePublishableChecklistTemplateVersion } = require('../validations/checklistTemplateValidation');
const { CHECKLIST_SCORING_ALGORITHM_VERSION } = require('../constants/checklistTemplates');

const MAX_TRANSACTION_RETRIES = 3;

const normalizeNullable = value => value?.trim() || null;
const numberValue = value => value === null || value === undefined ? null : Number(value);
const iso = value => value ? new Date(value).toISOString() : null;

function contextMembership(context) {
    return {
        id: context.membershipId,
        userId: context.userId,
        role: context.role,
        isActive: context.membershipActive !== false,
        establishmentActive: context.establishmentActive !== false,
        establishmentId: context.establishmentId,
        organizationId: context.organizationId
    };
}

async function capabilities(context, options = {}) {
    const decision = await permissionResolver.resolve({
        capability: 'checklists.templates.manage',
        legacyRoles: ['ADMIN'],
        membership: contextMembership(context),
        flags: options.flags || getAuthorizationFlags(),
        repository: options.permissionRepository
    });
    return { 'checklists.templates.manage': decision.allowed };
}

function itemDto(item) {
    return {
        ...item,
        maxPoints: numberValue(item.maxPoints),
        createdAt: iso(item.createdAt),
        updatedAt: iso(item.updatedAt)
    };
}

function sectionDto(section) {
    return {
        ...section,
        createdAt: iso(section.createdAt),
        updatedAt: iso(section.updatedAt),
        items: (section.items || []).map(itemDto)
    };
}

function versionDto(version) {
    return {
        ...version,
        passingScore: numberValue(version.passingScore),
        createdAt: iso(version.createdAt),
        updatedAt: iso(version.updatedAt),
        publishedAt: iso(version.publishedAt),
        retiredAt: iso(version.retiredAt),
        sections: version.sections ? version.sections.map(sectionDto) : undefined
    };
}

function templateDto(template) {
    return {
        ...template,
        createdAt: iso(template.createdAt),
        updatedAt: iso(template.updatedAt),
        versions: (template.versions || []).map(versionDto)
    };
}

function ensureTemplate(template) {
    if (!template) throw new AppError('Modelo de checklist não encontrado.', 404);
    return template;
}

function draftFrom(template) {
    const draft = template.versions.find(version => version.status === 'DRAFT');
    if (!draft) throw new AppError('Este modelo não possui rascunho editável.', 409);
    return draft;
}

function assertExpectedTimestamp(version, expectedUpdatedAt) {
    if (new Date(version.updatedAt).getTime() !== new Date(expectedUpdatedAt).getTime()) {
        throw new AppError('O rascunho foi alterado em outra sessão. Recarregue antes de continuar.', 409);
    }
}

function publishableInput(version) {
    return {
        version: version.version,
        approvalRequired: version.approvalRequired,
        passingScore: numberValue(version.passingScore),
        scoringAlgorithmVersion: version.scoringAlgorithmVersion,
        sections: version.sections.map(section => ({
            stableKey: section.stableKey,
            title: section.title,
            description: section.description,
            position: section.position,
            items: section.items.map(item => ({
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
            }))
        }))
    };
}

function translateDatabaseError(error) {
    if (error instanceof AppError) throw error;
    if (error?.code === 'P2002') throw new AppError('Já existe um rascunho ou código igual para este modelo.', 409);
    if (error?.code === 'P2034') throw new AppError('Conflito concorrente. Recarregue e tente novamente.', 409);
    if (error?.code === 'P2004' || /checklist_/i.test(error?.message || '')) {
        throw new AppError('A operação viola uma regra de integridade do modelo.', 422);
    }
    throw error;
}

async function serializable(callback, db) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt += 1) {
        try {
            return await repository.withSerializableTransaction(callback, db);
        } catch (error) {
            lastError = error;
            if (error?.code !== 'P2034' || attempt === MAX_TRANSACTION_RETRIES) break;
        }
    }
    return translateDatabaseError(lastError);
}

async function list(context, options = {}) {
    const templates = await repository.listByOrganization(context.organizationId, options.db);
    return templates.map(templateDto);
}

async function get(context, templateId, options = {}) {
    return templateDto(ensureTemplate(await repository.findScoped(templateId, context.organizationId, options.db)));
}

function internalCode(name) {
    const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 55) || 'checklist';
    return `${slug}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

async function create(context, input, options = {}) {
    try {
        const id = await serializable(async tx => {
            const template = await tx.checklistTemplate.create({
                data: {
                    organizationId: context.organizationId,
                    code: internalCode(input.name),
                    name: input.name,
                    category: normalizeNullable(input.category),
                    description: normalizeNullable(input.description),
                    createdByMembershipId: context.membershipId,
                    versions: {
                        create: {
                            version: 1,
                            status: 'DRAFT',
                            approvalRequired: input.approvalRequired,
                            passingScore: input.passingScore,
                            scoringAlgorithmVersion: CHECKLIST_SCORING_ALGORITHM_VERSION,
                            createdByMembershipId: context.membershipId
                        }
                    }
                },
                select: { id: true }
            });
            return template.id;
        }, options.db);
        return get(context, id, options);
    } catch (error) {
        return translateDatabaseError(error);
    }
}

async function saveDraft(context, templateId, input, options = {}) {
    try {
        await serializable(async tx => {
            const template = ensureTemplate(await repository.findScoped(templateId, context.organizationId, tx));
            const draft = draftFrom(template);
            assertExpectedTimestamp(draft, input.expectedUpdatedAt);
            const now = new Date();
            const locked = await tx.checklistTemplateVersion.updateMany({
                where: { id: draft.id, status: 'DRAFT', updatedAt: draft.updatedAt },
                data: {
                    approvalRequired: input.approvalRequired,
                    passingScore: input.passingScore,
                    updatedAt: now
                }
            });
            if (locked.count !== 1) throw new AppError('O rascunho foi alterado em outra sessão.', 409);

            await tx.checklistTemplate.update({
                where: { id: template.id },
                data: {
                    name: input.name,
                    category: normalizeNullable(input.category),
                    description: normalizeNullable(input.description)
                }
            });
            await tx.checklistTemplateItem.deleteMany({ where: { templateVersionId: draft.id } });
            await tx.checklistTemplateSection.deleteMany({ where: { templateVersionId: draft.id } });
            for (const section of input.sections) {
                const createdSection = await tx.checklistTemplateSection.create({
                    data: {
                        templateVersionId: draft.id,
                        stableKey: section.stableKey,
                        title: section.title,
                        description: normalizeNullable(section.description),
                        position: section.position
                    }
                });
                if (section.items.length) {
                    await tx.checklistTemplateItem.createMany({
                        data: section.items.map(item => ({
                            templateVersionId: draft.id,
                            sectionId: createdSection.id,
                            stableKey: item.stableKey,
                            title: item.title,
                            instructions: normalizeNullable(item.instructions),
                            position: item.position,
                            responseType: item.responseType,
                            required: item.required,
                            allowNotApplicable: item.allowNotApplicable,
                            critical: item.critical,
                            evidenceRequired: item.evidenceRequired,
                            maxPoints: item.maxPoints,
                            answerConfigJson: item.answerConfigJson ?? undefined,
                            scoringConfigJson: item.scoringConfigJson ?? undefined
                        }))
                    });
                }
            }
        }, options.db);
        return get(context, templateId, options);
    } catch (error) {
        return translateDatabaseError(error);
    }
}

async function publish(context, templateId, input, options = {}) {
    try {
        await serializable(async tx => {
            const template = ensureTemplate(await repository.findScoped(templateId, context.organizationId, tx));
            const draft = draftFrom(template);
            assertExpectedTimestamp(draft, input.expectedUpdatedAt);
            try {
                validatePublishableChecklistTemplateVersion(publishableInput(draft));
            } catch (error) {
                throw new AppError(error.issues?.[0]?.message || 'O modelo está incompleto para publicação.', 422);
            }
            const now = new Date();
            const updated = await tx.checklistTemplateVersion.updateMany({
                where: { id: draft.id, status: 'DRAFT', updatedAt: draft.updatedAt },
                data: {
                    status: 'PUBLISHED',
                    publishedByMembershipId: context.membershipId,
                    publishedAt: now,
                    updatedAt: now
                }
            });
            if (updated.count !== 1) throw new AppError('A publicação entrou em conflito com outra sessão.', 409);
        }, options.db);
        return get(context, templateId, options);
    } catch (error) {
        return translateDatabaseError(error);
    }
}

async function cloneVersion(context, templateId, input, options = {}) {
    try {
        await serializable(async tx => {
            const template = ensureTemplate(await repository.findScoped(templateId, context.organizationId, tx));
            if (template.versions.some(version => version.status === 'DRAFT')) {
                throw new AppError('Já existe um rascunho para este modelo.', 409);
            }
            const source = template.versions.find(version => version.id === input.sourceVersionId);
            if (!source || !['PUBLISHED', 'RETIRED'].includes(source.status)) {
                throw new AppError('A versão de origem precisa estar publicada ou retirada.', 422);
            }
            const nextNumber = Math.max(...template.versions.map(version => version.version), 0) + 1;
            const created = await tx.checklistTemplateVersion.create({
                data: {
                    templateId,
                    version: nextNumber,
                    status: 'DRAFT',
                    approvalRequired: source.approvalRequired,
                    passingScore: source.passingScore,
                    scoringAlgorithmVersion: source.scoringAlgorithmVersion,
                    sourceVersionId: source.id,
                    createdByMembershipId: context.membershipId
                }
            });
            for (const section of source.sections) {
                const createdSection = await tx.checklistTemplateSection.create({
                    data: {
                        templateVersionId: created.id,
                        stableKey: section.stableKey,
                        title: section.title,
                        description: section.description,
                        position: section.position
                    }
                });
                if (section.items.length) {
                    await tx.checklistTemplateItem.createMany({
                        data: section.items.map(item => ({
                            templateVersionId: created.id,
                            sectionId: createdSection.id,
                            stableKey: item.stableKey,
                            title: item.title,
                            instructions: item.instructions,
                            position: item.position,
                            responseType: item.responseType,
                            required: item.required,
                            allowNotApplicable: item.allowNotApplicable,
                            critical: item.critical,
                            evidenceRequired: item.evidenceRequired,
                            maxPoints: item.maxPoints,
                            answerConfigJson: item.answerConfigJson ?? undefined,
                            scoringConfigJson: item.scoringConfigJson ?? undefined
                        }))
                    });
                }
            }
        }, options.db);
        return get(context, templateId, options);
    } catch (error) {
        return translateDatabaseError(error);
    }
}

async function retire(context, templateId, versionId, input, options = {}) {
    try {
        await serializable(async tx => {
            const version = await repository.findVersionScoped(versionId, templateId, context.organizationId, tx);
            if (!version) throw new AppError('Versão não encontrada.', 404);
            if (version.status !== 'PUBLISHED') throw new AppError('Somente uma versão publicada pode ser retirada.', 409);
            assertExpectedTimestamp(version, input.expectedUpdatedAt);
            const now = new Date();
            const updated = await tx.checklistTemplateVersion.updateMany({
                where: { id: version.id, status: 'PUBLISHED', updatedAt: version.updatedAt },
                data: { status: 'RETIRED', retiredAt: now, updatedAt: now }
            });
            if (updated.count !== 1) throw new AppError('A retirada entrou em conflito com outra sessão.', 409);
        }, options.db);
        return get(context, templateId, options);
    } catch (error) {
        return translateDatabaseError(error);
    }
}

module.exports = {
    capabilities,
    list,
    get,
    create,
    saveDraft,
    publish,
    cloneVersion,
    retire,
    publishableInput,
    templateDto
};
