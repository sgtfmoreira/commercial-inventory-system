const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const { getAuthorizationFlags } = require('../config/authorization');
const { resolveLegacyRoutePolicy } = require('../constants/legacyPermissionMap');
const permissionResolver = require('../services/permissionResolverService');

const isMissingLifecycleColumn = error => (
    error?.code === 'P2022'
    && String(error?.meta?.column || error?.message || '').includes('isActive')
);

async function findMembership(userId, establishmentId) {
    try {
        return await prisma.userEstablishment.findFirst({
            where: {
                userId,
                establishmentId,
                isActive: true,
                establishment: { isActive: true }
            },
            include: {
                establishment: { select: { id: true, organizationId: true, isActive: true } }
            }
        });
    } catch (error) {
        if (!isMissingLifecycleColumn(error)) throw error;
        return prisma.userEstablishment.findUnique({
            where: { userId_establishmentId: { userId, establishmentId } },
            select: {
                id: true,
                userId: true,
                establishmentId: true,
                role: true,
                createdAt: true,
                establishment: { select: { id: true, organizationId: true } }
            }
        });
    }
}

async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({ error: 'Token não fornecido' });
        }

        const [scheme, token] = authHeader.split(' ');

        if (!scheme || !token || scheme !== 'Bearer') {
            return res.status(401).json({ error: 'Token mal formatado' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 🔥 Resiliência: Tenta pegar userId ou id do token
        const userId = decoded.userId || decoded.id;

        if (!userId) {
            return res.status(401).json({ error: 'Token inválido: Usuário não identificado' });
        }

        // 🔥 O backend usa SOMENTE o valor do JWT (req.user.establishmentId)
        // Ignora qualquer establishmentId vindo do header ou body do frontend para evitar sequestro de tenant
        const establishmentId = decoded.establishmentId;
        const roleFromToken = decoded.role;

        // 🔎 valida acesso ao estabelecimento e pega a role específica
        let role = null;
        let relation = null;
        if (establishmentId) {
            relation = await findMembership(userId, establishmentId);

            if (!relation) {
                return res.status(403).json({
                    error: 'Usuário não tem acesso a este estabelecimento'
                });
            }
            role = relation.role;

            const flags = getAuthorizationFlags();
            if (flags.enabled) {
                const policy = resolveLegacyRoutePolicy(req.method, req.originalUrl);
                if (policy) {
                    const decision = await permissionResolver.resolve({
                        capability: policy.capability,
                        legacyRoles: policy.legacyRoles,
                        membership: {
                            id: relation.id,
                            userId,
                            role: relation.role,
                            isActive: relation.isActive !== false,
                            establishmentActive: relation.establishment?.isActive !== false,
                            establishmentId,
                            organizationId: relation.establishment?.organizationId || null
                        },
                        flags
                    });
                    req.authorization = Object.freeze({
                        capability: policy.capability,
                        enforced: true,
                        ...decision
                    });
                    if (!decision.allowed) {
                        return res.status(403).json({ error: 'Acesso negado' });
                    }
                }
            }
        }

        // 🔥 Define req.user para uso nos controllers - NUNCA confie no frontend
        req.user = {
            userId: userId,
            establishmentId: establishmentId,
            role: role || roleFromToken, // Fallback para role do token se a query falhar ou for desnecessária
            membershipId: relation?.id || null,
            membershipActive: relation ? relation.isActive !== false : null,
            establishmentActive: relation ? relation.establishment?.isActive !== false : null,
            organizationId: relation?.establishment?.organizationId || null
        };

        next();

    } catch (error) {
        console.error("AUTH ERROR:", error.message);
        return res.status(401).json({
            error: 'Sessão expirada ou inválida. Por favor, faça login novamente.'
        });
    }
}

module.exports = authMiddleware;
