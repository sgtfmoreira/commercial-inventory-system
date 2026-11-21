const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test?schema=public';
process.env.JWT_SECRET ||= 'test-only-secret';

const organizationBillingService = require('../src/services/organizationBillingService');
const {
    createStripeBillingService,
    lineItems,
    validateCheckoutAttemptId,
    STRIPE_API_VERSION
} = require('../src/services/stripeBillingService');
const { archiveBlockers } = require('../src/controllers/establishmentController');
const authService = require('../src/services/authService');

const stripeConfig = {
    restrictedKey: 'restricted-key-placeholder',
    webhookSecret: 'webhook-secret-placeholder',
    basePriceId: 'price_base',
    additionalEstablishmentPriceId: 'price_additional',
    successUrl: 'https://example.invalid/success',
    cancelUrl: 'https://example.invalid/cancel',
    portalReturnUrl: 'https://example.invalid/portal'
};

test('calcula plano base e unidades adicionais em centavos', () => {
    assert.equal(organizationBillingService.calculateMonthlyPrice(1).monthlyTotalCents, 14900);
    assert.equal(organizationBillingService.calculateMonthlyPrice(3).monthlyTotalCents, 38900);
    assert.equal(organizationBillingService.calculateMonthlyPrice(3).additionalEstablishments, 2);
});

test('contexto financeiro é resolvido somente pelo estabelecimento ativo autenticado', async () => {
    let received;
    const db = {
        establishments: {
            findFirst: async query => {
                received = query;
                return { organizationId: 'org-scoped' };
            }
        }
    };
    assert.equal(await organizationBillingService.getOrganizationId('est-authenticated', db), 'org-scoped');
    assert.deepEqual(received, {
        where: { id: 'est-authenticated', isActive: true },
        select: { organizationId: true }
    });
});

test('cadastro cria organização, primeira unidade e assinatura PENDING na mesma transação', async () => {
    const calls = {};
    const tx = {
        organization: { create: async ({ data }) => ({ id: 'org-1', ...data }) },
        establishments: { create: async ({ data }) => ({ id: 'est-1', ...data }) },
        category: { createMany: async ({ data }) => { calls.categories = data; } },
        users: { create: async ({ data }) => ({ id: 'user-1', ...data }) },
        userEstablishment: { create: async ({ data }) => { calls.membership = data; } }
    };
    const db = {
        users: { findUnique: async () => null },
        $transaction: async callback => callback(tx)
    };
    const billing = {
        ensureSubscription: async (organizationId, receivedTx, status) => {
            calls.subscription = { organizationId, receivedTx, status };
        }
    };

    const result = await authService.register({
        name: 'Ana',
        email: 'ANA@EXAMPLE.COM',
        password: 'segredo',
        organizationName: 'Grupo Ana',
        establishmentName: 'Unidade Centro'
    }, {
        db,
        billing,
        passwordService: { hash: async () => 'hashed-password' }
    });

    assert.equal(result.organization.name, 'Grupo Ana');
    assert.equal(result.establishment.organizationId, 'org-1');
    assert.equal(result.user.email, 'ana@example.com');
    assert.equal(calls.subscription.status, 'PENDING');
    assert.equal(calls.subscription.receivedTx, tx);
    assert.equal(calls.membership.role, 'ADMIN');
});

test('monta Checkout sem restringir métodos de pagamento', () => {
    const items = lineItems(2, stripeConfig);
    assert.deepEqual(items, [
        { price: 'price_base', quantity: 1 },
        { price: 'price_additional', quantity: 1 }
    ]);
    assert.equal(STRIPE_API_VERSION, '2026-09-30.endive');
});

test('exige identificador seguro por tentativa de Checkout', () => {
    assert.equal(validateCheckoutAttemptId('12345678-1234-1234-1234-123456789012'), '12345678-1234-1234-1234-123456789012');
    assert.throws(() => validateCheckoutAttemptId('curto'), /inválido/);
});

test('cria Checkout idempotente para a mesma tentativa', async () => {
    const checkoutCalls = [];
    const db = {
        establishments: { findFirst: async () => ({ organizationId: 'org-1' }) },
        organization: { findUnique: async () => ({
            id: 'org-1', name: 'Grupo Teste',
            establishments: [{ id: 'est-1' }],
            subscription: {
                organizationId: 'org-1', status: 'PENDING', externalCustomerId: 'cus-1',
                externalSubscriptionId: null, basePriceCents: 14900,
                additionalEstablishmentPriceCents: 12000
            }
        }) }
    };
    const stripe = {
        prices: { retrieve: async id => ({
            id, active: true, currency: 'brl',
            unit_amount: id === 'price_base' ? 14900 : 12000,
            recurring: { interval: 'month', interval_count: 1 }
        }) },
        checkout: { sessions: { create: async (input, options) => {
            checkoutCalls.push({ input, options });
            return { id: 'cs-1', url: 'https://checkout.stripe.test/cs-1' };
        } } }
    };
    const service = createStripeBillingService({ db, stripe, config: stripeConfig });
    await service.createCheckoutSession('est-1', 'user-1', '12345678-1234-1234-1234-123456789012');

    assert.equal(checkoutCalls[0].input.payment_method_types, undefined);
    assert.equal(checkoutCalls[0].input.automatic_tax, undefined);
    assert.match(checkoutCalls[0].options.idempotencyKey, /^organization-checkout-org-1-/);
});

