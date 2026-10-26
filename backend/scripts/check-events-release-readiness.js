const fs = require('node:fs');
const path = require('node:path');
const prisma = require('../src/utils/prisma');

const migrationName = '20261005120000_add_commercial_events_phase_01';
const migrationPath = path.join(__dirname, '..', 'prisma', 'migrations', migrationName, 'migration.sql');
const expectedTables = ['commercial_event_customers', 'commercial_events', 'event_budgets', 'event_budget_items'];
const requiredTables = ['establishments', 'users', 'audit_logs', 'products'];
const expectedIndexes = [
    'commercial_events_establishmentId_eventDate_idx',
    'commercial_events_establishmentId_status_eventDate_idx',
    'event_budgets_eventId_revision_key',
    'event_budgets_one_approved_per_event',
    'event_budget_items_budgetId_sortOrder_idx'
];

async function main() {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const destructiveTokens = [...sql.matchAll(/^\s*(DROP\b|TRUNCATE\b|DELETE\s+FROM\b|UPDATE\s+[^\s]+\s+SET\b)/gim)]
        .map(match => match[1].trim().toUpperCase());
    const rows = await prisma.$queryRawUnsafe(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
        ORDER BY table_name
    `, [...requiredTables, ...expectedTables]);
    const migrations = await prisma.$queryRawUnsafe(`
        SELECT migration_name, finished_at, rolled_back_at
        FROM "_prisma_migrations"
        WHERE migration_name = $1
    `, migrationName);
    const indexes = await prisma.$queryRawUnsafe(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = ANY($1::text[])
        ORDER BY indexname
    `, expectedIndexes);
    const present = new Set(rows.map(row => row.table_name));
    const migration = migrations[0] || null;
    const presentIndexes = new Set(indexes.map(row => row.indexname));
    const applied = Boolean(migration?.finished_at && !migration?.rolled_back_at);
    const result = {
        migration: migrationName,
        migrationApplied: applied,
        deployRequired: !applied,
        requiredBaseTablesPresent: requiredTables.every(table => present.has(table)),
        missingBaseTables: requiredTables.filter(table => !present.has(table)),
        eventTablesPresent: expectedTables.filter(table => present.has(table)),
        eventTablesMissing: expectedTables.filter(table => !present.has(table)),
        indexesPresent: expectedIndexes.filter(index => presentIndexes.has(index)),
        indexesMissing: expectedIndexes.filter(index => !presentIndexes.has(index)),
        migrationSql: {
            bytes: Buffer.byteLength(sql),
            destructiveTokens,
            additiveOnlyByStaticCheck: destructiveTokens.length === 0,
            createsExpectedTables: expectedTables.every(table => sql.includes(`CREATE TABLE "${table}"`)),
            createsUniqueApprovalGuard: sql.includes('event_budgets_one_approved_per_event')
        },
        readyForControlledDeploy: requiredTables.every(table => present.has(table)) && destructiveTokens.length === 0
            && (!applied || expectedTables.every(table => present.has(table)) && expectedIndexes.every(index => presentIndexes.has(index)))
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.readyForControlledDeploy) process.exitCode = 1;
}

main().catch(error => {
    console.error(JSON.stringify({ readyForControlledDeploy: false, error: error.message }, null, 2));
    process.exitCode = 1;
}).finally(() => prisma.$disconnect());
