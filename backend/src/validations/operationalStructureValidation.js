const { z } = require('zod');

const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(120);
const sectorDescription = z.string().trim().min(1).max(500).nullable().optional();
const roleDescription = z.string().trim().min(1).max(1000).nullable().optional();
const version = z.number().int().positive();

const idParamSchema = z.object({ id: uuid }).strict();
const listSectorSchema = z.object({
    search: z.string().trim().max(120).optional(),
    active: z.enum(['all', 'true', 'false']).default('all')
}).strict();
const listRoleSchema = listSectorSchema.extend({ sectorId: uuid.optional() }).strict();

const createSectorSchema = z.object({ name, description: sectorDescription }).strict();
const updateSectorSchema = z.object({
    name: name.optional(), description: sectorDescription, version
}).strict().refine(value => value.name !== undefined || value.description !== undefined, {
    message: 'Informe ao menos um campo para atualização.'
});
const createRoleSchema = z.object({ sectorId: uuid, name, description: roleDescription }).strict();
const updateRoleSchema = z.object({
    sectorId: uuid.optional(), name: name.optional(), description: roleDescription, version
}).strict().refine(value => value.sectorId !== undefined || value.name !== undefined || value.description !== undefined, {
    message: 'Informe ao menos um campo para atualização.'
});
const statusSchema = z.object({ isActive: z.boolean(), version }).strict();

module.exports = {
    idParamSchema, listSectorSchema, listRoleSchema,
    createSectorSchema, updateSectorSchema, createRoleSchema, updateRoleSchema, statusSchema
};
