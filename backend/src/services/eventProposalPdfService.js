const PDFDocument = require('pdfkit');
const eventBudgetService = require('./eventBudgetService');

const money = value => value == null
    ? 'A definir'
    : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = value => value
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`))
    : 'A definir';
const groupLabels = {
    MENU: 'Cardápio', STAFF: 'Equipe e atendimento', SERVICE: 'Serviços inclusos',
    EQUIPMENT: 'Equipamentos', TRANSPORT: 'Transporte', FEE: 'Taxas', OTHER: 'Outros itens'
};

const render = proposal => new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Proposta - ${proposal.event.name}` } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(22).fillColor('#111827').text(proposal.event.name);
    doc.moveDown(0.25).fontSize(11).fillColor('#6b7280').text(`Proposta comercial · revisão ${proposal.revision}`);
    doc.moveDown().strokeColor('#d1d5db').moveTo(48, doc.y).lineTo(547, doc.y).stroke().moveDown();
    doc.fillColor('#111827').fontSize(10);
    doc.text(`Cliente: ${proposal.customer.name || 'A definir'}`);
    if (proposal.customer.document) doc.text(`Documento: ${proposal.customer.document}`);
    doc.text(`Data: ${date(proposal.event.eventDate)}`);
    doc.text(`Horário: ${proposal.event.startTime || 'A definir'}${proposal.event.endTime ? ` às ${proposal.event.endTime}` : ''}`);
    doc.text(`Convidados: ${proposal.event.guestCount}`);
    doc.text(`Local: ${proposal.event.location || 'A definir'}`);

    const groups = proposal.items.reduce((result, item) => {
        (result[item.costGroup] ||= []).push(item);
        return result;
    }, {});
    for (const [group, items] of Object.entries(groups)) {
        doc.moveDown().fontSize(14).fillColor('#111827').text(groupLabels[group] || group);
        doc.moveDown(0.3).fontSize(10);
        for (const item of items) doc.text(`• ${item.name} — ${Number(item.quantity).toLocaleString('pt-BR')} ${item.unit}`);
    }

    doc.moveDown().fontSize(12).fillColor('#374151').text('Valor do evento');
    doc.fontSize(20).fillColor('#111827').text(money(proposal.value));
    doc.fontSize(10).fillColor('#6b7280').text(`${money(proposal.pricePerGuest)} por convidado`);
    if (proposal.validUntil) doc.moveDown().fillColor('#111827').text(`Validade da proposta: ${date(proposal.validUntil)}`);
    if (proposal.notes) doc.moveDown().fontSize(12).text('Observações').moveDown(0.3).fontSize(10).text(proposal.notes);
    doc.end();
});

const generate = async (budgetId, establishmentId) => render(await eventBudgetService.getProposal(budgetId, establishmentId));

module.exports = { generate, render };
