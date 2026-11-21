const validateQuery = schema => (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
        return res.status(422).json({
            success: false,
            message: 'Filtros inválidos.',
            errors: result.error.flatten().fieldErrors
        });
    }
    req.query = result.data;
    return next();
};

module.exports = validateQuery;
