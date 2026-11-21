module.exports = function requireRole(allowedRoles = []) {
    return (req, res, next) => {

        // A decisão PROFILED já foi feita pelo resolvedor central para a capacidade
        // exata da rota. Em LEGACY, este middleware continua sendo a fonte histórica.
        if (req.authorization?.enforced && req.authorization.mode === 'PROFILED') {
            return next();
        }

        const userRole = req.user?.role;
        if (!userRole) {
            return res.status(401).json({
                error: 'Usuário sem role'
            });
        }

        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                error: 'Acesso negado para este perfil'
            });
        }

        next();
    };
};
