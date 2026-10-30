const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');

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
        if (establishmentId) {
            const relation = await prisma.userEstablishment.findUnique({
                where: {
                    userId_establishmentId: {
                        userId: userId,
                        establishmentId: establishmentId
                    }
                }
            });

            if (!relation?.isActive) {
                return res.status(403).json({
                    error: 'Usuário não tem acesso a este estabelecimento'
                });
            }
            role = relation.role;
        }

        // 🔥 Define req.user para uso nos controllers - NUNCA confie no frontend
        req.user = {
            userId: userId,
            establishmentId: establishmentId,
            role: role || roleFromToken // Fallback para role do token se a query falhar ou for desnecessária
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
