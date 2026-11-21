const AppError = require('../utils/AppError');

const REQUIRED_ENV = [
    'STRIPE_RESTRICTED_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_BASE_PRICE_ID',
    'STRIPE_ADDITIONAL_ESTABLISHMENT_PRICE_ID',
    'BILLING_SUCCESS_URL',
    'BILLING_CANCEL_URL',
    'BILLING_PORTAL_RETURN_URL'
];

function getStripeConfig(environment = process.env) {
    const missing = REQUIRED_ENV.filter(name => !String(environment[name] || '').trim());
    if (missing.length) {
        throw new AppError(`Stripe não configurada. Variáveis ausentes: ${missing.join(', ')}.`, 503);
    }

    return {
        restrictedKey: environment.STRIPE_RESTRICTED_KEY,
        webhookSecret: environment.STRIPE_WEBHOOK_SECRET,
        basePriceId: environment.STRIPE_BASE_PRICE_ID,
        additionalEstablishmentPriceId: environment.STRIPE_ADDITIONAL_ESTABLISHMENT_PRICE_ID,
        successUrl: environment.BILLING_SUCCESS_URL,
        cancelUrl: environment.BILLING_CANCEL_URL,
        portalReturnUrl: environment.BILLING_PORTAL_RETURN_URL
    };
}

module.exports = { getStripeConfig, REQUIRED_ENV };
