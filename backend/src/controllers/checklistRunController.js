const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const service = require('../services/checklistRunService');
const executionService = require('../services/checklistExecutionService');
const approvalService = require('../services/checklistApprovalService');
const reportService = require('../services/checklistReportService');

function context(req) {
    if (!req.user?.userId || !req.user?.membershipId || !req.user?.establishmentId || !req.user?.organizationId) {
        throw new AppError('Contexto de organização e estabelecimento inválido.', 403);
    }
    return {
        userId: req.user.userId, membershipId: req.user.membershipId,
        establishmentId: req.user.establishmentId, organizationId: req.user.organizationId,
        role: req.user.role, membershipActive: req.user.membershipActive,
        establishmentActive: req.user.establishmentActive
    };
}

const capabilities = asyncHandler(async (req, res) => res.json({ capabilities: await service.capabilities(context(req)) }));
const publishedTemplates = asyncHandler(async (req, res) => res.json({ templates: await service.publishedTemplates(context(req)) }));
const eligibleAssignees = asyncHandler(async (req, res) => res.json({ assignees: await service.eligibleAssignees(context(req)) }));
const list = asyncHandler(async (req, res) => res.json({ runs: await service.list(context(req)) }));
const get = asyncHandler(async (req, res) => res.json(await service.get(context(req), req.params.runId)));
const create = asyncHandler(async (req, res) => res.status(201).json(await service.create(context(req), req.body)));
const reassign = asyncHandler(async (req, res) => res.json(await service.reassign(context(req), req.params.runId, req.body)));
const listMine = asyncHandler(async (req, res) => res.json({ runs: await executionService.listMine(context(req)) }));
const start = asyncHandler(async (req, res) => res.status(201).json(await executionService.start(context(req), req.params.runId)));
const getAttempt = asyncHandler(async (req, res) => res.json(await executionService.getAttempt(context(req), req.params.attemptId)));
const saveResponse = asyncHandler(async (req, res) => res.json(await executionService.saveResponse(context(req), req.params.attemptId, req.params.itemId, req.body)));
const addEvidence = asyncHandler(async (req, res) => res.status(201).json(await executionService.addEvidence(context(req), req.params.responseId, req.file)));
const evidenceContent = asyncHandler(async (req, res) => {
    const result = await executionService.readEvidence(context(req), req.params.evidenceId);
    res.setHeader('Content-Type', result.evidence.contentType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(result.buffer);
});
const submit = asyncHandler(async (req, res) => res.json(await executionService.submit(context(req), req.params.attemptId, req.body)));
const pendingApprovals = asyncHandler(async (req, res) => res.json({ attempts: await approvalService.listPending(context(req)) }));
const approvalAttempt = asyncHandler(async (req, res) => res.json(await approvalService.getAttempt(context(req), req.params.attemptId)));
const approve = asyncHandler(async (req, res) => res.json(await approvalService.approve(context(req), req.params.attemptId, req.body)));
const reject = asyncHandler(async (req, res) => res.json(await approvalService.reject(context(req), req.params.attemptId, req.body)));
const approvalEvidenceContent = asyncHandler(async (req, res) => {
    const result = await approvalService.readEvidence(context(req), req.params.evidenceId);
    res.setHeader('Content-Type', result.evidence.contentType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(result.buffer);
});
const history = asyncHandler(async (req, res) => res.json(await approvalService.history(context(req), req.params.runId)));
const report = asyncHandler(async (req, res) => res.json(await reportService.getReport(context(req), req.query)));

module.exports = {
    context, capabilities, publishedTemplates, eligibleAssignees, list, get, create, reassign,
    listMine, start, getAttempt, saveResponse, addEvidence, evidenceContent, submit,
    pendingApprovals, approvalAttempt, approve, reject, approvalEvidenceContent, history, report
};