test('sincroniza quantidade adicional com mutação Stripe idempotente', async () => {
    const updates = [];
    const db = {
        establishments: { findFirst: async () => ({ organizationId: 'org-1' }) },
        organization: { findUnique: async () => ({
            id: 'org-1', name: 'Grupo Teste',
            establishments: [{ id: 'est-1' }, { id: 'est-2' }, { id: 'est-3' }],
            subscription: {
                organizationId: 'org-1', status: 'ACTIVE', externalCustomerId: 'cus-1',
                externalSubscriptionId: 'sub-1', basePriceCents: 14900,
                additionalEstablishmentPriceCents: 12000
            }
        }) },
        organizationSubscription: { update: async args => args }
    };
    const stripe = {
        subscriptions: { retrieve: async () => ({
            id: 'sub-1',
            items: { data: [
                { id: 'si-base', price: { id: 'price_base' } },
                { id: 'si-additional', price: { id: 'price_additional' } }
            ] }
        }) },
        subscriptionItems: {
            update: async (id, input, options) => { updates.push({ id, input, options }); },
            create: async () => { throw new Error('não deve criar'); },
            del: async () => { throw new Error('não deve excluir'); }
        }
    };
    const service = createStripeBillingService({ db, stripe, config: stripeConfig });
    assert.deepEqual(await service.syncQuantity('est-1'), { status: 'SYNCED', establishmentCount: 3 });
    assert.equal(updates[0].input.quantity, 2);
    assert.equal(
        updates[0].options.idempotencyKey,
        'organization-subscription-item-sub-1-si-additional-2'
    );
});

