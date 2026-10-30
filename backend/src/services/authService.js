const prisma = require('../utils/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET deve ser configurado antes de iniciar a API.');
}

async function register({ name, email, password }) {
    const existingUser = await prisma.users.findUnique({ where: { email } });
    if (existingUser) throw new Error('Email já cadastrado');

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
        const establishment = await tx.establishments.create({
            data: { name: `${name} Restaurante` }
        });

        // Seed Categorias Padrão
        const defaultCategories = [
            'Bebidas', 'Alimentos', 'Proteínas', 'Hortifruti', 
            'Embalagens', 'Limpeza', 'Outros'
        ];

        await tx.category.createMany({
            data: defaultCategories.map(cat => ({
                name: cat,
                establishmentId: establishment.id
            }))
        });

        const user = await tx.users.create({
            data: {
                name,
                email,
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

        return { user, establishment };
    });

    return result;
}

async function login({ email, password }) {
    const user = await prisma.users.findUnique({
        where: { email },
        include: { 
            establishments: { 
                where: { isActive: true },
                include: { establishment: true } 
            } 
        }
    });

    if (!user) throw new Error('Credenciais inválidas');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new Error('Credenciais inválidas');

    const defaultUE = user.establishments[0];
    if (!defaultUE) throw new Error('Credenciais inválidas');
    const establishmentsList = user.establishments.map(ue => ue.establishment);

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
    const user = await prisma.users.findUnique({
        where: { id: userId },
        include: {
            establishments: {
                where: { isActive: true },
                include: {
                    establishment: { include: { organization: true } }
                }
            }
        }
    });

    if (!user) throw new Error("Usuário não encontrado");

    const currentUE = user.establishments.find(ue => ue.establishmentId === establishmentId);

    return {
        user: { id: user.id, name: user.name, email: user.email, role: currentUE?.role || null },
        establishment: currentUE?.establishment || null,
        organization: currentUE?.establishment?.organization || null,
        establishments: user.establishments.map(ue => ue.establishment)
    };
}

async function switchEstablishment({ userId, establishmentId }) {
    const ue = await prisma.userEstablishment.findUnique({
        where: { userId_establishmentId: { userId, establishmentId } }
    });

    if (!ue?.isActive) throw new Error("Acesso não autorizado a este estabelecimento");

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
