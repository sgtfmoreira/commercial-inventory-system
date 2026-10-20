const test = require('node:test');
const assert = require('node:assert/strict');
const requireEstablishment = require('../src/middlewares/requireEstablishment');
const ESTABLISHMENTS = require('../src/constants/establishments');

const execute = establishmentId => {
    let nextCalled = false;
    const response = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    requireEstablishment([ESTABLISHMENTS.COMMERCIAL])(
        { user: establishmentId ? { establishmentId } : {} },
        response,
        () => { nextCalled = true; }
    );
    return { nextCalled, response };
};

test('permite reservas no Commercial', () => {
    const result = execute(ESTABLISHMENTS.COMMERCIAL);
    assert.equal(result.nextCalled, true);
});

test('bloqueia Park e Lights mesmo para usuário autenticado', () => {
    for (const id of ['6dcb1af1-3636-412c-9697-5da785c966f3', 'fc6d9d2d-3d1b-49d2-8c9c-125fbd79fb0c']) {
        const result = execute(id);
        assert.equal(result.nextCalled, false);
        assert.equal(result.response.statusCode, 403);
        assert.match(result.response.body.message, /somente para o Commercial/);
    }
});

test('rejeita sessão sem estabelecimento', () => {
    const result = execute(null);
    assert.equal(result.response.statusCode, 401);
});
