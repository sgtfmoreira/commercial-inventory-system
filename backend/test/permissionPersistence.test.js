const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('schema B2 é aditivo, mantém role e modela autoridade/auditoria com FKs', () => {
    const schema = fs.readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8');
    const membership = schema.match(/model\s+UserEstablishment\s*\{[\s\S]*?\n\}/)?.[0];
    assert.match(membership, /role\s+String/);
    assert.match(schema, /model UserEstablishmentAccess/);
    assert.match(schema, /mode\s+AuthorizationMode\s+@default\(LEGACY\)/);
    assert.match(schema, /model OrganizationAuthority/);
    assert.match(schema, /model SecurityAuditEvent/);
    assert.match(schema, /onDelete:\s*Restrict/);
});

test('migration não contém backfill e garante draft/active únicos e auditoria append-only', () => {
    const migration = fs.readFileSync(path.join(
        root, 'prisma', 'migrations', '20261107120000_add_user_access_control', 'migration.sql'
    ), 'utf8');
    assert.doesNotMatch(migration, /INSERT\s+INTO\s+"user_establishment_accesses"/i);
    assert.match(migration, /one_draft_per_access/);
    assert.match(migration, /one_active_per_access/);
    assert.match(migration, /deny_security_audit_event_mutation/);
    assert.match(migration, /ON DELETE RESTRICT/);
});
