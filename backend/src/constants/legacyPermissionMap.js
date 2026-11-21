const ANY_AUTHENTICATED = '*';

const LEGACY_ANY_CAPABILITIES = Object.freeze([
    'auth.session.read', 'auth.establishment.switch', 'establishments.read', 'organization.read',
    'categories.read', 'products.read', 'products.costs.read', 'organization_products.read',
    'organization_suppliers.read', 'supplier_price_updates.read', 'purchase_suggestions.read',
    'commercial_agreements.read', 'stock_locations.read', 'stock_locations.create',
    'stock_locations.update', 'stock_locations.delete', 'stock_locations.transfer',
    'stock_transfers.read', 'stock_transfers.create', 'stock_audits.read', 'stock_audits.execute',
    'stock_sectors.read', 'recipes.read', 'recipes.create', 'recipes.update', 'recipes.delete',
    'production.read', 'production.create', 'production.execute', 'portioning.read',
    'portioning.create', 'portioning.update', 'portioning.delete', 'portioning.execute',
    'consumption_events.read', 'consumption_events.execute', 'sales.create', 'dashboard.read',
    'reports.operations.read', 'reports.financial.read'
]);

const LEGACY_RESTRICTED_CAPABILITIES = Object.freeze({
    ADMIN: Object.freeze([
        'users.read', 'users.create', 'users.update', 'users.permissions.read', 'users.permissions.manage',
        'security.audit.read', 'organization.update', 'establishments.create', 'establishments.update',
        'establishments.delete', 'billing.read', 'billing.manage', 'products.create', 'products.update',
        'products.delete', 'products.stock.update', 'products.suppliers.manage', 'organization_products.create',
        'organization_products.update', 'organization_products.delete', 'organization_products.review',
        'suppliers.read', 'suppliers.create', 'suppliers.update', 'organization_suppliers.create',
        'organization_suppliers.update', 'organization_suppliers.delete', 'organization_suppliers.review',
        'supplier_price_updates.create', 'supplier_price_updates.approve', 'supplier_portal.manage',
        'purchase_orders.read', 'purchase_orders.create', 'purchase_orders.receive', 'purchase_orders.delete',
        'commercial_agreements.create', 'commercial_agreements.update', 'commercial_agreements.delete',
        'commercial_agreements.bonus.receive', 'stock_movements.read', 'stock_movements.create',
        'stock_transfers.approve', 'stock_audits.create', 'entries.read', 'entries.create', 'events.read',
        'events.create', 'events.update', 'events.delete', 'event_customers.read', 'event_customers.create',
        'event_customers.update', 'event_budgets.read', 'event_budgets.create', 'event_budgets.update',
        'event_budgets.delete', 'event_budgets.approve', 'table_reservations.read',
        'table_reservations.create', 'table_reservations.update', 'table_reservations.execute',
        'table_occupancies.read', 'table_occupancies.create', 'table_occupancies.execute',
        'checklists.templates.manage', 'checklists.runs.manage'
    ]),
    MANAGER: Object.freeze([
        'stock_audits.create', 'events.read', 'events.create', 'events.update', 'events.delete',
        'event_customers.read', 'event_customers.create', 'event_customers.update', 'event_budgets.read',
        'event_budgets.create', 'event_budgets.update', 'event_budgets.delete', 'event_budgets.approve',
        'table_reservations.read', 'table_reservations.create', 'table_reservations.update',
        'table_reservations.execute', 'table_occupancies.read', 'table_occupancies.create',
        'table_occupancies.execute', 'checklists.runs.manage'
    ]),
    STOCK_COUNTER: Object.freeze([
        'suppliers.read', 'purchase_orders.read', 'purchase_orders.receive',
        'commercial_agreements.bonus.receive', 'stock_audits.create'
    ]),
    STAFF: Object.freeze([])
});

function legacyCapabilitiesForRole(role) {
    return new Set([...LEGACY_ANY_CAPABILITIES, ...(LEGACY_RESTRICTED_CAPABILITIES[role] || [])]);
}

const rule = (capability, legacyRoles = ANY_AUTHENTICATED, options = {}) => Object.freeze({
    capability,
    legacyRoles,
    ...options
});

const admin = capability => rule(capability, ['ADMIN']);
const adminManager = capability => rule(capability, ['ADMIN', 'MANAGER']);
const any = capability => rule(capability);

function cleanPath(value) {
    const raw = String(value || '').split('?')[0];
    return raw.length > 1 ? raw.replace(/\/$/, '') : raw;
}

