const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'prisma', 'migrations', '20261124120000_add_operational_structure', 'migration.sql');
const assignmentMigrationPath = path.join(__dirname, '..', 'prisma', 'migrations', '20261126190000_add_membership_operational_roles', 'migration.sql');

test('migration O1 é aditiva e contém as barreiras estruturais essenciais', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.match(sql, /CREATE TABLE "operational_sectors"/);
    assert.match(sql, /CREATE TABLE "operational_roles"/);
    assert.match(sql, /operational_sectors_establishmentId_normalizedName_key/);
    assert.match(sql, /operational_roles_establishmentId_normalizedName_key/);
    assert.match(sql, /operational_roles_sectorId_establishmentId_fkey/);
    assert.match(sql, /operational sector has active roles/);
    assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN)\b/i);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
});

test('migration O2 preserva usuários e cria vínculos operacionais append-only', () => {
    const sql = fs.readFileSync(assignmentMigrationPath, 'utf8');
    assert.match(sql, /CREATE TABLE "membership_operational_roles"/);
    assert.match(sql, /membership_operational_roles_active_role_key/);
    assert.match(sql, /membership_operational_roles_active_primary_key/);
    assert.match(sql, /operational assignments are append-only/);
    assert.match(sql, /operational assignment requires active membership/);
    assert.match(sql, /operational role has active employee assignments/);
    assert.doesNotMatch(sql, /ALTER TABLE "UserEstablishment" ADD COLUMN/i);
    assert.doesNotMatch(sql, /UPDATE "UserEstablishment"/i);
    assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN)\b/i);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
});
