const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const requireRole = require('../src/middlewares/requireRole');
const { resolveLegacyRoutePolicy, isLegacyAllowed } = require('../src/constants/legacyPermissionMap');
const { isPermissionCode } = require('../src/constants/permissions');

const SRC_ROOT = path.join(__dirname, '..', 'src');
const APP_FILE = path.join(SRC_ROOT, 'app.js');
const LEGACY_ROLES = ['ADMIN', 'MANAGER', 'STOCK_COUNTER', 'STAFF', 'UNKNOWN'];
const DIRECT_CAPABILITY_ROUTE_FILES = new Set([
    'userAccessRoutes.js',
    'checklistTemplateRoutes.js',
    'operationalStructureRoutes.js'
]);

const lineAt = (source, offset) => source.slice(0, offset).split(/\r?\n/).length;

function discoverRoutes() {
    const appSource = fs.readFileSync(APP_FILE, 'utf8');
    const routeImports = new Map();
    const importPattern = /const\s+(\w+)\s*=\s*require\(['"]\.\/routes\/([^'"]+)['"]\)/g;
    for (const match of appSource.matchAll(importPattern)) {
        routeImports.set(match[1], `${match[2]}.js`.replace(/\.js\.js$/, '.js'));
    }

    const mounts = [];
    const mountPattern = /app\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)\s*\)/g;
    for (const match of appSource.matchAll(mountPattern)) {
        if (routeImports.has(match[2])) {
            mounts.push({ prefix: match[1], file: routeImports.get(match[2]) });
        }
    }

    const routes = [];
    for (const { prefix, file } of mounts) {
        const fullPath = path.join(SRC_ROOT, 'routes', file);
        const source = fs.readFileSync(fullPath, 'utf8');
        const routePattern = /router\.(get|post|put|patch|delete)\s*\(\s*(['"])([^'"]+)\2/g;
        let ordinal = 0;
        for (const match of source.matchAll(routePattern)) {
            ordinal += 1;
            const routePath = match[3] === '/' ? '' : match[3];
            routes.push({
                sourceFile: file,
                line: lineAt(source, match.index),
                ordinal,
                method: match[1].toUpperCase(),
                path: `${prefix}${routePath}`
            });
        }
    }

    const directPattern = /app\.(get|post|put|patch|delete)\s*\(\s*(['"])([^'"]+)\2/g;
    let ordinal = 0;
    for (const match of appSource.matchAll(directPattern)) {
        ordinal += 1;
        routes.push({
            sourceFile: 'app.js',
            line: lineAt(appSource, match.index),
            ordinal,
            method: match[1].toUpperCase(),
            path: match[3]
        });
    }

    return routes.sort((a, b) => (
        a.path.localeCompare(b.path)
        || a.method.localeCompare(b.method)
        || a.sourceFile.localeCompare(b.sourceFile)
        || a.ordinal - b.ordinal
    ));
}

const rolePolicy = (...roles) => ({ kind: 'ROLES', roles });
const AUTHENTICATED = Object.freeze({ kind: 'AUTHENTICATED' });
const PUBLIC = Object.freeze({ kind: 'PUBLIC' });
const PORTAL = Object.freeze({ kind: 'SUPPLIER_PORTAL' });

function currentPolicy(route) {
    const { sourceFile: file, method, path: routePath } = route;

    if (file === 'app.js' && routePath === '/api/billing/webhook') return PUBLIC;

    if (file === 'authRoutes.js') {
        if (['/api/auth/register', '/api/auth/login'].includes(routePath)) return PUBLIC;
        return AUTHENTICATED;
    }

    if (file === 'supplierPortalRoutes.js') {
        if (routePath.startsWith('/api/supplier-portal/auth/')) return PUBLIC;
        if (routePath.startsWith('/api/supplier-portal/admin/')) return rolePolicy('ADMIN');
        return PORTAL;
    }

    if (['commercialEventRoutes.js', 'eventBudgetRoutes.js', 'eventBudgetItemRoutes.js', 'eventCustomerRoutes.js'].includes(file)) {
        return rolePolicy('ADMIN', 'MANAGER');
    }
    if (['tableReservationRoutes.js', 'tableOccupancyRoutes.js'].includes(file)) {
        return { ...rolePolicy('ADMIN', 'MANAGER'), establishments: ['COMMERCIAL'] };
    }
    if (['auditLogRoutes.js', 'billingRoutes.js', 'entryRoutes.js', 'userRoutes.js'].includes(file)) {
        return rolePolicy('ADMIN');
    }

    if (file === 'establishmentRoutes.js') {
        return method === 'GET' ? AUTHENTICATED : rolePolicy('ADMIN');
    }
    if (file === 'organizationRoutes.js') {
        return method === 'GET' ? AUTHENTICATED : rolePolicy('ADMIN');
    }
    if (file === 'productRoutes.js') {
        return method === 'GET' ? AUTHENTICATED : rolePolicy('ADMIN');
    }
    if (file === 'supplierRoutes.js') {
        return method === 'GET' ? rolePolicy('ADMIN', 'STOCK_COUNTER') : rolePolicy('ADMIN');
    }
    if (file === 'purchaseOrderRoutes.js') {
        if (method === 'GET' || routePath.endsWith('/complete')) return rolePolicy('ADMIN', 'STOCK_COUNTER');
        return rolePolicy('ADMIN');
    }
    if (file === 'stockMovementRoutes.js') return rolePolicy('ADMIN');
    if (file === 'stockTransferRoutes.js') {
        return method === 'PATCH' ? rolePolicy('ADMIN') : AUTHENTICATED;
    }
    if (file === 'stockAuditRoutes.js') {
        if (method === 'POST' && routePath === '/api/stock-audits') {
            return rolePolicy('ADMIN', 'MANAGER', 'STOCK_COUNTER');
        }
        return AUTHENTICATED;
    }
    if (file === 'commercialAgreementRoutes.js') {
        if (method === 'GET') return AUTHENTICATED;
        if (routePath.endsWith('/bonus-receipts')) return rolePolicy('ADMIN', 'STOCK_COUNTER');
        return rolePolicy('ADMIN');
    }
    if (['organizationProductRoutes.js', 'organizationSupplierRoutes.js'].includes(file)) {
        return method === 'GET' ? AUTHENTICATED : rolePolicy('ADMIN');
    }
    if (file === 'supplierPriceUpdateRoutes.js') {
        return method === 'GET' ? AUTHENTICATED : rolePolicy('ADMIN');
    }

    return AUTHENTICATED;
}

const domainByFile = Object.freeze({
    auditLogRoutes: 'security.audit',
    authRoutes: 'auth.session',
    billingRoutes: 'billing',
    categoryRoutes: 'categories',
    commercialAgreementRoutes: 'commercial_agreements',
    commercialEventRoutes: 'events',
    consumptionEventRoutes: 'consumption_events',
    dashboardRoutes: 'dashboard',
    entryRoutes: 'entries',
    establishmentRoutes: 'establishments',
    eventBudgetItemRoutes: 'event_budgets',
    eventBudgetRoutes: 'event_budgets',
    eventCustomerRoutes: 'event_customers',
    organizationProductRoutes: 'organization_products',
    organizationRoutes: 'organization',
    organizationSupplierRoutes: 'organization_suppliers',
    portioningRoutes: 'portioning',
    productionRoutes: 'production',
    productRoutes: 'products',
    purchaseOrderRoutes: 'purchase_orders',
    purchaseSuggestionRoutes: 'purchase_suggestions',
    recipeRoutes: 'recipes',
    reportsRoutes: 'reports',
    salesRoutes: 'sales',
    stockAuditRoutes: 'stock_audits',
    stockLocationRoutes: 'stock_locations',
    stockMovementRoutes: 'stock_movements',
    stockSectorRoutes: 'stock_sectors',
    stockTransferRoutes: 'stock_transfers',
    supplierPortalRoutes: 'supplier_portal',
    supplierPriceUpdateRoutes: 'supplier_price_updates',
    supplierRoutes: 'suppliers',
    tableOccupancyRoutes: 'table_occupancies',
    tableReservationRoutes: 'table_reservations',
    userRoutes: 'users'
});

function futureCapability(route) {
    if (currentPolicy(route).kind === 'PUBLIC') return null;
    if (route.sourceFile === 'app.js') return 'billing.webhook.receive';

    const baseName = route.sourceFile.replace(/\.js$/, '');
    const domain = domainByFile[baseName];
    assert.ok(domain, `Domínio futuro ausente para ${route.sourceFile}`);

    if (route.sourceFile === 'userRoutes.js') {
        if (route.method === 'GET') return 'users.read';
        if (route.method === 'POST') return 'users.create';
        return 'users.update';
    }
    if (route.sourceFile === 'stockTransferRoutes.js' && route.method === 'PATCH') return 'stock_transfers.approve';
    if (route.sourceFile === 'purchaseOrderRoutes.js' && route.path.endsWith('/complete')) return 'purchase_orders.receive';
    if (route.sourceFile === 'eventBudgetRoutes.js' && route.path.endsWith('/approve')) return 'event_budgets.approve';

    return `${domain}.${route.method === 'GET' ? 'read' : 'manage'}`;
}

function executeRoleMiddleware(allowedRoles, role) {
    let nextCalled = false;
    const response = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    requireRole(allowedRoles)({ user: role ? { role } : {} }, response, () => { nextCalled = true; });
    return { nextCalled, statusCode: response.statusCode };
}

test('inventário B1 cobre todas as rotas Express montadas atualmente', () => {
    const routes = discoverRoutes();
    const legacyRoutes = routes.filter(route => !DIRECT_CAPABILITY_ROUTE_FILES.has(route.sourceFile));
    const phaseB2Routes = routes.filter(route => route.sourceFile === 'userAccessRoutes.js');
    const checklistRoutes = routes.filter(route => route.sourceFile === 'checklistTemplateRoutes.js');
    const operationalStructureRoutes = routes.filter(route => route.sourceFile === 'operationalStructureRoutes.js');
    assert.equal(legacyRoutes.length, 197, 'Mudança nas 197 rotas legadas reconciliadas exige revisar o inventário B1');
    assert.equal(phaseB2Routes.length, 12, 'Mudança nas APIs B2 exige revisão explícita do inventário');
    assert.equal(checklistRoutes.length, 32, 'Mudança nas APIs de checklist exige revisão explícita do inventário');
    assert.equal(operationalStructureRoutes.length, 15, 'Mudança nas APIs de estrutura operacional exige revisão explícita do inventário');

    for (const route of legacyRoutes) {
        const policy = currentPolicy(route);
        assert.ok(policy?.kind, `Política ausente: ${route.method} ${route.path}`);
        if (policy.kind !== 'PUBLIC') {
            assert.ok(futureCapability(route), `Capacidade futura ausente: ${route.method} ${route.path}`);
        }
    }
});

test('listas de papéis do inventário reproduzem requireRole para todos os papéis legados', () => {
    const rolePolicies = new Map();
    for (const route of discoverRoutes()) {
        const policy = currentPolicy(route);
        if (policy.kind === 'ROLES') rolePolicies.set(policy.roles.join(','), policy.roles);
    }

    for (const allowedRoles of rolePolicies.values()) {
        for (const role of [...LEGACY_ROLES, null]) {
            const result = executeRoleMiddleware(allowedRoles, role);
            assert.equal(result.nextCalled, role ? allowedRoles.includes(role) : false);
            assert.equal(result.statusCode, !role ? 401 : allowedRoles.includes(role) ? 200 : 403);
        }
    }
});

test('resolvedor B2 cobre as 187 rotas internas legadas reconciliadas com decisão idêntica', () => {
    const internal = discoverRoutes().filter(route => (
        !DIRECT_CAPABILITY_ROUTE_FILES.has(route.sourceFile)
        && !['PUBLIC', 'SUPPLIER_PORTAL'].includes(currentPolicy(route).kind)
    ));
    assert.equal(internal.length, 187);

    for (const route of internal) {
        const previous = currentPolicy(route);
        const mapped = resolveLegacyRoutePolicy(route.method, route.path);
        assert.ok(mapped, `Mapa B2 ausente: ${route.method} ${route.path}`);
        assert.ok(isPermissionCode(mapped.capability), `Capacidade inválida: ${mapped.capability}`);
        for (const role of LEGACY_ROLES) {
            const expected = previous.kind === 'AUTHENTICATED' || previous.roles.includes(role);
            assert.equal(
                isLegacyAllowed(role, mapped.legacyRoles),
                expected,
                `${route.method} ${route.path} para ${role}`
            );
        }
    }
});

test('snapshot registra rotas acessíveis a qualquer vínculo interno autenticado', () => {
    const routes = discoverRoutes();
    const authenticated = routes.filter(route => currentPolicy(route).kind === 'AUTHENTICATED');
    assert.ok(authenticated.length > 0);
    assert.ok(authenticated.some(route => route.method !== 'GET'), 'Há mutações atuais sem filtro de papel');

    for (const expected of [
        'POST /api/productions',
        'POST /api/recipes',
        'POST /api/stock-locations',
        'POST /api/stock-transfers',
        'POST /api/sales/manual',
        'PATCH /api/stock-audits/:id/finish'
    ]) {
        assert.ok(
            authenticated.some(route => `${route.method} ${route.path}` === expected),
            `Rota auth-only esperada não encontrada: ${expected}`
        );
    }
});

test('snapshot registra os quatro papéis legados aceitos e a nomenclatura correta da UI', () => {
    const userService = fs.readFileSync(path.join(SRC_ROOT, 'services', 'userService.js'), 'utf8');
    const roleConstants = fs.readFileSync(path.join(SRC_ROOT, 'constants', 'roles.js'), 'utf8');
    const usersPage = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'Users.js'), 'utf8');

    for (const role of ['ADMIN', 'MANAGER', 'STAFF', 'STOCK_COUNTER']) {
        assert.match(userService, new RegExp(`['"]${role}['"]`));
    }
    assert.doesNotMatch(roleConstants, /STAFF\s*:/);
    assert.match(usersPage, /STOCK_COUNTER:\s*['"]Contador de estoque['"]/);
    assert.match(usersPage, /MANAGER:\s*['"]Gerente['"]/);
    assert.doesNotMatch(usersPage, /STOCK_COUNTER:\s*['"]Gerente['"]/);
});

test('snapshot impede associação automática e preserva administração inicial auditada', () => {
    const userService = fs.readFileSync(path.join(SRC_ROOT, 'services', 'userService.js'), 'utf8');
    const establishmentController = fs.readFileSync(path.join(SRC_ROOT, 'controllers', 'establishmentController.js'), 'utf8');

    assert.doesNotMatch(userService, /organizationId:\s*sourceEst(?:ablishment)?\.organizationId/);
    assert.doesNotMatch(userService, /userEstablishment\.createMany/);
    assert.doesNotMatch(establishmentController, /function\s+strongestMemberships/);
    assert.doesNotMatch(establishmentController, /userEstablishment\.createMany/);
    assert.match(establishmentController, /userEstablishment\.create\(\{[\s\S]*?userId:\s*req\.user\.userId/);
    assert.match(establishmentController, /eventType:\s*['"]ESTABLISHMENT_INITIAL_ADMIN_GRANTED['"]/);
});

test('snapshot do vínculo preserva papel, estado e unicidade por usuário-estabelecimento', () => {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
    const model = schema.match(/model\s+UserEstablishment\s*\{[\s\S]*?\n\}/)?.[0];
    assert.ok(model, 'Model UserEstablishment não encontrado');
    assert.match(model, /role\s+String/);
    assert.match(model, /isActive\s+Boolean\s+@default\(true\)/);
    assert.match(model, /@@unique\(\[userId,\s*establishmentId\]\)/);
});

test('inventário sinaliza rotas duplicadas por método e caminho', () => {
    const seen = new Map();
    for (const route of discoverRoutes()) {
        const key = `${route.method} ${route.path}`;
        seen.set(key, (seen.get(key) || 0) + 1);
    }
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
    assert.deepEqual(duplicates, [['GET /api/suppliers', 2]]);
});

module.exports = { discoverRoutes, currentPolicy, futureCapability };
