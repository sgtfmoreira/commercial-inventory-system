const test = require('node:test');
const assert = require('node:assert/strict');
const { createOrganizationAuthorityService } = require('../src/services/organizationAuthorityService');

const context = overrides => ({
    organizationId: 'org-a',
    establishmentId: 'est-a',
    actorUserId: 'owner-a',
    actorMembershipId: 'membership-owner-a',
    ...overrides
});

function fixture({ actorIsOwner = true, targetMembership = true, activeOwners = 2 } = {}) {
    const calls = { audits: [], transactionOptions: null };
    const tx = {
        organizationAuthority: {
            findFirst: async args => {
                if (args.where.userId === 'owner-a') return actorIsOwner ? { id: 'authority-source', userId: 'owner-a', isActive: true } : null;
                if (args.where.userId === 'target-a') return { id: 'authority-target', userId: 'target-a', isActive: true };
                return null;
            },
            findUnique: async () => null,
            findMany: async () => [],
            count: async () => activeOwners,
            upsert: async args => ({
                id: 'authority-target',
                userId: args.create.userId,
                isActive: true,
                verificationMethod: args.create.verificationMethod || args.update.verificationMethod
            }),
            update: async args => ({
                id: args.where.id,
                userId: args.where.id === 'authority-source' ? 'owner-a' : 'target-a',
                isActive: args.data.isActive,
                verificationMethod: 'ASSISTED_VERIFICATION'
            })
        },
        userEstablishment: {
            findFirst: async args => targetMembership
                ? { id: 'membership-target', establishmentId: 'est-a', userId: args.where.userId }
                : null
        }
    };
    const db = {
        ...tx,
        $transaction: async (callback, options) => {
            calls.transactionOptions = options;
            return callback(tx);
        }
    };
    const audit = { create: async (event, auditTx) => calls.audits.push({ event, auditTx }) };
    return { tx, db, audit, calls };
}

test('não existe bootstrap implícito: sem OWNER ativo ninguém designa o primeiro OWNER', async () => {
    const f = fixture({ actorIsOwner: false });
    const service = createOrganizationAuthorityService({ db: f.db, audit: f.audit });
    await assert.rejects(
        () => service.designateOwner(context(), { targetUserId: 'target-a', verificationMethod: 'ASSISTED_VERIFICATION' }),
        error => error.statusCode === 403
    );
    assert.equal(f.calls.audits.length, 0);
});

test('OWNER explícito designa outro OWNER dentro do tenant em transação auditada', async () => {
    const f = fixture();
    const service = createOrganizationAuthorityService({ db: f.db, audit: f.audit });
    const authority = await service.designateOwner(context(), {
        targetUserId: 'target-a',
        verificationMethod: 'ASSISTED_VERIFICATION'
    });
    assert.equal(authority.isActive, true);
    assert.equal(f.calls.transactionOptions.isolationLevel, 'Serializable');
    assert.equal(f.calls.audits.length, 1);
    assert.equal(f.calls.audits[0].auditTx, f.tx);
    assert.equal(f.calls.audits[0].event.eventType, 'ORGANIZATION_OWNER_DESIGNATED');
    assert.equal(f.calls.audits[0].event.organizationId, 'org-a');
});

test('autoelevação e alvo cross-tenant são bloqueados', async () => {
    const f = fixture({ targetMembership: false });
    const service = createOrganizationAuthorityService({ db: f.db, audit: f.audit });
    await assert.rejects(
        () => service.designateOwner(context(), { targetUserId: 'owner-a', verificationMethod: 'ASSISTED_VERIFICATION' }),
        error => error.statusCode === 403
    );
    await assert.rejects(
        () => service.designateOwner(context(), { targetUserId: 'target-a', verificationMethod: 'ASSISTED_VERIFICATION' }),
        error => error.statusCode === 404
    );
});

test('último OWNER ativo e autorrevogação permanecem protegidos', async () => {
    const last = fixture({ activeOwners: 1 });
    const service = createOrganizationAuthorityService({ db: last.db, audit: last.audit });
    await assert.rejects(
        () => service.revokeOwner(context(), { targetUserId: 'target-a', reason: 'Transferência administrativa validada' }),
        error => error.statusCode === 409
    );
    await assert.rejects(
        () => service.revokeOwner(context(), { targetUserId: 'owner-a', reason: 'Auto revogação indevida' }),
        error => error.statusCode === 403
    );
});

test('transferência troca OWNER atomicamente e registra uma auditoria', async () => {
    const f = fixture();
    const service = createOrganizationAuthorityService({ db: f.db, audit: f.audit });
    const result = await service.transferOwnership(context(), {
        targetUserId: 'target-a',
        verificationMethod: 'LEGAL_DOCUMENT_REVIEW',
        reason: 'Transferência contratual confirmada'
    });
    assert.equal(result.source.isActive, false);
    assert.equal(result.target.isActive, true);
    assert.equal(f.calls.transactionOptions.isolationLevel, 'Serializable');
    assert.equal(f.calls.audits[0].event.eventType, 'ORGANIZATION_OWNERSHIP_TRANSFERRED');
});
