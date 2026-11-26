const test = require('node:test');
const assert = require('node:assert/strict');

const { applyProfile, resolve } = require('../src/services/permissionResolverService');

const membership = {
    id: 'membership-1',
    role: 'STAFF',
    isActive: true,
    establishmentActive: true
};

test('feature flag e kill switch preservam exatamente o caminho LEGACY', async () => {
    const repository = { findAuthorizationContext: async () => { throw new Error('não deve consultar'); } };
    assert.equal((await resolve({
        capability: 'production.create', legacyRoles: '*', membership,
        flags: { enabled: false, killSwitch: false }, repository
    })).allowed, true);
    assert.equal((await resolve({
        capability: 'users.create', legacyRoles: ['ADMIN'], membership,
        flags: { enabled: true, killSwitch: true }, repository
    })).allowed, false);
});

test('ausência de acesso e DRAFT sem ACTIVE não alteram autorização legada', async () => {
    const missing = { findAuthorizationContext: async () => null };
    const decision = await resolve({
        capability: 'production.create', legacyRoles: '*', membership,
        flags: { enabled: true, killSwitch: false }, repository: missing
    });
    assert.deepEqual({ allowed: decision.allowed, mode: decision.mode }, { allowed: true, mode: 'LEGACY' });

    const draftOnly = {
        findAuthorizationContext: async () => ({ mode: 'LEGACY', configurations: [{ status: 'DRAFT' }] })
    };
    assert.equal((await resolve({
        capability: 'production.create', legacyRoles: '*', membership,
        flags: { enabled: true, killSwitch: false }, repository: draftOnly
    })).allowed, true);
});

test('PROFILED aplica DENY antes de ALLOW e falha fechado sem configuração ativa', async () => {
    const repository = {
        findAuthorizationContext: async () => ({
            mode: 'PROFILED', version: 4, configurations: [{
                profileCode: 'COLLABORATOR', profileVersion: 1,
                overrides: [
                    { permissionCode: 'products.read', effect: 'ALLOW' },
                    { permissionCode: 'products.read', effect: 'DENY' }
                ]
            }]
        })
    };
    const denied = await resolve({
        capability: 'products.read', legacyRoles: '*', membership,
        flags: { enabled: true, killSwitch: false }, repository
    });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'override_deny');

    const noActive = { findAuthorizationContext: async () => ({ mode: 'PROFILED', configurations: [] }) };
    assert.equal((await resolve({
        capability: 'products.read', legacyRoles: '*', membership,
        flags: { enabled: true, killSwitch: false }, repository: noActive
    })).allowed, false);
});

test('AUDITOR recebe somente concessão financeira específica com ALLOW', () => {
    const base = applyProfile({ profileCode: 'AUDITOR', profileVersion: 1, overrides: [] });
    assert.equal(base.permissions.has('reports.financial.read'), false);
    const allowed = applyProfile({
        profileCode: 'AUDITOR', profileVersion: 1,
        overrides: [{ permissionCode: 'reports.financial.read', effect: 'ALLOW' }]
    });
    assert.equal(allowed.permissions.has('reports.financial.read'), true);
    const structural = applyProfile({
        profileCode: 'AUDITOR', profileVersion: 1,
        overrides: [{ permissionCode: 'security.owner.manage', effect: 'ALLOW' }]
    });
    assert.equal(structural.permissions.has('security.owner.manage'), false);
});

test('perfil OWNER da unidade não substitui autoridade organizacional explícita', async () => {
    const baseAccess = {
        mode: 'PROFILED', version: 1,
        configurations: [{ profileCode: 'OWNER', profileVersion: 1, overrides: [] }]
    };
    const ownerMembership = { ...membership, userId: 'user-1', organizationId: 'org-1' };
    const deniedRepository = {
        findAuthorizationContext: async () => baseAccess,
        hasOrganizationAuthority: async () => false
    };
    const denied = await resolve({
        capability: 'billing.manage', legacyRoles: ['ADMIN'], membership: ownerMembership,
        flags: { enabled: true, killSwitch: false }, repository: deniedRepository
    });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'organization_authority_required');

    const allowed = await resolve({
        capability: 'billing.manage', legacyRoles: ['ADMIN'], membership: ownerMembership,
        flags: { enabled: true, killSwitch: false },
        repository: { ...deniedRepository, hasOrganizationAuthority: async () => true }
    });
    assert.equal(allowed.allowed, true);
});

test('checklist run management is indelegable and restricted to ADMINISTRATOR/MANAGER', () => {
    for (const profileCode of ['OWNER', 'SUPERVISOR', 'COLLABORATOR', 'AUDITOR']) {
        const effective = applyProfile({
            profileCode,
            profileVersion: 1,
            overrides: [{ permissionCode: 'checklists.runs.manage', effect: 'ALLOW' }]
        });
        assert.equal(effective.permissions.has('checklists.runs.manage'), false, profileCode);
    }

    for (const profileCode of ['ADMINISTRATOR', 'MANAGER']) {
        const base = applyProfile({ profileCode, profileVersion: 1, overrides: [] });
        assert.equal(base.permissions.has('checklists.runs.manage'), true, profileCode);
        const denied = applyProfile({
            profileCode,
            profileVersion: 1,
            overrides: [{ permissionCode: 'checklists.runs.manage', effect: 'DENY' }]
        });
        assert.equal(denied.permissions.has('checklists.runs.manage'), false, profileCode);
        assert.equal(denied.denied.has('checklists.runs.manage'), true, profileCode);
    }
});

test('operational assignment management is indelegable and restricted to ADMINISTRATOR/MANAGER', () => {
    for (const profileCode of ['OWNER', 'SUPERVISOR', 'COLLABORATOR', 'AUDITOR']) {
        const effective = applyProfile({
            profileCode, profileVersion: 1,
            overrides: [{ permissionCode: 'operational_assignments.manage', effect: 'ALLOW' }]
        });
        assert.equal(effective.permissions.has('operational_assignments.manage'), false, profileCode);
    }
    for (const profileCode of ['ADMINISTRATOR', 'MANAGER']) {
        const base = applyProfile({ profileCode, profileVersion: 1, overrides: [] });
        assert.equal(base.permissions.has('operational_assignments.manage'), true, profileCode);
        const denied = applyProfile({
            profileCode, profileVersion: 1,
            overrides: [{ permissionCode: 'operational_assignments.manage', effect: 'DENY' }]
        });
        assert.equal(denied.permissions.has('operational_assignments.manage'), false, profileCode);
    }
});

test('relatórios de checklist seguem checklists.approve nos seis perfis base', async () => {
    const expected = {
        OWNER: true, ADMINISTRATOR: true, MANAGER: true,
        SUPERVISOR: true, COLLABORATOR: false, AUDITOR: false
    };
    for (const [profileCode, allowed] of Object.entries(expected)) {
        const repository = {
            findAuthorizationContext: async () => ({
                mode: 'PROFILED', version: 1,
                configurations: [{ profileCode, profileVersion: 1, overrides: [] }]
            })
        };
        const decision = await resolve({
            capability: 'checklists.approve', legacyRoles: ['ADMIN', 'MANAGER'],
            membership, flags: { enabled: true, killSwitch: false }, repository
        });
        assert.equal(decision.allowed, allowed, profileCode);
        assert.equal(decision.mode, 'PROFILED', profileCode);
    }
});
