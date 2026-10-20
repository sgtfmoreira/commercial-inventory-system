import { TABLES, normalizeBackup, shiftDate, toggleTableSelection } from './TableReservations';

test('define exatamente uma área clicável para cada mesa de 1 a 27, incluindo a 26', () => {
  expect(TABLES).toHaveLength(27);
  expect(TABLES.map(table => table.n)).toEqual(Array.from({ length:27 }, (_, index) => index + 1));
  TABLES.forEach(table => {
    expect(table.x).toBeGreaterThan(0); expect(table.x).toBeLessThan(100);
    expect(table.y).toBeGreaterThan(0); expect(table.y).toBeLessThan(100);
    expect(table.w).toBeGreaterThan(0); expect(table.h).toBeGreaterThan(0);
  });
});

test('navega entre datas sem depender do fuso UTC', () => {
  expect(shiftDate('2026-10-19', 1)).toBe('2026-10-20');
  expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
});

test('seleciona e remove várias mesas mantendo a ordem do mapa', () => {
  expect(toggleTableSelection([], 26)).toEqual([26]);
  expect(toggleTableSelection([26], 2)).toEqual([2, 26]);
  expect(toggleTableSelection([2, 26], 2)).toEqual([26]);
});

test('normaliza backup do protótipo e ignora reservas canceladas', () => {
  const result = normalizeBackup({ reservas:[
    { mesa:'26', data:'2026-10-20', horario:'19:30', nome:'Cliente', telefone:'123', pessoas:'4', observacao:'Janela' },
    { mesa:2, data:'2026-10-20', horario:'20:00', nome:'Cancelada', pessoas:2, status:'cancelada' }
  ] });
  expect(result).toEqual([{ tableNumber:26, reservationDate:'2026-10-20', reservationTime:'19:30', customerName:'Cliente', phone:'123', partySize:4, notes:'Janela' }]);
});
