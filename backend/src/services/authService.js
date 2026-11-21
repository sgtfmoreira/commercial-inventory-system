const prisma = require('../utils/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const billingService = require('./organizationBillingService');

const JWT_SECRET = process.env.JWT_SECRET;

const legacyEstablishmentSelect = {
    id: true,
    name: true,
    cnpj: true,
    telefone: true,
    endereco: true,
    cidade: true,
    estado: true,
    organizationId: true,
    createdAt: true,
    updatedAt: true
};

const isMissingLifecycleColumn = error => (
    error?.code === 'P2022'
    && String(error?.meta?.column || error?.message || '').includes('isActive')
);

async function findUserWithMemberships(where, { includePassword = false, includeOrganization = false } = {}) {
    try {
        return await prisma.users.findUnique({
            where,
            include: {
                establishments: {
                    where: { isActive: true, establishment: { isActive: true } },
                    include: {
                        establishment: includeOrganization
                            ? { include: { organization: true } }
                            : true
                    }
                }
            }
        });
    } catch (error) {
        if (!isMissingLifecycleColumn(error)) throw error;

        const establishmentSelect = includeOrganization
            ? { ...legacyEstablishmentSelect, organization: true }
            : legacyEstablishmentSelect;

        return prisma.users.findUnique({
            where,
            select: {
                id: true,
                name: true,
                email: true,
                ...(includePassword ? { password: true } : {}),
                establishments: {
                    select: {
                        id: true,
                        userId: true,
                        establishmentId: true,
                        role: true,
                        createdAt: true,
                        establishment: { select: establishmentSelect }
                    }
                }
            }
        });
    }
}

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET deve ser configurado antes de iniciar a API.');
}

async function register(
    { name, email, password, organizationName, establishmentName },
    { db = prisma, passwordService = bcrypt, billing = billingService } = {}
) {
    const normalizedName = String(name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedOrganizationName = String(organizationName || '').trim() || `Organização ${normalizedName}`;
    const normalizedEstablishmentName = String(establishmentName || '').trim() || `${normalizedName} Restaurante`;

    if (!normalizedName || !normalizedEmail || !password) {
        throw new AppError('Nome, e-mail e senha são obrigatórios.', 400);
    }

    const existingUser = await db.users.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) throw new AppError('E-mail já cadastrado.', 409);

    const hashedPassword = await passwordService.hash(password, 10);
    return db.$transaction(async tx => {
        const organization = await tx.organization.create({
            data: { name: normalizedOrganizationName }
        });
        const establishment = await tx.establishments.create({
            data: {
                name: normalizedEstablishmentName,
                organizationId: organization.id
            }
        });
        await billing.ensureSubscription(organization.id, tx, 'PENDING');

        const defaultCategories = [
            'Bebidas', 'Alimentos', 'Proteínas', 'Hortifruti',
            'Embalagens', 'Limpeza', 'Outros'
        ];
        await tx.category.createMany({
            data: defaultCategories.map(categoryName => ({
                name: categoryName,
                establishmentId: establishment.id
            }))
        });

        const user = await tx.users.create({
            data: {
                name: normalizedName,
                email: normalizedEmail,
                password: hashedPassword
            }
        });
        await tx.userEstablishment.create({
            data: {
                userId: user.id,
                establishmentId: establishment.id,
                role: 'ADMIN'
            }
        });

        return { user, establishment, organization };
    });
}

async function login({ email, password }) {
    const user = await findUserWithMemberships(
        { email },
        { includePassword: true }
    );

    if (!user) throw new Error('Credenciais inválidas');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new Error('Credenciais inválidas');

    const defaultUE = user.establishments[0];
    if (!defaultUE) throw new Error('Credenciais inválidas');
    const establishmentsList = user.establishments.map(ue => ({
        ...ue.establishment,
        role: ue.role
    }));

    const token = jwt.sign(
        { 
            userId: user.id, 
            establishmentId: defaultUE?.establishmentId,
            role: defaultUE?.role
        },
        JWT_SECRET,
        { expiresIn: '1d' }
    );

    return {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: defaultUE?.role || null },
        establishments: establishmentsList
    };
}

async function getContext({ userId, establishmentId }) {
    const user = await findUserWithMemberships(
        { id: userId },
        { includeOrganization: true }
    );

    if (!user) throw new Error("Usuário não encontrado");

    const currentUE = user.establishments.find(ue => ue.establishmentId === establishmentId);

    return {
        user: { id: user.id, name: user.name, email: user.email, role: currentUE?.role || null },
        establishment: currentUE?.establishment || null,
        organization: currentUE?.establishment?.organization || null,
        establishments: user.establishments.map(ue => ({
            ...ue.establishment,
            role: ue.role
        }))
    };
}

async function switchEstablishment({ userId, establishmentId }) {
    let ue;
    try {
        ue = await prisma.userEstablishment.findFirst({
            where: {
                userId,
                establishmentId,
                isActive: true,
                establishment: { isActive: true }
            }
        });
    } catch (error) {
        if (!isMissingLifecycleColumn(error)) throw error;
        ue = await prisma.userEstablishment.findUnique({
            where: { userId_establishmentId: { userId, establishmentId } },
            select: {
                id: true,
                userId: true,
                establishmentId: true,
                role: true,
                createdAt: true
            }
        });
    }

    if (!ue) throw new Error("Acesso não autorizado a este estabelecimento");

    const token = jwt.sign(
        { userId, establishmentId, role: ue.role }, 
        JWT_SECRET, 
        { expiresIn: '1d' }
    );
    return { token };
}

module.exports = { 
    register, 
    login, 
    getContext, 
    switchEstablishment 
};
