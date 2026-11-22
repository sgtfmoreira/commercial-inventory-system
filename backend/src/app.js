const express = require('express');
const cors = require('cors');
const notFoundMiddleware = require('./middlewares/notFoundMiddleware');
const errorMiddleware = require('./middlewares/errorMiddleware');

// Routes
const salesRoutes = require('./routes/salesRoutes');
const stockSectorRoutes = require('./routes/stockSectorRoutes');
const productRoutes = require('./routes/productRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const purchaseOrderRoutes = require('./routes/purchaseOrderRoutes');
const stockMovementRoutes = require('./routes/stockMovementRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const reportsRoutes = require('./routes/reportsRoutes');
const purchaseSuggestionRoutes = require('./routes/purchaseSuggestionRoutes');
const recipeRoutes = require('./routes/recipeRoutes');
const establishmentRoutes = require('./routes/establishmentRoutes');
const stockTransferRoutes = require('./routes/stockTransferRoutes');
const stockAuditRoutes = require('./routes/stockAuditRoutes');
const userRoutes = require('./routes/userRoutes');
const consumptionEventRoutes = require('./routes/consumptionEventRoutes');
const productionRoutes = require('./routes/productionRoutes');
const entryRoutes = require('./routes/entryRoutes');
const stockLocationRoutes = require('./routes/stockLocationRoutes');
const commercialAgreementRoutes = require('./routes/commercialAgreementRoutes');
const portioningRoutes = require('./routes/portioningRoutes');
const organizationProductRoutes = require('./routes/organizationProductRoutes');
const organizationSupplierRoutes = require('./routes/organizationSupplierRoutes');
const supplierPriceUpdateRoutes = require('./routes/supplierPriceUpdateRoutes');
const supplierPortalRoutes = require('./routes/supplierPortalRoutes');
const eventCustomerRoutes = require('./routes/eventCustomerRoutes');
const commercialEventRoutes = require('./routes/commercialEventRoutes');
const eventBudgetRoutes = require('./routes/eventBudgetRoutes');
const eventBudgetItemRoutes = require('./routes/eventBudgetItemRoutes');
const tableReservationRoutes = require('./routes/tableReservationRoutes');
const tableOccupancyRoutes = require('./routes/tableOccupancyRoutes');
const billingRoutes = require('./routes/billingRoutes');
const billingController = require('./controllers/billingController');
const organizationRoutes = require('./routes/organizationRoutes');
const userAccessRoutes = require('./routes/userAccessRoutes');
const checklistTemplateRoutes = require('./routes/checklistTemplateRoutes');

function normalizeCorsOrigin(value) {
    const candidate = String(value).trim();
    if (!candidate || candidate === '*' || candidate === 'null') {
        throw new Error(`Origem CORS inválida: ${candidate || '<vazia>'}`);
    }

    let parsed;
    try {
        parsed = new URL(candidate);
    } catch {
        throw new Error(`Origem CORS inválida: ${candidate}`);
    }

    if (!['http:', 'https:'].includes(parsed.protocol)
        || parsed.username
        || parsed.password
        || parsed.pathname !== '/'
        || parsed.search
        || parsed.hash
        || parsed.origin === 'null') {
        throw new Error(`Origem CORS inválida: ${candidate}`);
    }

    return parsed.origin;
}

function getAllowedOrigins(env = process.env) {
    if (env.CORS_ALLOWED_ORIGINS === undefined) {
        return [...DEFAULT_ALLOWED_ORIGINS];
    }

    const entries = String(env.CORS_ALLOWED_ORIGINS).split(',');
    if (!entries.length || entries.some(entry => !entry.trim())) {
        throw new Error('CORS_ALLOWED_ORIGINS contém uma origem vazia.');
    }

    return [...new Set(entries.map(normalizeCorsOrigin))];
}

function isCorsOriginAllowed(origin, allowedOrigins) {
    if (origin === undefined) return true;
    if (origin === 'null') return false;
    try {
        return allowedOrigins.has(normalizeCorsOrigin(origin));
    } catch {
        return false;
    }
}

function createCorsOptions(env = process.env) {
    const configuredOrigins = new Set(getAllowedOrigins(env));
    return {
        credentials: true,
        origin(origin, callback) {
            if (isCorsOriginAllowed(origin, configuredOrigins)) return callback(null, true);
            return callback(new Error('Bloqueado pela política de CORS'));
        }
    };
}

const app = express();

// 🛡️ Configuração de CORS (Segurança)
const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
    'http://localhost:3000', // Ambiente de desenvolvimento (React padrão)
    'http://127.0.0.1:3000', // Ambiente de desenvolvimento local por IP
    'https://commercial-inventory-system.vercel.app' // ⚠️ IMPORTANTE: Atualize este link quando tiver a URL final da Vercel
]);

const allowedOrigins = new Set(getAllowedOrigins());

app.use(cors({
    origin: function (origin, callback) {
        // Permite requisições sem origin (ex: Postman no back-end) ou origins que estão na lista
        if (isCorsOriginAllowed(origin, allowedOrigins)) {
            callback(null, true);
        } else {
            callback(new Error('Bloqueado pela política de CORS'));
        }
    },
    credentials: true // Necessário se formos usar cookies/sessões no futuro
}));

// Stripe requires the original request bytes for signature verification.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billingController.webhook);

app.use(express.json());

app.use((req, res, next) => {
    console.log('➡️ REQUEST:', req.method, req.originalUrl);
    next();
});

// Route Registration
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/stock-movements', stockMovementRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/stock-transfers', stockTransferRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/stock-sectors', stockSectorRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/purchase-suggestions', purchaseSuggestionRoutes);
app.use('/api/establishments', establishmentRoutes);
app.use('/api/stock-audits', stockAuditRoutes);
app.use('/api/users', userRoutes);
app.use('/api/consumption-events', consumptionEventRoutes);
app.use('/api/productions', productionRoutes);
app.use('/api/entries', entryRoutes);
app.use('/api/stock-locations', stockLocationRoutes);
app.use('/api/commercial-agreements', commercialAgreementRoutes);
app.use('/api/portioning', portioningRoutes);
app.use('/api/organization-products', organizationProductRoutes);
app.use('/api/organization-suppliers', organizationSupplierRoutes);
app.use('/api/supplier-price-updates', supplierPriceUpdateRoutes);
app.use('/api/supplier-portal', supplierPortalRoutes);
app.use('/api/event-customers', eventCustomerRoutes);
app.use('/api/events', commercialEventRoutes);
app.use('/api/event-budgets', eventBudgetRoutes);
app.use('/api/event-budget-items', eventBudgetItemRoutes);
app.use('/api/table-reservations', tableReservationRoutes);
app.use('/api/table-occupancies', tableOccupancyRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/user-access', userAccessRoutes);
app.use('/api/checklists', checklistTemplateRoutes);

// Fallback for undefined routes
app.use(notFoundMiddleware);

// Central error handler
app.use(errorMiddleware);

module.exports = app;
module.exports.DEFAULT_ALLOWED_ORIGINS = DEFAULT_ALLOWED_ORIGINS;
module.exports.normalizeCorsOrigin = normalizeCorsOrigin;
module.exports.getAllowedOrigins = getAllowedOrigins;
module.exports.createCorsOptions = createCorsOptions;
