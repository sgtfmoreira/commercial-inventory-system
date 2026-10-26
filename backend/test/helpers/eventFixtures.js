const VALID_UUIDS = Object.freeze({
    establishmentId: '11111111-1111-4111-8111-111111111111',
    customerId: '22222222-2222-4222-8222-222222222222',
    userId: '33333333-3333-4333-8333-333333333333',
    productId: '44444444-4444-4444-8444-444444444444'
});

function buildEventCustomer(overrides = {}) {
    return {
        name: 'Empresa Exemplo',
        document: '12.345.678/0001-90',
        phone: '(11) 99999-9999',
        email: 'eventos@example.com',
        notes: null,
        ...overrides
    };
}

function buildCommercialEvent(overrides = {}) {
    return {
        customerId: VALID_UUIDS.customerId,
        name: 'Evento Corporativo Empresa Exemplo',
        type: 'CORPORATE',
        eventDate: '2026-11-15',
        startTime: '19:00',
        endTime: '23:00',
        guestCount: 150,
        location: 'São Paulo - SP',
        responsibleUserId: VALID_UUIDS.userId,
        internalNotes: null,
        ...overrides
    };
}

function buildBudgetItem(overrides = {}) {
    return {
        itemType: 'MANUAL',
        costGroup: 'MENU',
        sourceId: null,
        sourceType: null,
        nameSnapshot: 'Canapé',
        categorySnapshot: 'Entrada',
        quantityMode: 'PER_GUEST',
        fixedQuantity: null,
        quantityPerGuest: '4',
        safetyPercent: '10',
        unitSnapshot: 'un',
        unitCostSnapshot: '2.50',
        suggestedUnitPriceSnapshot: null,
        visibleInProposal: true,
        proposalLabel: null,
        internalNotes: null,
        compositionSnapshot: null,
        sortOrder: 0,
        ...overrides
    };
}

module.exports = {
    VALID_UUIDS,
    buildEventCustomer,
    buildCommercialEvent,
    buildBudgetItem
};