test('nova unidade concede acesso somente ao criador e registra auditoria', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'controllers', 'establishmentController.js'),
        'utf8'
    );

    assert.doesNotMatch(source, /function\s+strongestMemberships/);
    assert.doesNotMatch(source, /userEstablishment\.createMany/);
    assert.match(source, /userEstablishment\.create\(\{[\s\S]*?userId:\s*req\.user\.userId[\s\S]*?role:\s*['"]ADMIN['"]/);
    assert.match(source, /eventType:\s*['"]ESTABLISHMENT_INITIAL_ADMIN_GRANTED['"]/);
    assert.match(source, /source:\s*['"]EXPLICIT_ESTABLISHMENT_CREATION['"]/);
});

test('inventaria pendências que impedem desativar uma unidade', async () => {
    const db = {
        product: { count: async () => 2 },
        productStock: { count: async () => 1 },
        purchaseOrder: { count: async () => 3 },
        stockTransfer: { count: async () => 4 },
        stockAudit: { count: async () => 5 },
        tableOccupancy: { count: async () => 6 }
    };
    assert.deepEqual(await archiveBlockers('est-1', db), {
        positiveProducts: 2,
        positiveLocationStocks: 1,
        pendingOrders: 3,
        pendingTransfers: 4,
        openAudits: 5,
        activeOccupancies: 6
    });
});

test('webhook preserva raw body e verifica assinatura antes de processar', async () => {
    const received = {};
    const payload = Buffer.from('{"id":"evt_raw"}', 'utf8');
    const stripe = {
        webhooks: {
            constructEvent: (body, signature, secret) => {
                received.body = body;
                received.signature = signature;
                received.secret = secret;
                return { id: 'evt_raw', type: 'event.not_handled', data: { object: {} } };
            }
        }
    };
    const db = {
        $transaction: async callback => callback({
            billingWebhookEvent: { create: async () => ({ id: 'local-event' }) }
        })
    };
    const service = createStripeBillingService({ db, stripe, config: stripeConfig });
    const result = await service.handleWebhook(payload, 'signature-placeholder');

    assert.equal(received.body, payload);
    assert.equal(Buffer.isBuffer(received.body), true);
    assert.equal(received.signature, 'signature-placeholder');
    assert.equal(received.secret, stripeConfig.webhookSecret);
    assert.deepEqual(result, { duplicate: false, processed: false });
});

test('webhook falha fechado sem assinatura ou com assinatura inválida', async () => {
    const service = createStripeBillingService({
        db: {},
        stripe: { webhooks: { constructEvent: () => { throw new Error('invalid'); } } },
        config: stripeConfig
    });
    await assert.rejects(
        service.handleWebhook(Buffer.from('{}'), null),
        error => error.statusCode === 400 && /ausente/.test(error.message)
    );
    await assert.rejects(
        service.handleWebhook(Buffer.from('{}'), 'invalid-signature'),
        error => error.statusCode === 400 && /inválida/.test(error.message)
    );
});

test('evento duplicado é idempotente e não repete efeitos financeiros', async () => {
    let writes = 0;
    const duplicate = Object.assign(new Error('duplicate'), {
        code: 'P2002',
        meta: { target: ['stripeEventId'] }
    });
    const db = {
        $transaction: async callback => callback({
            billingWebhookEvent: { create: async () => { writes += 1; throw duplicate; } }
        })
    };
    const service = createStripeBillingService({ db, stripe: {}, config: stripeConfig });
    const result = await service.processEvent({
        id: 'evt-duplicate',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub-1', status: 'active', items: { data: [] } } }
    });
    assert.deepEqual(result, { duplicate: true, processed: false });
    assert.equal(writes, 1);
});

test('assinatura e fatura atualizam somente a assinatura local correspondente', async () => {
    const updates = [];
    const tx = {
        billingWebhookEvent: { create: async () => ({}) },
        organizationSubscription: {
            updateMany: async args => { updates.push(args); return { count: 1 }; }
        }
    };
    const db = { $transaction: async callback => callback(tx) };
    const service = createStripeBillingService({ db, stripe: {}, config: stripeConfig });

    await service.processEvent({
        id: 'evt-subscription',
        type: 'customer.subscription.updated',
        data: {
            object: {
                id: 'sub-local', customer: 'cus-local', status: 'active',
                items: { data: [{ current_period_start: 10, current_period_end: 20 }] }
            }
        }
    });
    await service.processEvent({
        id: 'evt-invoice',
        type: 'invoice.payment_failed',
        data: { object: { subscription: 'sub-local' } }
    });

    assert.deepEqual(updates[0].where, { externalSubscriptionId: 'sub-local' });
    assert.equal(updates[0].data.status, 'ACTIVE');
    assert.deepEqual(updates[1], {
        where: { externalSubscriptionId: 'sub-local' },
        data: { status: 'PAST_DUE' }
    });
});

test('evento sem assinatura local falha fechado e permite retry posterior', async () => {
    const tx = {
        billingWebhookEvent: { create: async () => ({}) },
        organizationSubscription: { updateMany: async () => ({ count: 0 }) }
    };
    const service = createStripeBillingService({
        db: { $transaction: async callback => callback(tx) },
        stripe: {},
        config: stripeConfig
    });
    await assert.rejects(
        service.processEvent({
            id: 'evt-unmatched',
            type: 'invoice.paid',
            data: { object: { subscription: 'sub-missing' } }
        }),
        error => error.statusCode === 409 && /sem assinatura local/.test(error.message)
    );
});

test('disputa, reembolso e alerta de fraude resolvem a assinatura pelo grafo Stripe', async () => {
    const retrieved = [];
    const stripe = {
        charges: {
            retrieve: async id => { retrieved.push(['charge', id]); return { id, invoice: 'in-1' }; }
        },
        invoices: {
            retrieve: async id => { retrieved.push(['invoice', id]); return { id, subscription: 'sub-risk' }; }
        }
    };
    const tx = {
        billingWebhookEvent: { create: async () => ({}) },
        organizationSubscription: {
            findUnique: async ({ where }) => where.externalSubscriptionId === 'sub-risk' ? { id: 'local' } : null
        }
    };
    const service = createStripeBillingService({
        db: { $transaction: async callback => callback(tx) },
        stripe,
        config: stripeConfig
    });
    const events = [
        { id: 'evt-dispute', type: 'charge.dispute.created', data: { object: { charge: 'ch-1' } } },
        { id: 'evt-refund', type: 'charge.refunded', data: { object: { id: 'ch-2', invoice: 'in-2' } } },
        { id: 'evt-fraud', type: 'radar.early_fraud_warning.created', data: { object: { charge: 'ch-3' } } }
    ];
    for (const event of events) {
        assert.deepEqual(await service.processEvent(event), { duplicate: false, processed: true });
    }
    assert.equal(retrieved.filter(([kind]) => kind === 'invoice').length, 3);
    assert.equal(retrieved.filter(([kind]) => kind === 'charge').length, 2);
});

test('rota de webhook usa raw body antes do JSON e rotas financeiras exigem autenticação', () => {
    const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
    const billingRoutes = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'billingRoutes.js'), 'utf8');
    const organizationRoutes = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'organizationRoutes.js'), 'utf8');
    const rawIndex = app.indexOf("app.post('/api/billing/webhook', express.raw");
    const jsonIndex = app.indexOf('app.use(express.json())');
    assert.ok(rawIndex >= 0 && rawIndex < jsonIndex);
    assert.match(billingRoutes, /router\.get\('\/summary', authMiddleware, requireRole\(\['ADMIN'\]\)/);
    assert.match(billingRoutes, /router\.post\('\/checkout', authMiddleware, requireRole\(\['ADMIN'\]\)/);
    assert.match(billingRoutes, /router\.post\('\/portal', authMiddleware, requireRole\(\['ADMIN'\]\)/);
    assert.match(billingRoutes, /router\.post\('\/sync-quantity', authMiddleware, requireRole\(\['ADMIN'\]\)/);
    assert.match(organizationRoutes, /router\.get\('\/current', authMiddleware/);
    assert.match(organizationRoutes, /router\.put\('\/current', authMiddleware, requireRole\(\['ADMIN'\]\)/);
});
