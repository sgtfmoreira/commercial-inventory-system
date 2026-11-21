const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { promises: fs } = require('node:fs');

const databaseUrl = process.env.CHECKLIST_EXECUTION_HTTP_TEST_DATABASE_URL;
const integrationTest = databaseUrl ? test : test.skip;

function pngChunk(type, data = Buffer.alloc(0)) {
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    chunk.write(type, 4, 4, 'ascii');
    data.copy(chunk, 8);
    return chunk;
}

const png = () => Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', Buffer.alloc(13)),
    pngChunk('eXIf', Buffer.from('private-location')),
    pngChunk('IDAT', Buffer.from([1, 2, 3])),
    pngChunk('IEND')
]);

integrationTest('executor salva, anexa foto e submete somente a ocorrência atribuída', async t => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'bastidor-b2214-local-secret';
    process.env.NODE_ENV = 'test';
    process.env.USER_PERMISSIONS_ENABLED = 'false';
    process.env.USER_PERMISSIONS_KILL_SWITCH = 'true';
    const evidenceDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bastidor-b2214-evidence-'));
    process.env.CHECKLIST_EVIDENCE_DIR = evidenceDirectory;

    const jwt = require('jsonwebtoken');
    const prisma = require('../src/utils/prisma');
    const app = require('../src/app');
    const suffix = randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Execution ${suffix}` } });
    const establishment = await prisma.establishments.create({ data: { name: 'Execution Unit', organizationId: organization.id } });
    const createPerson = async (name, role) => {
        const user = await prisma.users.create({ data: { name, email: `${name.toLowerCase().replace(/\s/g, '-')}-${suffix}@local`, password: 'local' } });
        const membership = await prisma.userEstablishment.create({ data: { userId: user.id, establishmentId: establishment.id, role } });
        return { user, membership };
    };
    const admin = await createPerson('Execution Admin', 'ADMIN');
    const executor = await createPerson('Execution Staff', 'STAFF');
    const other = await createPerson('Execution Other', 'STAFF');

    const template = await prisma.checklistTemplate.create({
        data: {
            organizationId: organization.id, code: `execute-${suffix.slice(0, 8)}`,
            name: 'Abertura com evidência', status: 'ACTIVE', createdByMembershipId: admin.membership.id,
            versions: { create: {
                version: 1, status: 'DRAFT', approvalRequired: true, passingScore: 80,
                scoringAlgorithmVersion: 1, createdByMembershipId: admin.membership.id,
                sections: { create: {
                    stableKey: 'opening', title: 'Abertura', position: 1,
                    items: { create: {
                        stableKey: 'ready', title: 'Unidade pronta?', position: 1,
                        responseType: 'BOOLEAN', required: true, evidenceRequired: true,
                        maxPoints: 10, scoringConfigJson: { expected: true }
                    } }
                } }
            } }
        },
        include: { versions: { include: { sections: { include: { items: true } } } } }
    });
    const published = await prisma.checklistTemplateVersion.update({
        where: { id: template.versions[0].id },
        data: { status: 'PUBLISHED', publishedByMembershipId: admin.membership.id, publishedAt: new Date() }
    });
    const item = template.versions[0].sections[0].items[0];

    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        await prisma.$disconnect();
        delete process.env.CHECKLIST_EVIDENCE_DIR;
        await fs.rm(evidenceDirectory, { recursive: true, force: true });
    });

    const base = `http://127.0.0.1:${server.address().port}`;
    const token = person => jwt.sign({
        userId: person.user.id, establishmentId: establishment.id, role: person.membership.role
    }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const adminToken = token(admin);
    const executorToken = token(executor);
    const otherToken = token(other);
    const request = async (route, { bearer = executorToken, method = 'GET', body, form } = {}) => {
        const response = await fetch(`${base}${route}`, {
            method,
            headers: {
                ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
                ...(body ? { 'Content-Type': 'application/json' } : {})
            },
            body: form || (body ? JSON.stringify(body) : undefined)
        });
        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
        return { status: response.status, body: payload, headers: response.headers };
    };

    const created = await request('/api/checklists/runs', {
        bearer: adminToken, method: 'POST', body: {
            clientRequestId: randomUUID(), templateVersionId: published.id,
            assignedMembershipId: executor.membership.id,
            dueAt: new Date(Date.now() + 86_400_000).toISOString()
        }
    });
    assert.equal(created.status, 201);

    const mine = await request('/api/checklists/my-runs');
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.runs.map(run => run.id), [created.body.id]);
    assert.deepEqual((await request('/api/checklists/my-runs', { bearer: otherToken })).body.runs, []);
    assert.equal((await request(`/api/checklists/runs/${created.body.id}/start`, { bearer: otherToken, method: 'POST' })).status, 404);

    const started = await request(`/api/checklists/runs/${created.body.id}/start`, { method: 'POST' });
    assert.equal(started.status, 201);
    assert.equal(started.body.status, 'IN_PROGRESS');
    const repeatedStart = await request(`/api/checklists/runs/${created.body.id}/start`, { method: 'POST' });
    assert.equal(repeatedStart.status, 201);
    assert.equal(repeatedStart.body.id, started.body.id);

    const saved = await request(`/api/checklists/attempts/${started.body.id}/responses/${item.id}`, {
        method: 'PUT', body: { value: true, notApplicable: false, note: 'Conferido', version: 0 }
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.outcome, 'PASS');
    assert.equal(saved.body.version, 1);
    assert.equal((await request(`/api/checklists/attempts/${started.body.id}/responses/${item.id}`, {
        method: 'PUT', body: { value: false, notApplicable: false, version: 0 }
    })).status, 409);
    assert.equal((await request(`/api/checklists/attempts/${started.body.id}/submit`, {
        method: 'POST', body: { version: started.body.version }
    })).status, 422);

    const form = new FormData();
    form.append('evidence', new Blob([png()], { type: 'image/png' }), 'location.png');
    const uploaded = await request(`/api/checklists/responses/${saved.body.id}/evidences`, { method: 'POST', form });
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.contentType, 'image/png');
    const content = await request(`/api/checklists/evidences/${uploaded.body.id}/content`);
    assert.equal(content.status, 200);
    assert.equal(content.body.includes(Buffer.from('private-location')), false);
    assert.equal((await request(`/api/checklists/evidences/${uploaded.body.id}/content`, { bearer: otherToken })).status, 404);

    const submitted = await request(`/api/checklists/attempts/${started.body.id}/submit`, {
        method: 'POST', body: { version: started.body.version }
    });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.body.status, 'SUBMITTED');
    assert.equal(submitted.body.score, 100);
    assert.equal(submitted.body.isCompliant, true);
    assert.equal((await request(`/api/checklists/attempts/${started.body.id}/responses/${item.id}`, {
        method: 'PUT', body: { value: false, notApplicable: false, version: saved.body.version }
    })).status, 404);

    const events = await prisma.checklistRunEvent.findMany({ where: { runId: created.body.id }, orderBy: { sequence: 'asc' } });
    assert.deepEqual(events.map(event => event.eventType), ['RUN_CREATED', 'ATTEMPT_STARTED', 'RESPONSE_SAVED', 'EVIDENCE_ADDED', 'ATTEMPT_SUBMITTED']);
    await assert.rejects(
        prisma.checklistResponse.delete({ where: { id: saved.body.id } }),
        /append-only/
    );
});
