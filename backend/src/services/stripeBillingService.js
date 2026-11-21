const Stripe = require('stripe');
const prisma = require('../utils/prisma');
const AppError = require('../utils/AppError');
const organizationBillingService = require('./organizationBillingService');
const { getStripeConfig } = require('../config/stripe');
const { ORGANIZATION_PLAN } = require('../constants/billing');

const STRIPE_API_VERSION = '2026-09-30.endive';
const CHECKOUT_INTEGRATION_IDENTIFIER = 'bastidor-organization-billing-kqmvxjrt';
const CHECKOUT_EVENTS = new Set([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed'
]);
const SUBSCRIPTION_EVENTS = new Set([
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.paused',
    'customer.subscription.resumed'
]);
const INVOICE_EVENTS = new Set([
    'invoice.paid',
    'invoice.payment_succeeded',
    'invoice.payment_failed'
]);
const RISK_EVENTS = new Set([
    'charge.dispute.created',
    'charge.refunded',
    'radar.early_fraud_warning.created'
]);

const STRIPE_STATUS = Object.freeze({
    active: 'ACTIVE',
    trialing: 'ACTIVE',
    past_due: 'PAST_DUE',
    unpaid: 'PAST_DUE',
    incomplete: 'PENDING',
    incomplete_expired: 'CANCELED',
    paused: 'SUSPENDED',
    canceled: 'CANCELED'
});

function createStripeClient(restrictedKey) {
    return new Stripe(restrictedKey, {
        apiVersion: STRIPE_API_VERSION,
        appInfo: { name: 'Bastidor OS', version: '1.0.0' }
    });
}

function asId(value) {
    if (!value) return null;
    return typeof value === 'string' ? value : value.id;
}

function unixDate(value) {
    if (value === null || value === undefined) return null;
    return Number.isFinite(Number(value)) ? new Date(Number(value) * 1000) : null;
}

function billingPeriod(subscription) {
    const items = subscription.items?.data || [];
    const starts = items.map(item => item.current_period_start).filter(Number.isFinite);
    const ends = items.map(item => item.current_period_end).filter(Number.isFinite);
    return {
        startsAt: unixDate(starts.length ? Math.min(...starts) : subscription.current_period_start),
        endsAt: unixDate(ends.length ? Math.max(...ends) : subscription.current_period_end)
    };
}

function subscriptionStatus(status) {
    return STRIPE_STATUS[status] || 'PENDING';
}

function isDuplicateWebhookError(error) {
    if (error.code !== 'P2002') return false;
    const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(',')
        : String(error.meta?.target || '');
    return target.includes('stripeEventId');
}

function requireLocalMatch(result, eventType) {
    if (!result || result.count < 1) {
        throw new AppError(`Evento Stripe ${eventType} sem assinatura local correspondente.`, 409);
    }
}

function validateCheckoutAttemptId(value) {
    const attemptId = String(value || '').trim();
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(attemptId)) {
        throw new AppError('Identificador da tentativa de Checkout inválido.', 400);
    }
    return attemptId;
}

async function organizationContext(establishmentId, db) {
    const organizationId = await organizationBillingService.getOrganizationId(establishmentId, db);
    const organization = await db.organization.findUnique({
        where: { id: organizationId },
        include: {
            subscription: true,
            establishments: { where: { isActive: true }, select: { id: true } }
        }
    });
    if (!organization) throw new AppError('Organização não encontrada.', 404);
    const subscription = organization.subscription ||
        await organizationBillingService.ensureSubscription(organizationId, db);
    return { organization, subscription };
}

function lineItems(establishmentCount, config) {
    const pricing = organizationBillingService.calculateMonthlyPrice(establishmentCount);
    const items = [{ price: config.basePriceId, quantity: 1 }];
    if (pricing.additionalEstablishments > 0) {
        items.push({
            price: config.additionalEstablishmentPriceId,
            quantity: pricing.additionalEstablishments
        });
    }
    return items;
}

function validatePrice(price, expectedAmount, label) {
    const valid = price.active !== false &&
        price.currency?.toUpperCase() === ORGANIZATION_PLAN.currency &&
        price.unit_amount === expectedAmount &&
        price.recurring?.interval === 'month' &&
        (price.recurring?.interval_count || 1) === 1;
    if (!valid) {
        throw new AppError(`O preço Stripe de ${label} não corresponde ao plano comercial.`, 503);
    }
}

