const test = require('node:test');
const assert = require('node:assert/strict');

const { PERMISSION_CODES, PERMISSIONS, INDELEGABLE_PERMISSIONS } = require('../src/constants/permissions');
const { PROFILE_CODES, PROFILES_V1, getProfile } = require('../src/constants/accessProfiles');
const { CHECKLIST_RUN_MANAGE_LEGACY_ROLES } = require('../src/constants/checklistTemplates');
const {
    resolveLegacyRoutePolicy,
    legacyCapabilitiesForRole,
    isLegacyAllowed
} = require('../src/constants/legacyPermissionMap');

test('catálogo V1 é granular, único e separa capacidades sensíveis', () => {
    assert.equal(new Set(PERMISSION_CODES).size, PERMISSION_CODES.length);
    assert.ok(PERMISSION_CODES.length >= 100);
    for (const action of ['read', 'create', 'update', 'delete', 'execute', 'approve', 'manage']) {
        assert.ok(Object.values(PERMISSIONS).some(permission => permission.action === action), action);
    }
    assert.ok(INDELEGABLE_PERMISSIONS.has('security.owner.manage'));
    assert.ok(INDELEGABLE_PERMISSIONS.has('billing.manage'));
    assert.ok(INDELEGABLE_PERMISSIONS.has('checklists.runs.manage'));
    assert.equal(PERMISSIONS['checklists.runs.manage'].scope, 'establishment');
    assert.equal(PERMISSIONS['operational_structure.read'].scope, 'establishment');
    assert.equal(PERMISSIONS['billing.manage'].financial, true);
    assert.equal(PERMISSIONS['event_budgets.approve'].sensitive, true);
});

test('seis perfis V1 são imutáveis e AUDITOR não possui finanças por padrão', () => {
    assert.deepEqual(PROFILE_CODES, ['OWNER', 'ADMINISTRATOR', 'MANAGER', 'SUPERVISOR', 'COLLABORATOR', 'AUDITOR']);
    for (const code of PROFILE_CODES) {
        const profile = getProfile(code, 1);
        assert.ok(profile);
        assert.equal(Object.isFrozen(profile), true);
        assert.equal(Object.isFrozen(profile.permissions), true);
    }
    const auditor = new Set(PROFILES_V1.AUDITOR.permissions);
    assert.equal([...auditor].some(code => PERMISSIONS[code].financial), false);
    assert.equal([...auditor].some(code => PERMISSIONS[code].action !== 'read'), false);
    assert.equal(PROFILES_V1.ADMINISTRATOR.permissions.includes('security.owner.manage'), false);
    assert.equal(PROFILES_V1.ADMINISTRATOR.permissions.includes('billing.manage'), false);
    assert.equal(PROFILES_V1.MANAGER.permissions.some(code => PERMISSIONS[code].sensitive), false);
    assert.equal(PROFILES_V1.MANAGER.permissions.some(code => PERMISSIONS[code].action === 'delete'), false);
    assert.equal(PROFILES_V1.OWNER.permissions.includes('checklists.runs.manage'), false);
    assert.equal(PROFILES_V1.ADMINISTRATOR.permissions.includes('checklists.runs.manage'), true);
    assert.equal(PROFILES_V1.MANAGER.permissions.includes('checklists.runs.manage'), true);
    assert.equal(PROFILES_V1.SUPERVISOR.permissions.includes('checklists.runs.manage'), false);
    assert.equal(PROFILES_V1.COLLABORATOR.permissions.includes('checklists.runs.manage'), false);
    assert.equal(PROFILES_V1.AUDITOR.permissions.includes('checklists.runs.manage'), false);
    assert.equal(PROFILES_V1.OWNER.permissions.includes('checklists.approve'), true);
    assert.equal(PROFILES_V1.ADMINISTRATOR.permissions.includes('checklists.approve'), true);
    assert.equal(PROFILES_V1.MANAGER.permissions.includes('checklists.approve'), true);
    assert.equal(PROFILES_V1.SUPERVISOR.permissions.includes('checklists.approve'), true);
    assert.equal(PROFILES_V1.COLLABORATOR.permissions.includes('checklists.approve'), false);
    assert.equal(PROFILES_V1.AUDITOR.permissions.includes('checklists.approve'), false);
    assert.equal(PROFILES_V1.OWNER.permissions.includes('operational_structure.read'), true);
    assert.equal(PROFILES_V1.ADMINISTRATOR.permissions.includes('operational_structure.read'), true);
    assert.equal(PROFILES_V1.MANAGER.permissions.includes('operational_structure.read'), true);
    assert.equal(PROFILES_V1.SUPERVISOR.permissions.includes('operational_structure.read'), true);
    assert.equal(PROFILES_V1.COLLABORATOR.permissions.includes('operational_structure.read'), false);
    assert.equal(PROFILES_V1.AUDITOR.permissions.includes('operational_structure.read'), false);
    assert.equal(PROFILES_V1.OWNER.permissions.includes('operational_sectors.manage'), true);
    assert.equal(PROFILES_V1.ADMINISTRATOR.permissions.includes('operational_functions.manage'), true);
    assert.equal(PROFILES_V1.MANAGER.permissions.includes('operational_functions.manage'), true);
    assert.deepEqual(CHECKLIST_RUN_MANAGE_LEGACY_ROLES, ['ADMIN', 'MANAGER']);
    assert.equal(isLegacyAllowed('ADMIN', CHECKLIST_RUN_MANAGE_LEGACY_ROLES), true);
    assert.equal(isLegacyAllowed('MANAGER', CHECKLIST_RUN_MANAGE_LEGACY_ROLES), true);
    assert.equal(isLegacyAllowed('OWNER', CHECKLIST_RUN_MANAGE_LEGACY_ROLES), false);
    assert.equal(isLegacyAllowed('SUPERVISOR', CHECKLIST_RUN_MANAGE_LEGACY_ROLES), false);
});

test('mapa de rota mantém regras legadas inclusive qualquer papel desconhecido', () => {
    const authOnly = resolveLegacyRoutePolicy('POST', '/api/productions');
    assert.equal(isLegacyAllowed('UNKNOWN', authOnly.legacyRoles), true);
    const adminOnly = resolveLegacyRoutePolicy('POST', '/api/users');
    assert.equal(isLegacyAllowed('ADMIN', adminOnly.legacyRoles), true);
    assert.equal(isLegacyAllowed('MANAGER', adminOnly.legacyRoles), false);
    const purchase = resolveLegacyRoutePolicy('PUT', '/api/purchase-orders/abc/complete');
    assert.equal(isLegacyAllowed('STOCK_COUNTER', purchase.legacyRoles), true);
    assert.equal(isLegacyAllowed('STAFF', purchase.legacyRoles), false);
    assert.ok(legacyCapabilitiesForRole('UNKNOWN').has('production.create'));
    assert.equal(legacyCapabilitiesForRole('UNKNOWN').has('users.create'), false);
});
