const { PERMISSION_CODES, PERMISSIONS } = require('./permissions');

const PROFILE_VERSION = 1;
const PROFILE_CODES = Object.freeze([
    'OWNER',
    'ADMINISTRATOR',
    'MANAGER',
    'SUPERVISOR',
    'COLLABORATOR',
    'AUDITOR'
]);

const authorityLevel = Object.freeze({
    OWNER: 600,
    ADMINISTRATOR: 500,
    MANAGER: 400,
    SUPERVISOR: 300,
    COLLABORATOR: 200,
    AUDITOR: 100
});

const select = predicate => PERMISSION_CODES.filter(code => predicate(PERMISSIONS[code]));
const without = (codes, denied) => codes.filter(code => !denied.has(code));

const structural = new Set(['security.owner.manage', 'security.policy.manage']);
const ownerDenied = new Set(['checklists.runs.manage']);
const administratorDenied = new Set([
    ...structural,
    'organization.update',
    'billing.manage'
]);
const managerDeniedModules = new Set([
    'users',
    'security',
    'organization',
    'establishments',
    'billing',
    'supplier_portal',
    'organization_products',
    'organization_suppliers'
]);
const supervisorAllowed = new Set([
    'auth.session.read', 'auth.establishment.switch', 'categories.read', 'products.read',
    'organization_products.read', 'suppliers.read', 'organization_suppliers.read',
    'stock_locations.read', 'stock_transfers.read', 'stock_audits.read', 'stock_audits.execute',
    'recipes.read', 'production.read', 'production.execute', 'portioning.read', 'portioning.execute',
    'consumption_events.read', 'consumption_events.execute', 'events.read', 'event_customers.read',
    'table_reservations.read', 'table_reservations.execute', 'table_occupancies.read',
    'table_occupancies.execute', 'dashboard.read', 'reports.operations.read', 'checklists.execute',
    'checklists.approve'
]);
const collaboratorAllowed = new Set([
    'auth.session.read', 'auth.establishment.switch', 'categories.read', 'products.read',
    'stock_locations.read', 'recipes.read', 'production.read', 'portioning.read',
    'consumption_events.read', 'consumption_events.execute', 'events.read',
    'table_reservations.read', 'table_occupancies.read', 'checklists.execute'
]);

const profilePermissions = {
    OWNER: without(PERMISSION_CODES, ownerDenied),
    ADMINISTRATOR: without(PERMISSION_CODES, administratorDenied),
    MANAGER: select(permission => (
        !managerDeniedModules.has(permission.module)
        && !structural.has(permission.code)
        && !permission.sensitive
        && permission.action !== 'delete'
    )),
    SUPERVISOR: [...supervisorAllowed],
    COLLABORATOR: [...collaboratorAllowed],
    AUDITOR: select(permission => permission.action === 'read' && !permission.financial && !permission.sensitive)
};

const PROFILES_V1 = Object.freeze(Object.fromEntries(PROFILE_CODES.map(code => [code, Object.freeze({
    code,
    version: PROFILE_VERSION,
    authorityLevel: authorityLevel[code],
    permissions: Object.freeze([...new Set(profilePermissions[code])].sort())
})])));

const PROFILE_VERSIONS = Object.freeze({ 1: PROFILES_V1 });

function getProfile(code, version = PROFILE_VERSION) {
    return PROFILE_VERSIONS[version]?.[code] || null;
}

module.exports = { PROFILE_VERSION, PROFILE_CODES, PROFILE_VERSIONS, PROFILES_V1, getProfile };
