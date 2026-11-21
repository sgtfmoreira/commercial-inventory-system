const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'local-test-secret-without-production-data';
process.env.USER_PERMISSIONS_ENABLED = 'false';
process.env.USER_PERMISSIONS_KILL_SWITCH = 'false';

const prisma = require('../src/utils/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authService = require('../src/services/authService');
const authMiddleware = require('../src/middlewares/authMiddleware');
const userAccessRepository = require('../src/repositories/userAccessRepository');

const userId = '11111111-1111-4111-8111-111111111111';
const membershipId = '22222222-2222-4222-8222-222222222222';
const establishmentId = '33333333-3333-4333-8333-333333333333';

const legacyAdmin = {
    id: userId,
    name: 'Administrador legado',
    email: 'admin@example.test',
    password: 'hash-local',
    establishments: [{
        id: membershipId,
        userId,
        establishmentId,
        role: 'ADMIN',
        isActive: true,
        establishment: {
            id: establishmentId,
            name: 'Unidade local',
            organizationId: 'organization-local',
            isActive: true,
            organization: { id: 'organization-local', name: 'Organização local' }
        }
    }]
};

test('login e contexto preservam ADMIN legado sem consultar configuração PROFILED', async () => {
    const originals = {
        findUnique: prisma.users.findUnique,
        compare: bcrypt.compare,
        sign: jwt.sign,
        access: userAccessRepository.findAuthorizationContext
    };
    let tokenPayload;
    let accessQueried = false;
    prisma.users.findUnique = async () => legacyAdmin;
    bcrypt.compare = async () => true;
    jwt.sign = payload => { tokenPayload = payload; return 'local-token'; };
    userAccessRepository.findAuthorizationContext = async () => {
        accessQueried = true;
        throw new Error('não deve consultar acesso novo com flag desabilitada');
    };

    try {
        const login = await authService.login({ email: legacyAdmin.email, password: 'valid' });
        assert.equal(login.token, 'local-token');
        assert.equal(login.user.role, 'ADMIN');
        assert.equal(login.establishments[0].role, 'ADMIN');
        assert.deepEqual(tokenPayload, { userId, establishmentId, role: 'ADMIN' });

        const context = await authService.getContext({ userId, establishmentId });
        assert.equal(context.user.role, 'ADMIN');
        assert.equal(context.establishment.id, establishmentId);
        assert.equal(context.organization.id, 'organization-local');
        assert.equal(accessQueried, false);
    } finally {
        prisma.users.findUnique = originals.findUnique;
        bcrypt.compare = originals.compare;
        jwt.sign = originals.sign;
        userAccessRepository.findAuthorizationContext = originals.access;
    }
});

test('authMiddleware mantém role e acrescenta contexto derivado do vínculo ativo', async () => {
    const originals = {
        findFirst: prisma.userEstablishment.findFirst,
        verify: jwt.verify,
        access: userAccessRepository.findAuthorizationContext
    };
    let accessQueried = false;
    jwt.verify = () => ({ userId, establishmentId, role: 'ADMIN' });
    prisma.userEstablishment.findFirst = async () => legacyAdmin.establishments[0];
    userAccessRepository.findAuthorizationContext = async () => {
        accessQueried = true;
        throw new Error('não deve consultar acesso novo com flag desabilitada');
    };

    const req = {
        method: 'GET',
        originalUrl: '/api/auth/context',
        headers: { authorization: 'Bearer local-token' }
    };
    const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    let nextCalled = false;

    try {
        await authMiddleware(req, response, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        assert.equal(response.statusCode, 200);
        assert.deepEqual(req.user, {
            userId,
            establishmentId,
            role: 'ADMIN',
            membershipId,
            membershipActive: true,
            establishmentActive: true,
            organizationId: 'organization-local'
        });
        assert.equal(accessQueried, false);
    } finally {
        prisma.userEstablishment.findFirst = originals.findFirst;
        jwt.verify = originals.verify;
        userAccessRepository.findAuthorizationContext = originals.access;
    }
});
