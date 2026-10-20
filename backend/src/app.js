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
const tableReservationRoutes = require('./routes/tableReservationRoutes');
const tableOccupancyRoutes = require('./routes/tableOccupancyRoutes');

const app = express();

// 🛡️ Configuração de CORS (Segurança)
const allowedOrigins = [
    'http://localhost:3000', // Ambiente de desenvolvimento (React padrão)
    'https://commercial-inventory-system.vercel.app' // ⚠️ IMPORTANTE: Atualize este link quando tiver a URL final da Vercel
];

app.use(cors({
    origin: function (origin, callback) {
        // Permite requisições sem origin (ex: Postman no back-end) ou origins que estão na lista
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Bloqueado pela política de CORS'));
        }
    },
    credentials: true // Necessário se formos usar cookies/sessões no futuro
}));

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
app.use('/api/table-reservations', tableReservationRoutes);
app.use('/api/table-occupancies', tableOccupancyRoutes);

// Fallback for undefined routes
app.use(notFoundMiddleware);

// Central error handler
app.use(errorMiddleware);

module.exports = app;
