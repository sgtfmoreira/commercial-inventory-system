const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const databaseUrl = process.env.CHECKLIST_TEST_DATABASE_URL;
const psqlPath = process.env.PSQL_PATH || 'psql';
const postgresTest = databaseUrl ? test : test.skip;
const psqlDatabaseUrl = databaseUrl ? databaseUrl.replace(/\?schema=[^&]+$/, '') : null;

function execute(sql, expectedSuccess = true) {
    const result = spawnSync(psqlPath, ['-v', 'ON_ERROR_STOP=1', '-Atc', sql, psqlDatabaseUrl], {
        encoding: 'utf8',
        windowsHide: true
    });
    if (expectedSuccess && result.status !== 0) {
        assert.fail(`SQL failed: ${result.stderr || result.stdout}`);
    }
    if (!expectedSuccess && result.status === 0) {
        assert.fail('SQL was expected to fail but succeeded');
    }
    return result;
}

function setupFixture() {
    const ids = {
        organizationA: randomUUID(),
        organizationB: randomUUID(),
        establishmentA: randomUUID(),
        establishmentB: randomUUID(),
        userA: randomUUID(),
        userB: randomUUID(),
        membershipA: randomUUID(),
        membershipB: randomUUID(),
        templateA: randomUUID(),
        templateB: randomUUID(),
        versionA: randomUUID(),
        versionB: randomUUID()
    };
    const suffix = randomUUID();
    execute(`
      INSERT INTO "Organization" ("id", "name", "createdAt") VALUES
        ('${ids.organizationA}', 'Checklist Org A', CURRENT_TIMESTAMP),
        ('${ids.organizationB}', 'Checklist Org B', CURRENT_TIMESTAMP);
      INSERT INTO "establishments" ("id", "name", "organizationId", "createdAt", "updatedAt") VALUES
        ('${ids.establishmentA}', 'Checklist Unit A', '${ids.organizationA}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('${ids.establishmentB}', 'Checklist Unit B', '${ids.organizationB}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      INSERT INTO "users" ("id", "name", "email", "password", "createdAt", "updatedAt") VALUES
        ('${ids.userA}', 'Checklist User A', 'a-${suffix}@checklist.local', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('${ids.userB}', 'Checklist User B', 'b-${suffix}@checklist.local', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      INSERT INTO "UserEstablishment" ("id", "userId", "establishmentId", "role", "isActive", "createdAt") VALUES
        ('${ids.membershipA}', '${ids.userA}', '${ids.establishmentA}', 'ADMIN', true, CURRENT_TIMESTAMP),
        ('${ids.membershipB}', '${ids.userB}', '${ids.establishmentB}', 'ADMIN', true, CURRENT_TIMESTAMP);
      INSERT INTO "checklist_templates"
        ("id", "organizationId", "code", "name", "status", "createdByMembershipId", "createdAt", "updatedAt") VALUES
        ('${ids.templateA}', '${ids.organizationA}', 'opening_${suffix.replaceAll('-', '').slice(0, 12)}', 'Opening A', 'ACTIVE', '${ids.membershipA}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('${ids.templateB}', '${ids.organizationB}', 'opening_${suffix.replaceAll('-', '').slice(12, 24)}', 'Opening B', 'ACTIVE', '${ids.membershipB}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      INSERT INTO "checklist_template_versions"
        ("id", "templateId", "version", "status", "approvalRequired", "passingScore", "scoringAlgorithmVersion", "createdByMembershipId", "createdAt", "updatedAt") VALUES
        ('${ids.versionA}', '${ids.templateA}', 1, 'DRAFT', true, 80, 1, '${ids.membershipA}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('${ids.versionB}', '${ids.templateB}', 1, 'DRAFT', true, 80, 1, '${ids.membershipB}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `);
    return ids;
}

function addSectionAndItem(ids, versionKey = 'versionA') {
    const sectionId = randomUUID();
    const itemId = randomUUID();
    execute(`
      INSERT INTO "checklist_template_sections"
        ("id", "templateVersionId", "stableKey", "title", "position", "createdAt", "updatedAt")
      VALUES ('${sectionId}', '${ids[versionKey]}', 'opening', 'Opening', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      INSERT INTO "checklist_template_items"
        ("id", "templateVersionId", "sectionId", "stableKey", "title", "position", "responseType", "required", "allowNotApplicable", "critical", "evidenceRequired", "maxPoints", "scoringConfigJson", "createdAt", "updatedAt")
      VALUES ('${itemId}', '${ids[versionKey]}', '${sectionId}', 'temperature_ok', 'Temperature OK', 1, 'BOOLEAN', true, false, true, false, 10, '{"expected":true}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `);
    return { sectionId, itemId };
}

