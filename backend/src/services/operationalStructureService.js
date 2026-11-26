const prisma = require('../utils/prisma');
const AppError = require('../utils/AppError');
const repository = require('../repositories/operationalStructureRepository');
const auditRepository = require('../repositories/securityAuditRepository');
const permissionResolver = require('./permissionResolverService');
const userAccessRepository = require('../repositories/userAccessRepository');
const { getAuthorizationFlags } = require('../config/authorization');

const CAPABILITIES = Object.freeze({
    'operational_structure.read': ['ADMIN', 'MANAGER'],
    'operational_sectors.manage': ['ADMIN', 'MANAGER'],
    'operational_functions.manage': ['ADMIN', 'MANAGER'],
    'operational_assignments.manage': ['ADMIN', 'MANAGER']
});

function cleanName(value) {
    return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function normalizedName(value) {
    return cleanName(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

const nullableText = value => value === null || value === undefined || value === '' ? null : String(value).trim();
const booleanFilter = value => value === 'true' ? true : value === 'false' ? false : undefined;

function sectorDto(item) {
    return {
        id: item.id, name: item.name, description: item.description, isActive: item.isActive,
        version: item.version, roleCount: item._count?.roles || 0,
        createdAt: item.createdAt, updatedAt: item.updatedAt, deactivatedAt: item.deactivatedAt
    };
}

function roleDto(item) {
    return {
        id: item.id, sectorId: item.sectorId, name: item.name, description: item.description,
        isActive: item.isActive, version: item.version, sector: item.sector,
        createdAt: item.createdAt, updatedAt: item.updatedAt, deactivatedAt: item.deactivatedAt
    };
}

function assignmentDto(item) {
    return {
        id: item.id, membershipId: item.membershipId, operationalRoleId: item.operationalRoleId,
        operationalRole: item.operationalRole ? {
            id: item.operationalRole.id, name: item.operationalRole.name, isActive: item.operationalRole.isActive,
            sector: item.operationalRole.sector
        } : undefined,
        isPrimary: item.isPrimary, status: item.status, version: item.version,
        validFrom: item.validFrom, validUntil: item.validUntil,
        reason: item.reason, createdAt: item.createdAt, endedAt: item.endedAt
    };
}

function membershipDto(item) {
    return {
        id: item.id, name: item.user.name, email: item.user.email,
        legacyRole: item.role, isActive: item.isActive, createdAt: item.createdAt,
        assignments: (item.operationalRoleAssignments || []).map(assignmentDto)
    };
}

async function assertScope(context, db = prisma, source = repository) {
    if (!context?.userId || !context?.membershipId || !context?.organizationId || !context?.establishmentId) {
        throw new AppError('Contexto organizacional inválido.', 403);
    }
    const scope = await source.findScope(context, db);
    if (!scope || scope.users.length !== 1) throw new AppError('Contexto organizacional inválido.', 403);
    return scope;
}

function membership(context) {
    return {
        id: context.membershipId, userId: context.userId, role: context.role,
        isActive: context.membershipActive !== false,
        establishmentActive: context.establishmentActive !== false,
        establishmentId: context.establishmentId, organizationId: context.organizationId
    };
}

async function capabilities(context, options = {}) {
    await assertScope(context, options.db, options.repository || repository);
    const flags = options.flags || getAuthorizationFlags();
    const permissionRepository = options.permissionRepository || userAccessRepository;
    const entries = await Promise.all(Object.entries(CAPABILITIES).map(async ([capability, legacyRoles]) => {
        const decision = await permissionResolver.resolve({
            capability, legacyRoles, membership: membership(context), flags,
            repository: permissionRepository
        });
        return [capability, decision.allowed];
    }));
    return Object.fromEntries(entries);
}

function audit(context, eventType, entityType, entityId, beforeJson, afterJson, target = {}) {
    return {
        organizationId: context.organizationId,
        establishmentId: context.establishmentId,
        actorUserId: context.userId,
        actorMembershipId: context.membershipId,
        eventType, entityType, entityId, beforeJson, afterJson,
        targetUserId: target.userId, targetMembershipId: target.membershipId
    };
}

function translate(error) {
    if (error instanceof AppError) throw error;
    if (error?.code === 'P2002') throw new AppError('Já existe um cadastro com esse nome nesta unidade.', 409);
    if (error?.code === 'P2003') throw new AppError('O relacionamento informado não pertence a esta unidade.', 422);
    throw error;
}

async function listSectors(context, query = {}, options = {}) {
    const source = options.repository || repository;
    await assertScope(context, options.db, source);
    const rows = await source.listSectors(context, {
        search: query.search ? normalizedName(query.search) : undefined,
        isActive: booleanFilter(query.active)
    }, options.db);
    return rows.map(sectorDto);
}

async function getSector(context, id, options = {}) {
    const source = options.repository || repository;
    await assertScope(context, options.db, source);
    const item = await source.findSector(id, context, options.db);
    if (!item) throw new AppError('Setor operacional não encontrado.', 404);
    return sectorDto(item);
}

async function createSector(context, input, options = {}) {
    const source = options.repository || repository;
    try {
        return await (options.db || prisma).$transaction(async tx => {
            await assertScope(context, tx, source);
            const name = cleanName(input.name);
            const key = normalizedName(name);
            if (await source.findSectorByName(key, context, null, tx)) {
                throw new AppError('Já existe um setor com esse nome nesta unidade.', 409);
            }
            const item = await source.createSector({
                organizationId: context.organizationId, establishmentId: context.establishmentId,
                name, normalizedName: key, description: nullableText(input.description),
                createdByMembershipId: context.membershipId, updatedByMembershipId: context.membershipId
            }, tx);
            const dto = sectorDto(item);
            await auditRepository.create(audit(context, 'OPERATIONAL_SECTOR_CREATED', 'OPERATIONAL_SECTOR', item.id, null, dto), tx);
            return dto;
        });
    } catch (error) { return translate(error); }
}

async function updateSector(context, id, input, options = {}) {
    const source = options.repository || repository;
    try {
        return await (options.db || prisma).$transaction(async tx => {
            await assertScope(context, tx, source);
            const existing = await source.findSector(id, context, tx);
            if (!existing) throw new AppError('Setor operacional não encontrado.', 404);
            const data = { updatedByMembershipId: context.membershipId };
            if (input.name !== undefined) {
                data.name = cleanName(input.name);
                data.normalizedName = normalizedName(data.name);
                if (await source.findSectorByName(data.normalizedName, context, id, tx)) {
                    throw new AppError('Já existe um setor com esse nome nesta unidade.', 409);
                }
            }
            if (input.description !== undefined) data.description = nullableText(input.description);
            const item = await source.updateSector(id, context, input.version, data, tx);
            if (!item) throw new AppError('O setor foi alterado em outra sessão.', 409);
            const before = sectorDto(existing);
            const after = sectorDto(item);
            await auditRepository.create(audit(context, 'OPERATIONAL_SECTOR_UPDATED', 'OPERATIONAL_SECTOR', id, before, after), tx);
            return after;
        });
    } catch (error) { return translate(error); }
}

async function setSectorStatus(context, id, input, options = {}) {
    const source = options.repository || repository;
    try {
        return await (options.db || prisma).$transaction(async tx => {
            await assertScope(context, tx, source);
            const existing = await source.findSector(id, context, tx);
            if (!existing) throw new AppError('Setor operacional não encontrado.', 404);
            if (existing.isActive === input.isActive) return sectorDto(existing);
            if (!input.isActive && await source.countActiveRoles(id, context, tx)) {
                throw new AppError('Desative as funções ativas deste setor antes de desativá-lo.', 409);
            }
            const item = await source.updateSector(id, context, input.version, {
                isActive: input.isActive,
                deactivatedAt: input.isActive ? null : new Date(),
                updatedByMembershipId: context.membershipId
            }, tx);
            if (!item) throw new AppError('O setor foi alterado em outra sessão.', 409);
            const before = sectorDto(existing);
            const after = sectorDto(item);
            await auditRepository.create(audit(context, input.isActive ? 'OPERATIONAL_SECTOR_ACTIVATED' : 'OPERATIONAL_SECTOR_DEACTIVATED', 'OPERATIONAL_SECTOR', id, before, after), tx);
            return after;
        });
    } catch (error) { return translate(error); }
}

async function listRoles(context, query = {}, options = {}) {
    const source = options.repository || repository;
    await assertScope(context, options.db, source);
    const rows = await source.listRoles(context, {
        search: query.search ? normalizedName(query.search) : undefined,
        isActive: booleanFilter(query.active), sectorId: query.sectorId
    }, options.db);
    return rows.map(roleDto);
}

async function getRole(context, id, options = {}) {
    const source = options.repository || repository;
    await assertScope(context, options.db, source);
    const item = await source.findRole(id, context, options.db);
    if (!item) throw new AppError('Função operacional não encontrada.', 404);
    return roleDto(item);
}

async function assertActiveSector(context, sectorId, source, db) {
    const sector = await source.findSector(sectorId, context, db);
    if (!sector) throw new AppError('Setor operacional não encontrado.', 404);
    if (!sector.isActive) throw new AppError('Não é possível vincular uma função a um setor inativo.', 409);
    return sector;
}

async function createRole(context, input, options = {}) {
    const source = options.repository || repository;
    try {
        return await (options.db || prisma).$transaction(async tx => {
            await assertScope(context, tx, source);
            await assertActiveSector(context, input.sectorId, source, tx);
            const name = cleanName(input.name);
            const key = normalizedName(name);
            if (await source.findRoleByName(key, context, null, tx)) {
                throw new AppError('Já existe uma função com esse nome nesta unidade.', 409);
            }
            const item = await source.createRole({
                organizationId: context.organizationId, establishmentId: context.establishmentId,
                sectorId: input.sectorId, name, normalizedName: key,
                description: nullableText(input.description),
                createdByMembershipId: context.membershipId, updatedByMembershipId: context.membershipId
            }, tx);
            const dto = roleDto(item);
            await auditRepository.create(audit(context, 'OPERATIONAL_ROLE_CREATED', 'OPERATIONAL_ROLE', item.id, null, dto), tx);
            return dto;
        });
    } catch (error) { return translate(error); }
}

async function updateRole(context, id, input, options = {}) {
    const source = options.repository || repository;
    try {
        return await (options.db || prisma).$transaction(async tx => {
            await assertScope(context, tx, source);
            const existing = await source.findRole(id, context, tx);
            if (!existing) throw new AppError('Função operacional não encontrada.', 404);
            const data = { updatedByMembershipId: context.membershipId };
            if (input.sectorId !== undefined) {
                await assertActiveSector(context, input.sectorId, source, tx);
                data.sectorId = input.sectorId;
            }
            if (input.name !== undefined) {
                data.name = cleanName(input.name);
                data.normalizedName = normalizedName(data.name);
                if (await source.findRoleByName(data.normalizedName, context, id, tx)) {
                    throw new AppError('Já existe uma função com esse nome nesta unidade.', 409);
                }
            }
            if (input.description !== undefined) data.description = nullableText(input.description);
            const item = await source.updateRole(id, context, input.version, data, tx);
            if (!item) throw new AppError('A função foi alterada em outra sessão.', 409);
            const before = roleDto(existing);
            const after = roleDto(item);
            await auditRepository.create(audit(context, 'OPERATIONAL_ROLE_UPDATED', 'OPERATIONAL_ROLE', id, before, after), tx);
            return after;
        });
    } catch (error) { return translate(error); }
}

async function setRoleStatus(context, id, input, options = {}) {
    const source = options.repository || repository;
    try {
        return await (options.db || prisma).$transaction(async tx => {
            await assertScope(context, tx, source);
            const existing = await source.findRole(id, context, tx);
            if (!existing) throw new AppError('Função operacional não encontrada.', 404);
            if (existing.isActive === input.isActive) return roleDto(existing);
            if (input.isActive) await assertActiveSector(context, existing.sectorId, source, tx);
            if (!input.isActive && await source.countActiveAssignments(id, context, tx)) {
                throw new AppError('Encerre os vínculos ativos desta função antes de desativá-la.', 409);
            }
            const item = await source.updateRole(id, context, input.version, {
                isActive: input.isActive,
                deactivatedAt: input.isActive ? null : new Date(),
                updatedByMembershipId: context.membershipId
            }, tx);
            if (!item) throw new AppError('A função foi alterada em outra sessão.', 409);
            const before = roleDto(existing);
            const after = roleDto(item);
            await auditRepository.create(audit(context, input.isActive ? 'OPERATIONAL_ROLE_ACTIVATED' : 'OPERATIONAL_ROLE_DEACTIVATED', 'OPERATIONAL_ROLE', id, before, after), tx);
            return after;
        });
    } catch (error) { return translate(error); }
}

async function listMemberships(context, query = {}, options = {}) {
    const source = options.repository || repository;
    await assertScope(context, options.db, source);
    const rows = await source.listMemberships(context, {
        search: query.search || undefined,
        isActive: booleanFilter(query.active)
    }, options.db);
    return rows.map(membershipDto);
}

async function listMembershipRoles(context, membershipId, options = {}) {
    const source = options.repository || repository;
    await assertScope(context, options.db, source);
    const target = await source.findMembership(membershipId, context, options.db);
    if (!target) throw new AppError('Funcionário não encontrado nesta unidade.', 404);
    return (await source.listMembershipRoles(membershipId, context, options.db)).map(assignmentDto);
}

function parseDate(value, fallback) {
    const date = value ? new Date(value) : fallback;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new AppError('Data inválida.', 422);
    return date;
}

async function createMembershipRole(context, membershipId, input, options = {}) {
    const source = options.repository || repository;
    try {
        return await (options.db || prisma).$transaction(async tx => {
            await assertScope(context, tx, source);
            const target = await source.findMembership(membershipId, context, tx);
            if (!target) throw new AppError('Funcionário não encontrado nesta unidade.', 404);
            if (!target.isActive) throw new AppError('Não é possível vincular função a um funcionário inativo.', 409);
            const role = await source.findRole(input.operationalRoleId, context, tx);
            if (!role) throw new AppError('Função operacional não encontrada.', 404);
            if (!role.isActive || !role.sector?.isActive) throw new AppError('A função e seu setor precisam estar ativos.', 409);
            if (await source.findActiveAssignment(membershipId, role.id, context, tx)) {
                throw new AppError('O funcionário já possui esta função ativa.', 409);
            }
            if (input.isPrimary && await source.findActivePrimary(membershipId, context, tx)) {
                throw new AppError('O funcionário já possui uma função principal ativa.', 409);
            }
            const now = new Date();
            const validFrom = parseDate(input.validFrom, now);
            if (validFrom.getTime() > now.getTime() + 60000) {
                throw new AppError('A vigência inicial não pode estar no futuro.', 422);
            }
            const item = await source.createAssignment({
                organizationId: context.organizationId, establishmentId: context.establishmentId,
                membershipId, operationalRoleId: role.id, validFrom,
                isPrimary: Boolean(input.isPrimary), reason: nullableText(input.reason),
                createdByMembershipId: context.membershipId
            }, tx);
            const dto = assignmentDto(item);
            await auditRepository.create(audit(
                context, 'MEMBERSHIP_OPERATIONAL_ROLE_ASSIGNED', 'MEMBERSHIP_OPERATIONAL_ROLE', item.id,
                null, dto, { userId: target.userId, membershipId: target.id }
            ), tx);
            return dto;
        });
    } catch (error) { return translate(error); }
}

async function endMembershipRole(context, id, input, options = {}) {
    const source = options.repository || repository;
    try {
        return await (options.db || prisma).$transaction(async tx => {
            await assertScope(context, tx, source);
            const existing = await source.findAssignment(id, context, tx);
            if (!existing) throw new AppError('Vínculo operacional não encontrado.', 404);
            if (existing.status === 'ENDED') {
                if (existing.version !== input.version) throw new AppError('O vínculo foi alterado em outra sessão.', 409);
                return assignmentDto(existing);
            }
            const endedAt = parseDate(input.endedAt, new Date());
            if (endedAt.getTime() > Date.now() + 60000) throw new AppError('A data de encerramento não pode estar no futuro.', 422);
            if (endedAt <= new Date(existing.validFrom)) throw new AppError('A data de encerramento deve ser posterior ao início.', 422);
            const item = await source.endAssignment(id, context, input.version, {
                status: 'ENDED', validUntil: endedAt, endedAt,
                endedByMembershipId: context.membershipId, reason: input.reason.trim()
            }, tx);
            if (!item) throw new AppError('O vínculo foi alterado em outra sessão.', 409);
            const before = assignmentDto(existing);
            const after = assignmentDto(item);
            const target = await source.findMembership(existing.membershipId, context, tx);
            await auditRepository.create(audit(
                context, 'MEMBERSHIP_OPERATIONAL_ROLE_ENDED', 'MEMBERSHIP_OPERATIONAL_ROLE', id,
                before, after, { userId: target?.userId, membershipId: existing.membershipId }
            ), tx);
            return after;
        });
    } catch (error) { return translate(error); }
}

module.exports = {
    CAPABILITIES, cleanName, normalizedName, sectorDto, roleDto, assignmentDto, membershipDto, capabilities,
    listSectors, getSector, createSector, updateSector, setSectorStatus,
    listRoles, getRole, createRole, updateRole, setRoleStatus,
    listMemberships, listMembershipRoles, createMembershipRole, endMembershipRole
};
