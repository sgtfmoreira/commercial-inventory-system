const { getAuthorizationFlags } = require('../config/authorization');
const { ANY_AUTHENTICATED } = require('../constants/legacyPermissionMap');
const permissionResolver = require('../services/permissionResolverService');

function membershipFromRequest(req) {
    return {
        id: req.user?.membershipId,
        userId: req.user?.userId,
        role: req.user?.role,
        isActive: req.user?.membershipActive !== false,
        establishmentActive: req.user?.establishmentActive !== false,
        establishmentId: req.user?.establishmentId,
        organizationId: req.user?.organizationId
    };
}

function requireCapability(capability, options = {}) {
    const legacyRoles = options.legacyRoles || ANY_AUTHENTICATED;
    return async (req, res, next) => {
        try {
            if (!req.user?.userId) return res.status(401).json({ error: 'Usuário não autenticado' });
            const decision = await permissionResolver.resolve({
                capability,
                legacyRoles,
                membership: membershipFromRequest(req),
                flags: options.flags || getAuthorizationFlags(),
                repository: options.repository
            });
            req.authorization = Object.freeze({ capability, enforced: true, ...decision });
            if (!decision.allowed) return res.status(403).json({ error: 'Acesso negado' });
            return next();
        } catch (error) {
            return next(error);
        }
    };
}

module.exports = requireCapability;
