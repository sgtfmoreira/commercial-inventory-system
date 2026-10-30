const userService = require('../services/userService');

const create = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const establishmentId = req.user.establishmentId;

        if (!establishmentId) {
            return res.status(400).json({
                error: "Não foi possível identificar seu estabelecimento ativo."
            });
        }

        const user = await userService.create({
            name,
            email,
            password,
            role,
            establishmentIds: [establishmentId]
        });

        return res.json(user);
    } catch (error) {
        return res.status(postErrorStatus(error)).json({ error: error.message });
    }
};

const postErrorStatus = (error) => {
    if (error.statusCode) return error.statusCode;
    if (error.message.includes('email')) return 409;
    return 400;
};
const prisma = require('../config/prisma');

const list = async (req, res) => {
    try {
        const establishmentId = req.user?.establishmentId;

        if (!establishmentId) {
            return res.status(400).json({
                error: 'Não foi possível identificar seu estabelecimento. Faça login novamente.'
            });
        }

        const users = await prisma.users.findMany({
            where: {
                establishments: {
                    some: {
                        establishmentId: establishmentId,
                        isActive: true
                    }
                }
            },
            select: {
                id: true,
                name: true,
                email: true,
                establishments: {
                    where: { establishmentId: establishmentId, isActive: true },
                    select: { role: true }
                }
            }
        });

        const formattedUsers = users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.establishments[0]?.role
        }));

        return res.json(formattedUsers);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Erro ao listar usuários' });
    }
};

const update = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, password, role } = req.body;
        const establishmentId = req.user.establishmentId;

        if (id === req.user.userId && role && role !== 'ADMIN') {
            return res.status(400).json({
                error: 'Você não pode remover o próprio perfil de administrador.'
            });
        }

        // 🛡️ VERIFICAÇÃO DE PERTENCIMENTO AO TENANT
        const membership = await prisma.userEstablishment.findUnique({
            where: {
                userId_establishmentId: {
                    userId: id,
                    establishmentId
                }
            }
        });

        if (!membership?.isActive) {
            return res.status(403).json({ 
                error: "Você não tem permissão para editar usuários de outros estabelecimentos." 
            });
        }

        const user = await userService.update(id, {
            name,
            email,
            password,
            role,
            establishmentId
        });

        return res.json(user);
    } catch (error) {
        return res.status(postErrorStatus(error)).json({ error: error.message });
    }
};

const remove = async (req, res) => {
    try {
        await userService.deactivate({
            userId: req.params.id,
            establishmentId: req.user.establishmentId,
            actorUserId: req.user.userId
        });
        return res.status(204).send();
    } catch (error) {
        return res.status(postErrorStatus(error)).json({ error: error.message });
    }
};

module.exports = {
    create,
    list,
    update,
    remove
};
