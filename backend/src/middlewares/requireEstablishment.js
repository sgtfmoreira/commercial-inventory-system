module.exports = function requireEstablishment(allowedEstablishmentIds = []) {
    const allowed = new Set(allowedEstablishmentIds);

    return (req, res, next) => {
        const establishmentId = req.user?.establishmentId;
        if (!establishmentId) {
            return res.status(401).json({ success: false, message: 'Estabelecimento não identificado.' });
        }
        if (!allowed.has(establishmentId)) {
            return res.status(403).json({
                success: false,
                message: 'Reservas de mesas estão disponíveis somente para o Commercial.'
            });
        }
        next();
    };
};