postgresTest('tenant guards reject authors and publishers from another organization', () => {
    const ids = setupFixture();
    execute(`
      INSERT INTO "checklist_templates"
        ("id", "organizationId", "code", "name", "status", "createdByMembershipId", "createdAt", "updatedAt")
      VALUES ('${randomUUID()}', '${ids.organizationA}', 'cross_tenant', 'Invalid', 'ACTIVE', '${ids.membershipB}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, false);
    addSectionAndItem(ids);
    execute(`UPDATE "checklist_template_versions"
      SET "status" = 'PUBLISHED', "publishedByMembershipId" = '${ids.membershipB}', "publishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = '${ids.versionA}'`, false);
});

postgresTest('catalog constraints enforce one draft, positive points and valid positions', () => {
    const ids = setupFixture();
    execute(`INSERT INTO "checklist_template_versions"
      ("id", "templateId", "version", "status", "approvalRequired", "passingScore", "scoringAlgorithmVersion", "createdByMembershipId", "createdAt", "updatedAt")
      VALUES ('${randomUUID()}', '${ids.templateA}', 2, 'DRAFT', true, 80, 1, '${ids.membershipA}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, false);
    execute(`INSERT INTO "checklist_template_sections"
      ("id", "templateVersionId", "stableKey", "title", "position", "createdAt", "updatedAt")
      VALUES ('${randomUUID()}', '${ids.versionA}', 'invalid_position', 'Invalid', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, false);
    const { sectionId } = addSectionAndItem(ids);
    execute(`INSERT INTO "checklist_template_items"
      ("id", "templateVersionId", "sectionId", "stableKey", "title", "position", "responseType", "maxPoints", "createdAt", "updatedAt")
      VALUES ('${randomUUID()}', '${ids.versionA}', '${sectionId}', 'invalid_points', 'Invalid', 2, 'TEXT', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, false);
});

postgresTest('published versions and their content are immutable while retirement remains possible', () => {
    const ids = setupFixture();
    const { sectionId, itemId } = addSectionAndItem(ids);
    execute(`UPDATE "checklist_template_versions"
      SET "status" = 'PUBLISHED', "publishedByMembershipId" = '${ids.membershipA}', "publishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = '${ids.versionA}'`);
    execute(`UPDATE "checklist_template_sections" SET "title" = 'Changed' WHERE "id" = '${sectionId}'`, false);
    execute(`DELETE FROM "checklist_template_items" WHERE "id" = '${itemId}'`, false);
    execute(`UPDATE "checklist_template_versions" SET "passingScore" = 50, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = '${ids.versionA}'`, false);
    execute(`DELETE FROM "checklist_template_versions" WHERE "id" = '${ids.versionA}'`, false);
    execute(`UPDATE "checklist_template_versions"
      SET "status" = 'RETIRED', "retiredAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = '${ids.versionA}'`);
    execute(`UPDATE "checklist_template_versions" SET "approvalRequired" = false WHERE "id" = '${ids.versionA}'`, false);
});

postgresTest('items cannot reference a section from another template version', () => {
    const ids = setupFixture();
    const { sectionId } = addSectionAndItem(ids, 'versionB');
    execute(`INSERT INTO "checklist_template_items"
      ("id", "templateVersionId", "sectionId", "stableKey", "title", "position", "responseType", "maxPoints", "createdAt", "updatedAt")
      VALUES ('${randomUUID()}', '${ids.versionA}', '${sectionId}', 'cross_version', 'Invalid relation', 2, 'TEXT', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, false);
});

postgresTest('publishing fails closed when a draft has no complete section', () => {
    const ids = setupFixture();
    execute(`UPDATE "checklist_template_versions"
      SET "status" = 'PUBLISHED', "publishedByMembershipId" = '${ids.membershipA}', "publishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = '${ids.versionA}'`, false);
    execute(`INSERT INTO "checklist_template_sections"
      ("id", "templateVersionId", "stableKey", "title", "position", "createdAt", "updatedAt")
      VALUES ('${randomUUID()}', '${ids.versionA}', 'empty_section', 'Empty section', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
    execute(`UPDATE "checklist_template_versions"
      SET "status" = 'PUBLISHED', "publishedByMembershipId" = '${ids.membershipA}', "publishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = '${ids.versionA}'`, false);
});

postgresTest('a cloned version cannot reference a source from another template', () => {
    const ids = setupFixture();
    execute(`DELETE FROM "checklist_template_versions" WHERE "id" = '${ids.versionA}'`);
    execute(`INSERT INTO "checklist_template_versions"
      ("id", "templateId", "version", "status", "approvalRequired", "passingScore", "scoringAlgorithmVersion", "sourceVersionId", "createdByMembershipId", "createdAt", "updatedAt")
      VALUES ('${randomUUID()}', '${ids.templateA}', 2, 'DRAFT', true, 80, 1, '${ids.versionB}', '${ids.membershipA}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, false);
});
