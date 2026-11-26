const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'prisma', 'migrations', '20261124120000_add_operational_structure', 'migration.sql');

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