function createStripeBillingService({
    db = prisma,
    config = getStripeConfig(),
    stripe = createStripeClient(config.restrictedKey)
} = {}) {
    async function createCheckoutSession(establishmentId, userId, checkoutAttemptId) {
        const { organization, subscription } = await organizationContext(establishmentId, db);
        if (subscription.externalSubscriptionId && subscription.status !== 'CANCELED') {
            throw new AppError('A organização já possui uma assinatura. Use o Portal de cobrança.', 409);
        }

        const [basePrice, additionalPrice] = await Promise.all([
            stripe.prices.retrieve(config.basePriceId),
            stripe.prices.retrieve(config.additionalEstablishmentPriceId)
        ]);
        validatePrice(basePrice, subscription.basePriceCents, 'plano base');
        validatePrice(additionalPrice, subscription.additionalEstablishmentPriceCents, 'estabelecimento adicional');

        let customerId = subscription.externalCustomerId;
        if (!customerId) {
            const user = await db.users.findUnique({ where: { id: userId }, select: { email: true } });
            const customer = await stripe.customers.create({
                name: organization.name,
                email: user?.email || undefined,
                metadata: { organizationId: organization.id }
            }, { idempotencyKey: `organization-customer-${organization.id}` });
            customerId = customer.id;
            await db.organizationSubscription.update({
                where: { organizationId: organization.id },
                data: { externalCustomerId: customerId }
            });
        }

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: customerId,
            client_reference_id: organization.id,
            line_items: lineItems(organization.establishments.length, config),
            success_url: config.successUrl,
            cancel_url: config.cancelUrl,
            billing_address_collection: 'required',
            integration_identifier: CHECKOUT_INTEGRATION_IDENTIFIER,
            metadata: { organizationId: organization.id },
            subscription_data: { metadata: { organizationId: organization.id } }
        }, {
            idempotencyKey: `organization-checkout-${organization.id}-${validateCheckoutAttemptId(checkoutAttemptId)}`
        });

        return { id: session.id, url: session.url };
    }

    async function createPortalSession(establishmentId) {
        const { subscription } = await organizationContext(establishmentId, db);
        if (!subscription.externalCustomerId) {
            throw new AppError('A organização ainda não possui cliente cadastrado na Stripe.', 409);
        }
        const session = await stripe.billingPortal.sessions.create({
            customer: subscription.externalCustomerId,
            return_url: config.portalReturnUrl
        });
        return { url: session.url };
    }

    async function syncQuantity(establishmentId) {
        const { organization, subscription } = await organizationContext(establishmentId, db);
        if (!subscription.externalSubscriptionId || subscription.status === 'CANCELED') {
            return { status: 'NOT_APPLICABLE', establishmentCount: organization.establishments.length };
        }

        const remote = await stripe.subscriptions.retrieve(subscription.externalSubscriptionId);
        const items = remote.items?.data || [];
        const baseItem = items.find(item => item.price?.id === config.basePriceId);
        const additionalItem = items.find(item => item.price?.id === config.additionalEstablishmentPriceId);
        if (!baseItem) throw new AppError('Assinatura Stripe sem item base.', 409);

        const additionalQuantity = Math.max(0, organization.establishments.length - 1);
        if (additionalQuantity > 0 && additionalItem) {
            await stripe.subscriptionItems.update(additionalItem.id, {
                quantity: additionalQuantity,
                proration_behavior: 'create_prorations'
            }, {
                idempotencyKey: `organization-subscription-item-${remote.id}-${additionalItem.id}-${additionalQuantity}`
            });
        } else if (additionalQuantity > 0) {
            await stripe.subscriptionItems.create({
                subscription: remote.id,
                price: config.additionalEstablishmentPriceId,
                quantity: additionalQuantity,
                proration_behavior: 'create_prorations'
            }, {
                idempotencyKey: `organization-subscription-additional-${remote.id}-${additionalQuantity}`
            });
        } else if (additionalItem) {
            await stripe.subscriptionItems.del(additionalItem.id, {
                proration_behavior: 'create_prorations'
            }, {
                idempotencyKey: `organization-subscription-item-delete-${remote.id}-${additionalItem.id}`
            });
        }

        await db.organizationSubscription.update({
            where: { organizationId: organization.id },
            data: { quantitySyncPending: false }
        });
        return { status: 'SYNCED', establishmentCount: organization.establishments.length };
    }

    async function updateFromSubscription(tx, remote, eventType) {
        const period = billingPeriod(remote);
        const data = {
            externalCustomerId: asId(remote.customer),
            externalSubscriptionId: remote.id,
            status: subscriptionStatus(remote.status),
            currentPeriodStartsAt: period.startsAt,
            currentPeriodEndsAt: period.endsAt,
            canceledAt: remote.status === 'canceled' ? unixDate(remote.canceled_at) || new Date() : null
        };
        let result = await tx.organizationSubscription.updateMany({
            where: { externalSubscriptionId: remote.id },
            data
        });
        if (result.count < 1 && remote.metadata?.organizationId) {
            result = await tx.organizationSubscription.updateMany({
                where: { organizationId: remote.metadata.organizationId },
                data
            });
        }
        requireLocalMatch(result, eventType);
    }

    async function updateFromCheckout(tx, remote, eventType) {
        const externalCustomerId = asId(remote.customer);
        const externalSubscriptionId = asId(remote.subscription);
        const organizationId = remote.client_reference_id || remote.metadata?.organizationId;
        const candidates = [
            externalSubscriptionId && { externalSubscriptionId },
            externalCustomerId && { externalCustomerId },
            organizationId && { organizationId }
        ].filter(Boolean);
        if (!candidates.length) throw new AppError(`Evento Stripe ${eventType} sem identificadores.`, 422);

        const status = eventType === 'checkout.session.async_payment_failed'
            ? 'PAST_DUE'
            : remote.payment_status === 'paid' ? 'ACTIVE' : 'PENDING';
        const data = { status };
        if (externalCustomerId) data.externalCustomerId = externalCustomerId;
        if (externalSubscriptionId) data.externalSubscriptionId = externalSubscriptionId;

        let result = { count: 0 };
        for (const where of candidates) {
            result = await tx.organizationSubscription.updateMany({ where, data });
            if (result.count > 0) break;
        }
        requireLocalMatch(result, eventType);
    }

    async function subscriptionIdFromRiskEvent(event) {
        const object = event.data.object;
        let charge = event.type === 'charge.refunded' ? object : null;
        if (!charge) {
            const chargeId = asId(object.charge);
            if (chargeId) charge = await stripe.charges.retrieve(chargeId);
        }
        const invoiceId = asId(charge?.invoice);
        if (!invoiceId) return null;
        const invoice = await stripe.invoices.retrieve(invoiceId);
        return asId(invoice.subscription) || asId(invoice.parent?.subscription_details?.subscription);
    }

    async function processEvent(event) {
        const riskSubscriptionId = RISK_EVENTS.has(event.type)
            ? await subscriptionIdFromRiskEvent(event)
            : null;
        try {
            return await db.$transaction(async tx => {
                await tx.billingWebhookEvent.create({
                    data: { stripeEventId: event.id, type: event.type }
                });

                const object = event.data.object;
                let processed = true;
                if (CHECKOUT_EVENTS.has(event.type)) {
                    await updateFromCheckout(tx, object, event.type);
                } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
                    await updateFromSubscription(tx, object, event.type);
                } else if (INVOICE_EVENTS.has(event.type)) {
                    const externalSubscriptionId = asId(object.subscription) ||
                        asId(object.parent?.subscription_details?.subscription);
                    if (!externalSubscriptionId) throw new AppError(`Evento Stripe ${event.type} sem assinatura.`, 422);
                    const result = await tx.organizationSubscription.updateMany({
                        where: { externalSubscriptionId },
                        data: { status: event.type === 'invoice.payment_failed' ? 'PAST_DUE' : 'ACTIVE' }
                    });
                    requireLocalMatch(result, event.type);
                } else if (RISK_EVENTS.has(event.type)) {
                    if (!riskSubscriptionId) throw new AppError(`Evento Stripe ${event.type} sem assinatura.`, 422);
                    const match = await tx.organizationSubscription.findUnique({
                        where: { externalSubscriptionId: riskSubscriptionId },
                        select: { id: true }
                    });
                    if (!match) throw new AppError(`Evento Stripe ${event.type} sem assinatura local.`, 409);
                } else {
                    processed = false;
                }
                return { duplicate: false, processed };
            });
        } catch (error) {
            if (isDuplicateWebhookError(error)) return { duplicate: true, processed: false };
            throw error;
        }
    }

    async function handleWebhook(payload, signature) {
        if (!signature) throw new AppError('Assinatura Stripe ausente.', 400);
        let event;
        try {
            event = stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);
        } catch (_error) {
            throw new AppError('Assinatura Stripe inválida.', 400);
        }
        return processEvent(event);
    }

    return {
        createCheckoutSession,
        createPortalSession,
        syncQuantity,
        processEvent,
        handleWebhook
    };
}

function service() {
    return createStripeBillingService();
}

module.exports = {
    createStripeBillingService,
    createStripeClient,
    subscriptionStatus,
    billingPeriod,
    lineItems,
    validatePrice,
    validateCheckoutAttemptId,
    isDuplicateWebhookError,
    CHECKOUT_INTEGRATION_IDENTIFIER,
    STRIPE_API_VERSION,
    createCheckoutSession: (...args) => service().createCheckoutSession(...args),
    createPortalSession: (...args) => service().createPortalSession(...args),
    syncQuantity: (...args) => service().syncQuantity(...args),
    handleWebhook: (...args) => service().handleWebhook(...args)
};
