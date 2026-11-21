const userService = require('../services/userService');

const errorStatus = error => {
    if (error.statusCode) return error.statusCode;
    if (error.code === 'P2002' || /e-mail|email/i.test(error.message || '')) return 409;
    return 400;
};

const requestContext = req => ({
    actorUserId: req.user?.userId,
    actorEstablishmentId: req.user?.establishmentId,
    organizationId: req.user?.organizationId
});

const legacyAccess = (req, body) => ([{
    establishmentId: req.user?.establishmentId,
    legacyRole: body.role,
    profileCode: body.profileCode,
    profileVersion: body.profileVersion,
    overrides: body.overrides
}]);

const create = async (req, res) => {
    try {
        const context = requestContext(req);
        if (!context.actorEstablishmentId || !context.organizationId) {
            return res.status(403).json({ error: 'Contexto organizacional inválido.' });
        }
        const accesses = Array.isArray(req.body.accesses) ? req.body.accesses : legacyAccess(req, req.body);
        const user = await userService.create({ ...req.body, ...context, accesses });
        return res.status(201).json(user);
    } catch (error) {
        return res.status(errorStatus(error)).json({ error: error.message });
    }
};

const list = async (req, res) => {
    try {
        const users = await userService.list(requestContext(req));
        return res.json(users);
    } catch (error) {
        return res.status(errorStatus(error)).json({ error: error.message });
    }
};

const update = async (req, res) => {
    try {
        const context = requestContext(req);
        const input = { ...req.body, ...context };
        if (!Array.isArray(req.body.accesses)) {
            input.establishmentIds = [context.actorEstablishmentId];
        }
        const user = await userService.update(req.params.id, input);
        return res.json(user);
    } catch (error) {
        return res.status(errorStatus(error)).json({ error: error.message });
    }
};

const remove = async (req, res) => {
    try {
        await userService.deactivate({
            userId: req.params.id,
            actorUserId: req.user?.userId,
            organizationId: req.user?.organizationId
        });
        return res.status(204).send();
    } catch (error) {
        return res.status(errorStatus(error)).json({ error: error.message });
    }
};

module.exports = { create, list, update, remove, requestContext };
