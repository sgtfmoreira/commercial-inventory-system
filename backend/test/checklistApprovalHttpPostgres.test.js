const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { promises: fs } = require('node:fs');

const databaseUrl = process.env.CHECKLIST_APPROVAL_HTTP_TEST_DATABASE_URL;
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
    pngChunk('IHDR', Buffer.alloc(13)), pngChunk('IDAT', Buffer.from([1, 2, 3])), pngChunk('IEND')
]);

integrationTest('aprovação, rejeição, retrabalho, concorrência e conclusão automática preservam o histórico', async t => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'bastidor-b2215-local-secret';
    process.env.NODE_ENV = 'test';
    process.env.USER_PERMISSIONS_ENABLED = 'false';
    process.env.USER_PERMISSIONS_KILL_SWITCH = 'true';
    const evidenceDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bastidor-b2215-evidence-'));
    process.env.CHECKLIST_EVIDENCE_DIR = evidenceDirectory;

    const jwt = require('jsonwebtoken');
    const prisma = require('../src/utils/prisma');
    const app = require('../src/app');
    const suffix = randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Approval ${suffix}` } });
    const establishment = await prisma.establishments.create({ data: { name: 'Approval Unit', organizationId: organization.id } });
    const createPerson = async (name, role) => {
        const user = await prisma.users.create({
            data: { name, email: `${name.toLowerCase().replace(/\s/g, '-')}-${suffix}@local`, password: 'local' }
        });
        const membership = await prisma.userEstablishment.create({
            data: { userId: user.id, establishmentId: establishment.id, role }
        });
        return { user, membership };
    };
    const executor = await createPerson('Approval Admin Executor', 'ADMIN');
    const approver = await createPerson('Approval Manager', 'MANAGER');
    const concurrentApprover = await createPerson('Approval Manager Two', 'MANAGER');

    const createTemplate = async (approvalRequired, name) => {
        const template = await prisma.checklistTemplate.create({
            data: {
                organizationId: organization.id, code: `${name.toLowerCase().replace(/\s/g, '-')}-${suffix.slice(0, 8)}`,
                name, status: 'ACTIVE', createdByMembershipId: executor.membership.id,
                versions: { create: {
                    version: 1, status: 'DRAFT', approvalRequired, passingScore: 80,
                    scoringAlgorithmVersion: 1, createdByMembershipId: executor.membership.id,
                    sections: { create: {
                        stableKey: 'opening', title: 'Abertura', position: 1,
                        items: { create: {
                            stableKey: 'ready', title: 'Unidade pronta?', position: 1,
                            responseType: 'BOOLEAN', required: true, maxPoints: 10,
                            scoringConfigJson: { expected: true }
                        } }
                    } }
                } }
            },
            include: { versions: { include: { sections: { include: { items: true } } } } }
        });
        const version = await prisma.checklistTemplateVersion.update({
            where: { id: template.versions[0].id },
            data: { status: 'PUBLISHED', publishedByMembershipId: executor.membership.id, publishedAt: new Date() }
        });
        return { version, item: template.versions[0].sections[0].items[0] };
    };
    const manual = await createTemplate(true, 'Checklist manual');
    const automatic = await createTemplate(false, 'Checklist automatico');

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
    const executorToken = token(executor);
    const approverToken = token(approver);
    const concurrentToken = token(concurrentApprover);
    const request = async (route, { bearer = executorToken, method = 'GET', body, form } = {}) => {
        const response = await fetch(`${base}${route}`, {
            method,
            headers: {
                Authorization: `Bearer ${bearer}`,
                ...(body ? { 'Content-Type': 'application/json' } : {})
            },
            body: form || (body ? JSON.stringify(body) : undefined)
        });
        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
        return { status: response.status, body: payload };
    };
    const createRun = async templateVersionId => request('/api/checklists/runs', {
        method: 'POST', body: {
            clientRequestId: randomUUID(), templateVersionId,
            assignedMembershipId: executor.membership.id,
            dueAt: new Date(Date.now() + 86_400_000).toISOString()
        }
    });
    const execute = async (runId, itemId, { uploadEvidence = false } = {}) => {
        const started = await request(`/api/checklists/runs/${runId}/start`, { method: 'POST' });
        assert.equal(started.status, 201);
        const saved = await request(`/api/checklists/attempts/${started.body.id}/responses/${itemId}`, {
            method: 'PUT', body: { value: true, notApplicable: false, version: 0 }
        });
        assert.equal(saved.status, 200);
        let evidenceId = null;
        if (uploadEvidence) {
            const form = new FormData();
            form.append('evidence', new Blob([png()], { type: 'image/png' }), 'approval.png');
            const uploaded = await request(`/api/checklists/responses/${saved.body.id}/evidences`, { method: 'POST', form });
            assert.equal(uploaded.status, 201);
            evidenceId = uploaded.body.id;
        }
        const submitted = await request(`/api/checklists/attempts/${started.body.id}/submit`, {
            method: 'POST', body: { version: started.body.version }
        });
        assert.equal(submitted.status, 200);
        return { ...submitted.body, evidenceId };
    };

    const created = await createRun(manual.version.id);
    assert.equal(created.status, 201);
    const firstAttempt = await execute(created.body.id, manual.item.id, { uploadEvidence: true });
    assert.equal(firstAttempt.status, 'SUBMITTED');

    const pending = await request('/api/checklists/approvals', { bearer: approverToken });
    assert.equal(pending.status, 200);
    assert.equal(pending.body.attempts.some(attempt => attempt.id === firstAttempt.id), true);
    const approvalEvidence = await request(`/api/checklists/approval-evidences/${firstAttempt.evidenceId}/content`, {
        bearer: approverToken
    });
    assert.equal(approvalEvidence.status, 200);
    assert.equal(approvalEvidence.body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), true);
    assert.equal((await request(`/api/checklists/approval-attempts/${firstAttempt.id}`)).status, 403);
    assert.equal((await request(`/api/checklists/attempts/${firstAttempt.id}/approve`, {
        method: 'POST', body: { version: firstAttempt.version }
    })).status, 403);

    const rejected = await request(`/api/checklists/attempts/${firstAttempt.id}/reject`, {
        bearer: approverToken, method: 'POST', body: { version: firstAttempt.version, reason: 'Corrigir a conferência do turno' }
    });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.status, 'REJECTED');
    assert.equal(rejected.body.approvals[0].decision, 'REJECT');
    assert.equal(rejected.body.approvals[0].reason, 'Corrigir a conferência do turno');

    const secondAttempt = await execute(created.body.id, manual.item.id);
    assert.equal(secondAttempt.attemptNumber, 2);
    const approved = await request(`/api/checklists/attempts/${secondAttempt.id}/approve`, {
        bearer: approverToken, method: 'POST', body: { version: secondAttempt.version }
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.status, 'APPROVED');
    assert.equal(approved.body.run.status, 'APPROVED');
    assert.equal((await request(`/api/checklists/attempts/${secondAttempt.id}/reject`, {
        bearer: concurrentToken, method: 'POST', body: { version: secondAttempt.version, reason: 'Decisão tardia' }
    })).status, 409);

    const history = await request(`/api/checklists/runs/${created.body.id}/history`, { bearer: approverToken });
    assert.equal(history.status, 200);
    assert.deepEqual(history.body.attempts.map(attempt => attempt.status), ['REJECTED', 'APPROVED']);
    assert.equal(history.body.events.some(event => event.eventType === 'ATTEMPT_REJECTED'), true);
    assert.equal(history.body.events.some(event => event.eventType === 'ATTEMPT_APPROVED'), true);
    const rejectedApproval = await prisma.checklistApproval.findFirst({ where: { attemptId: firstAttempt.id } });
    await assert.rejects(prisma.checklistApproval.update({
        where: { id: rejectedApproval.id }, data: { reason: 'Tentativa de alteração' }
    }), /append-only/);
    await assert.rejects(prisma.checklistApproval.delete({ where: { id: rejectedApproval.id } }), /append-only/);
    assert.equal(await prisma.securityAuditEvent.count({
        where: { entityType: 'ChecklistExecutionAttempt', entityId: { in: [firstAttempt.id, secondAttempt.id] } }
    }), 2);

    const concurrentRun = await createRun(manual.version.id);
    const concurrentAttempt = await execute(concurrentRun.body.id, manual.item.id);
    const decisions = await Promise.all([
        request(`/api/checklists/attempts/${concurrentAttempt.id}/approve`, {
            bearer: approverToken, method: 'POST', body: { version: concurrentAttempt.version }
        }),
        request(`/api/checklists/attempts/${concurrentAttempt.id}/reject`, {
            bearer: concurrentToken, method: 'POST', body: { version: concurrentAttempt.version, reason: 'Concorrência controlada' }
        })
    ]);
    assert.deepEqual(decisions.map(result => result.status).sort(), [200, 409]);
    assert.equal(await prisma.checklistApproval.count({ where: { attemptId: concurrentAttempt.id } }), 1);

    const automaticRun = await createRun(automatic.version.id);
    const automaticAttempt = await execute(automaticRun.body.id, automatic.item.id);
    assert.equal(automaticAttempt.status, 'APPROVED');
    assert.equal(automaticAttempt.run.status, 'APPROVED');
    assert.equal(await prisma.checklistApproval.count({ where: { attemptId: automaticAttempt.id } }), 0);
    assert.equal(await prisma.checklistRunEvent.count({
        where: { runId: automaticRun.body.id, eventType: 'ATTEMPT_AUTO_APPROVED' }
    }), 1);
});