function resolveLegacyRoutePolicy(methodValue, pathValue) {
    const method = String(methodValue || '').toUpperCase();
    const path = cleanPath(pathValue);

    if (path === '/api/auth/me' || path === '/api/auth/context') return any('auth.session.read');
    if (path === '/api/auth/switch-establishment') return any('auth.establishment.switch');

    if (path.startsWith('/api/users')) {
        if (method === 'GET') return admin('users.read');
        if (method === 'POST') return admin('users.create');
        return admin('users.update');
    }
    if (path.startsWith('/api/user-access')) return null;
    if (path.startsWith('/api/checklists')) return null;
    if (path.startsWith('/api/security-audit')) return admin('security.audit.read');

    if (path.startsWith('/api/establishments')) {
        if (method === 'GET') return any('establishments.read');
        if (method === 'POST') return admin('establishments.create');
        if (method === 'DELETE') return admin('establishments.delete');
        return admin('establishments.update');
    }
    if (path.startsWith('/api/organizations')) {
        return method === 'GET' ? any('organization.read') : admin('organization.update');
    }
    if (path.startsWith('/api/billing')) {
        return method === 'GET' ? admin('billing.read') : admin('billing.manage');
    }
    if (path.startsWith('/api/audit-logs')) return admin('security.audit.read');
    if (path.startsWith('/api/categories')) return any('categories.read');

    if (path.startsWith('/api/products')) {
        if (method === 'GET') {
            return any(/\/(cmv|price-history|best-supplier|supplier-comparison)$/.test(path)
                ? 'products.costs.read'
                : 'products.read');
        }
        if (method === 'POST' && /\/suppliers$/.test(path)) return admin('products.suppliers.manage');
        if (method === 'DELETE' && /\/suppliers\//.test(path)) return admin('products.suppliers.manage');
        if (method === 'POST') return admin('products.create');
        if (method === 'DELETE') return admin('products.delete');
        if (method === 'PATCH' && /\/quantity$/.test(path)) return admin('products.stock.update');
        return admin('products.update');
    }

    if (path.startsWith('/api/organization-products')) {
        if (method === 'GET') return any('organization_products.read');
        if (/review-candidates/.test(path)) return admin('organization_products.review');
        if (method === 'POST') return admin('organization_products.create');
        if (method === 'DELETE') return admin('organization_products.delete');
        return admin('organization_products.update');
    }
    if (path.startsWith('/api/organization-suppliers')) {
        if (method === 'GET') return any('organization_suppliers.read');
        if (/review-candidates/.test(path)) return admin('organization_suppliers.review');
        if (method === 'POST') return admin('organization_suppliers.create');
        if (method === 'DELETE') return admin('organization_suppliers.delete');
        return admin('organization_suppliers.update');
    }
    if (path.startsWith('/api/suppliers')) {
        if (method === 'GET') return rule('suppliers.read', ['ADMIN', 'STOCK_COUNTER']);
        if (method === 'POST') return admin('suppliers.create');
        return admin('suppliers.update');
    }
    if (path.startsWith('/api/supplier-price-updates')) {
        if (method === 'GET') return any('supplier_price_updates.read');
        if (/\/(apply|reject)$/.test(path)) return admin('supplier_price_updates.approve');
        return admin('supplier_price_updates.create');
    }
    if (path.startsWith('/api/supplier-portal/admin')) return admin('supplier_portal.manage');

    if (path.startsWith('/api/purchase-orders')) {
        if (method === 'GET') return rule('purchase_orders.read', ['ADMIN', 'STOCK_COUNTER']);
        if (/\/complete$/.test(path)) return rule('purchase_orders.receive', ['ADMIN', 'STOCK_COUNTER']);
        if (method === 'DELETE') return admin('purchase_orders.delete');
        return admin('purchase_orders.create');
    }
    if (path.startsWith('/api/purchase-suggestions')) return any('purchase_suggestions.read');
    if (path.startsWith('/api/commercial-agreements')) {
        if (method === 'GET') return any('commercial_agreements.read');
        if (/\/bonus-receipts$/.test(path)) return rule('commercial_agreements.bonus.receive', ['ADMIN', 'STOCK_COUNTER']);
        if (method === 'POST') return admin('commercial_agreements.create');
        if (method === 'DELETE') return admin('commercial_agreements.delete');
        return admin('commercial_agreements.update');
    }
    if (path.startsWith('/api/stock-movements')) {
        return method === 'GET' ? admin('stock_movements.read') : admin('stock_movements.create');
    }
    if (path.startsWith('/api/stock-locations')) {
        if (method === 'GET') return any('stock_locations.read');
        if (/\/transfer$/.test(path)) return any('stock_locations.transfer');
        if (method === 'POST') return any('stock_locations.create');
        if (method === 'DELETE') return any('stock_locations.delete');
        return any('stock_locations.update');
    }
    if (path.startsWith('/api/stock-transfers')) {
        if (method === 'GET') return any('stock_transfers.read');
        if (method === 'PATCH') return admin('stock_transfers.approve');
        return any('stock_transfers.create');
    }
    if (path.startsWith('/api/stock-audits')) {
        if (method === 'POST' && path === '/api/stock-audits') return rule('stock_audits.create', ['ADMIN', 'MANAGER', 'STOCK_COUNTER']);
        if (method === 'GET') return any('stock_audits.read');
        return any('stock_audits.execute');
    }
    if (path.startsWith('/api/stock-sectors')) return any('stock_sectors.read');

    if (path.startsWith('/api/recipes')) {
        if (method === 'GET') return any('recipes.read');
        if (method === 'POST') return any('recipes.create');
        if (method === 'DELETE') return any('recipes.delete');
        return any('recipes.update');
    }
    if (path.startsWith('/api/productions')) {
        if (method === 'GET') return any('production.read');
        if (method === 'POST') return any('production.create');
        return any('production.execute');
    }
    if (path.startsWith('/api/portioning')) {
        if (method === 'GET') return any('portioning.read');
        if (/\/(complete|cancel)$/.test(path)) return any('portioning.execute');
        if (method === 'POST') return any('portioning.create');
        if (method === 'DELETE') return any('portioning.delete');
        return any('portioning.update');
    }
    if (path.startsWith('/api/consumption-events')) {
        return method === 'GET' ? any('consumption_events.read') : any('consumption_events.execute');
    }
    if (path.startsWith('/api/entries')) {
        return method === 'GET' ? admin('entries.read') : admin('entries.create');
    }

    if (path.startsWith('/api/events')) {
        if (method === 'GET') return adminManager('events.read');
        if (method === 'POST' && path === '/api/events') return adminManager('events.create');
        if (method === 'DELETE' || /\/cancel$/.test(path)) return adminManager('events.delete');
        return adminManager('events.update');
    }
    if (path.startsWith('/api/event-customers')) {
        if (method === 'GET') return adminManager('event_customers.read');
        if (method === 'POST') return adminManager('event_customers.create');
        return adminManager('event_customers.update');
    }
    if (path.startsWith('/api/event-budgets') || path.startsWith('/api/event-budget-items')) {
        if (method === 'GET') return adminManager('event_budgets.read');
        if (/\/approve$/.test(path)) return adminManager('event_budgets.approve');
        if (method === 'POST') return adminManager('event_budgets.create');
        if (method === 'DELETE') return adminManager('event_budgets.delete');
        return adminManager('event_budgets.update');
    }
    if (path.startsWith('/api/table-reservations')) {
        const options = { establishments: ['COMMERCIAL'] };
        if (method === 'GET') return rule('table_reservations.read', ['ADMIN', 'MANAGER'], options);
        if (method === 'PATCH') return rule('table_reservations.update', ['ADMIN', 'MANAGER'], options);
        if (/\/(check-in|cancel)$/.test(path)) return rule('table_reservations.execute', ['ADMIN', 'MANAGER'], options);
        return rule('table_reservations.create', ['ADMIN', 'MANAGER'], options);
    }
    if (path.startsWith('/api/table-occupancies')) {
        const options = { establishments: ['COMMERCIAL'] };
        if (method === 'GET') return rule('table_occupancies.read', ['ADMIN', 'MANAGER'], options);
        if (/\/release$/.test(path)) return rule('table_occupancies.execute', ['ADMIN', 'MANAGER'], options);
        return rule('table_occupancies.create', ['ADMIN', 'MANAGER'], options);
    }
    if (path.startsWith('/api/sales')) return any('sales.create');
    if (path.startsWith('/api/dashboard')) return any('dashboard.read');
    if (path.startsWith('/api/reports')) {
        return any(/financial-summary|purchase-savings|bonus-trend|purchases-by-product/.test(path)
            ? 'reports.financial.read'
            : 'reports.operations.read');
    }

    return null;
}

function isLegacyAllowed(role, legacyRoles) {
    if (!role) return false;
    return legacyRoles === ANY_AUTHENTICATED || legacyRoles.includes(role);
}

module.exports = {
    ANY_AUTHENTICATED,
    LEGACY_ANY_CAPABILITIES,
    LEGACY_RESTRICTED_CAPABILITIES,
    legacyCapabilitiesForRole,
    resolveLegacyRoutePolicy,
    isLegacyAllowed
};
