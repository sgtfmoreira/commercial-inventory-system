const test = require('node:test');
const assert = require('node:assert/strict');
const { render } = require('../src/services/eventProposalPdfService');

test('gera PDF válido somente com os campos públicos da proposta', async () => {
    const pdf = await render({
        revision: 2,
        customer: { name: 'Cliente X', document: '00.000.000/0001-00' },
        event: { name: 'Evento X', eventDate: '2026-11-15', startTime: '19:00', endTime: '23:00', guestCount: 100, location: 'Salão' },
        items: [{ name: 'Canapé', costGroup: 'MENU', quantity: '100', unit: 'un' }],
        value: '9000', pricePerGuest: '90', validUntil: '2026-10-20', notes: 'Condições comerciais.'
    });
    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.ok(pdf.length > 1000);
});

test('gera proposta longa com acentos em múltiplas páginas sem falhar', async () => {
    const pdf = await render({
        revision: 3,
        customer: { name: 'Associação São José', document: '00.000.000/0001-00' },
        event: {
            name: 'Celebração de confraternização', eventDate: '2026-12-20', startTime: '18:00',
            endTime: '23:30', guestCount: 240, location: 'Salão de recepção — São Paulo'
        },
        items: Array.from({ length: 160 }, (_, index) => ({
            name: `Opção ${index + 1}: canapé, café e pão de queijo`,
            costGroup: index % 2 === 0 ? 'MENU' : 'SERVICE', quantity: '240', unit: 'porção'
        })),
        value: '25000', pricePerGuest: '104.1667', validUntil: '2026-11-30',
        notes: 'Condições comerciais: montagem, recepção e serviço incluídos. Observações com ç, ã, é e ó.'
    });
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.ok(pdf.length > 3000);
    const pageObjects = pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || [];
    assert.ok(pageObjects.length > 1, 'A proposta longa deve ser paginada pelo PDFKit.');
});
