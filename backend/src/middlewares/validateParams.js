const validateParams = schema => (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
        return res.status(422).json({
            success: false,
            message: 'Parâmetros inválidos.',
            errors: result.error.flatten().fieldErrors
        });
    }
    req.params = result.data;
    return next();
};

module.exports = validateParams;
