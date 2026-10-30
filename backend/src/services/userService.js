const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma');
const AppError = require('../utils/AppError');

const ALLOWED_ROLES = ['ADMIN', 'MANAGER', 'STAFF', 'STOCK_COUNTER'];

const validatePassword = (password) => {
    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
        throw new AppError('A senha deve ter entre 6 e 128 caracteres.', 400);
    }
};

const createUserService = ({ db = prisma, passwordService = bcrypt } = {}) => {
    const create = async ({ name, email, password, role, establishmentIds }) => {
        if (!ALLOWED_ROLES.includes(role)) {
            throw new AppError('Perfil de acesso inválido.', 400);
        }
        validatePassword(password);

        const normalizedName = name?.trim();
        const normalizedEmail = email?.trim().toLowerCase();
        if (!normalizedName || !normalizedEmail) {
            throw new AppError('Nome e e-mail são obrigatórios.', 400);
        }

        const hashedPassword = await passwordService.hash(password, 10);

        return db.$transaction(async (tx) => {
            const newUser = await tx.users.create({
                data: {
                    name: normalizedName,
                    email: normalizedEmail,
                    password: hashedPassword
                },
                select: { id: true, name: true, email: true }
            });

            let allEstablishmentIds = establishmentIds || [];

            if (allEstablishmentIds.length > 0) {
                const sourceEstablishment = await tx.establishments.findUnique({
                    where: { id: allEstablishmentIds[0] },
                    select: { organizationId: true }
                });

                if (sourceEstablishment?.organizationId) {
                    const organizationEstablishments = await tx.establishments.findMany({
                        where: { organizationId: sourceEstablishment.organizationId },
                        select: { id: true }
                    });
                    allEstablishmentIds = organizationEstablishments.map(item => item.id);
                }
            }

            if (allEstablishmentIds.length > 0) {
                await tx.userEstablishment.createMany({
                    data: allEstablishmentIds.map(establishmentId => ({
                        userId: newUser.id,
                        establishmentId,
                        role
                    })),
                    skipDuplicates: true
                });
            }

            return newUser;
        });
    };

    const update = async (id, { name, email, password, role, establishmentId }) => {
        if (role && !ALLOWED_ROLES.includes(role)) {
            throw new AppError('Perfil de acesso inválido.', 400);
        }

        const data = {
            name: name?.trim(),
            email: email?.trim().toLowerCase()
        };

        if (!data.name || !data.email) {
            throw new AppError('Nome e e-mail são obrigatórios.', 400);
        }

        if (password) {
            validatePassword(password);
            data.password = await passwordService.hash(password, 10);
        }

        return db.$transaction(async (tx) => {
            const user = await tx.users.update({
                where: { id },
                data,
                select: { id: true, name: true, email: true }
            });

            if (role && establishmentId) {
                await tx.userEstablishment.update({
                    where: {
                        userId_establishmentId: { userId: id, establishmentId }
                    },
                    data: { role }
                });
            }

            return { ...user, role };
        });
    };

    const deactivate = async ({ userId, establishmentId, actorUserId }) => {
        if (userId === actorUserId) {
            throw new AppError('Você não pode excluir o próprio usuário.', 400);
        }

        return db.$transaction(async (tx) => {
            const activeEstablishment = await tx.establishments.findUnique({
                where: { id: establishmentId },
                select: { organizationId: true }
            });
            if (!activeEstablishment) {
                throw new AppError('Estabelecimento ativo não encontrado.', 404);
            }

            let establishmentIds = [establishmentId];
            if (activeEstablishment.organizationId) {
                const organizationEstablishments = await tx.establishments.findMany({
                    where: { organizationId: activeEstablishment.organizationId },
                    select: { id: true }
                });
                establishmentIds = organizationEstablishments.map(item => item.id);
            }

            const memberships = await tx.userEstablishment.findMany({
                where: {
                    userId,
                    establishmentId: { in: establishmentIds },
                    isActive: true
                },
                select: { role: true }
            });
            if (!memberships.length) {
                throw new AppError('Usuário ativo não encontrado nesta organização.', 404);
            }

            if (memberships.some(item => item.role === 'ADMIN')) {
                const activeAdminMemberships = await tx.userEstablishment.findMany({
                    where: {
                        establishmentId: { in: establishmentIds },
                        role: 'ADMIN',
                        isActive: true
                    },
                    select: { userId: true }
                });
                const otherAdmins = new Set(
                    activeAdminMemberships
                        .map(item => item.userId)
                        .filter(activeAdminId => activeAdminId !== userId)
                );
                if (otherAdmins.size === 0) {
                    throw new AppError('Não é possível excluir o último administrador ativo da organização.', 409);
                }
            }

            const result = await tx.userEstablishment.updateMany({
                where: {
                    userId,
                    establishmentId: { in: establishmentIds },
                    isActive: true
                },
                data: { isActive: false }
            });

            return { id: userId, revokedMemberships: result.count };
        });
    };

    return { create, update, deactivate };
};

module.exports = {
    ...createUserService(),
    createUserService,
    validatePassword
};
