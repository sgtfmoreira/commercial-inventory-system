const crypto = require('crypto');
const asyncHandler = require('../utils/asyncHandler');
const billingService = require('../services/organizationBillingService');
const stripeBillingService = require('../services/stripeBillingService');

const getSummary = asyncHandler(async (req, res) => {
    const data = await billingService.getSummary(req.user.establishmentId);
    res.json({ success: true, data });
});

const createCheckout = asyncHandler(async (req, res) => {
    const checkoutAttemptId = req.headers['idempotency-key'] || crypto.randomUUID();
    const data = await stripeBillingService.createCheckoutSession(
        req.user.establishmentId,
        req.user.userId,
        checkoutAttemptId
    );
    res.status(201).json({ success: true, data });
});

const createPortal = asyncHandler(async (req, res) => {
    const data = await stripeBillingService.createPortalSession(req.user.establishmentId);
    res.status(201).json({ success: true, data });
});

const syncQuantity = asyncHandler(async (req, res) => {
    const data = await stripeBillingService.syncQuantity(req.user.establishmentId);
    res.json({ success: true, data });
});

const webhook = asyncHandler(async (req, res) => {
    const result = await stripeBillingService.handleWebhook(
        req.body,
        req.headers['stripe-signature']
    );
    res.json({ received: true, duplicate: result.duplicate, processed: result.processed });
});

module.exports = { getSummary, createCheckout, createPortal, syncQuantity, webhook };
