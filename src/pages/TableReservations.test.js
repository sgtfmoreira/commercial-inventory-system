import {
  TABLES,
  normalizeBackup,
  shiftDate,
  toggleTableSelection,
  uniqueGroupItems,
  canCheckInReservation
} from './TableReservations';
import api from '../services/api';
import tableReservationService from '../services/tableReservationService';
import tableOccupancyService from '../services/tableOccupancyService';

jest.mock('../services/api', () => ({
  __esModule:true,
  default:{ get:jest.fn(), post:jest.fn(), patch:jest.fn() }
}));

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

test('clientes HTTP preservam batch e acrescentam check-in e métricas', () => {
  tableReservationService.createBatch({ tableNumbers:[2, 26] });
  expect(api.post).toHaveBeenCalledWith('/table-reservations/batch', { tableNumbers:[2, 26] });

  tableReservationService.checkIn('reservation-a', { version:1 });
  expect(api.post).toHaveBeenCalledWith('/table-reservations/reservation-a/check-in', { version:1 });

  tableOccupancyService.createBatch({ tableNumbers:[2, 26] });
  expect(api.post).toHaveBeenCalledWith('/table-occupancies/batch', { tableNumbers:[2, 26] });

  tableOccupancyService.metrics('2026-10-01', '2026-10-31');
  expect(api.get).toHaveBeenCalledWith('/table-occupancies/metrics', {
    skipGlobalLoading:true,
    params:{ dateFrom:'2026-10-01', dateTo:'2026-10-31' }
  });
});

test('grupos aparecem uma vez e expõem uma única ação de check-in elegível', () => {
  const reservations = [
    { id:'a', reservationGroupId:'group-a', status:'CONFIRMED', reservationDate:'2026-10-20', checkedInAt:null },
    { id:'b', reservationGroupId:'group-a', status:'CONFIRMED', reservationDate:'2026-10-20', checkedInAt:null }
  ];
  const visible = uniqueGroupItems(reservations, 'reservationGroupId');
  expect(visible).toHaveLength(1);
  expect(canCheckInReservation(visible[0], '2026-10-20')).toBe(true);
  expect(canCheckInReservation({ ...visible[0], checkedInAt:new Date() }, '2026-10-20')).toBe(false);
  expect(canCheckInReservation(visible[0], '2026-10-21')).toBe(false);
});
