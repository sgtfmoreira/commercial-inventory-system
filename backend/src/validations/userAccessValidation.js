const { z } = require('zod');
const { PROFILE_CODES } = require('../constants/accessProfiles');
const { PERMISSION_CODES } = require('../constants/permissions');

const uuid = z.string().uuid();
const profileCode = z.enum(PROFILE_CODES);
const permissionCode = z.enum(PERMISSION_CODES);

const overrideSchema = z.object({
    permissionCode,
    effect: z.enum(['ALLOW', 'DENY']),
    reason: z.string().trim().min(3).max(500).optional().nullable()
}).strict();

const draftSchema = z.object({
    profileCode,
    profileVersion: z.number().int().positive().optional(),
    overrides: z.array(overrideSchema).max(PERMISSION_CODES.length).default([]),
    expectedVersion: z.number().int().nonnegative()
}).strict();

const activateSchema = z.object({
    expectedVersion: z.number().int().positive(),
    confirm: z.boolean()
}).strict();

const rollbackSchema = z.object({
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(3).max(500)
}).strict();

const userIdParamSchema = z.object({ userId: uuid }).strict();

const verificationMethod = z.enum([
    'ASSISTED_VERIFICATION',
    'LEGAL_DOCUMENT_REVIEW',
    'CONTRACT_VERIFICATION'
]);

const ownerDesignationSchema = z.object({ verificationMethod }).strict();

const ownerRevocationSchema = z.object({
    reason: z.string().trim().min(10).max(500)
}).strict();

const ownerTransferSchema = z.object({
    verificationMethod,
    reason: z.string().trim().min(10).max(500)
}).strict();

module.exports = {
    draftSchema,
    activateSchema,
    rollbackSchema,
    userIdParamSchema,
    ownerDesignationSchema,
    ownerRevocationSchema,
    ownerTransferSchema
};
