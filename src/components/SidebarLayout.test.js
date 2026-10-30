import { NAV_GROUPS, isNavigationItemActive, isNavigationItemVisible } from './SidebarLayout';
import { ESTABLISHMENTS } from '../constants/establishments';

const items = NAV_GROUPS.flatMap(group => group.items);

test('preserva todos os destinos da navegação ao reorganizar os grupos', () => {
  expect(NAV_GROUPS.map(group => group.label)).toEqual([
    'Compras',
    'Estoque',
    'Operação',
    'Comercial',
    'Análises',
    'Organização',
  ]);

  expect(items.map(item => item.to).sort()).toEqual([
    '/activity-log',
    '/commercial-agreements',
    '/entries',
    '/events',
    '/financial-report',
    '/marketing-events',
    '/material-consumption',
    '/organization-products',
    '/organization-suppliers',
    '/patrimony',
    '/portioning',
    '/products',
    '/production',
    '/purchase-orders',
    '/purchase-suggestions',
    '/reports',
    '/stock-audits',
    '/stock-audits/history',
    '/stock-history',
    '/stock-locations',
    '/stock-movement',
    '/stock-transfers',
    '/supplier-portal-users',
    '/supplier-price-updates',
    '/suppliers',
    '/table-reservations',
    '/users',
  ].sort());

  expect(new Set(items.map(item => item.to)).size).toBe(items.length);
});

test('destaca apenas a entrada correta em auditorias e mantém eventos ativo nos detalhes', () => {
  const audits = items.find(item => item.to === '/stock-audits');
  const auditHistory = items.find(item => item.to === '/stock-audits/history');
  const events = items.find(item => item.to === '/events');

  expect(isNavigationItemActive(audits, '/stock-audits/history')).toBe(false);
  expect(isNavigationItemActive(auditHistory, '/stock-audits/history')).toBe(true);
  expect(isNavigationItemActive(audits, '/stock-audits/audit-123')).toBe(true);
  expect(isNavigationItemActive(events, '/events/event-123')).toBe(true);
});

test('mantém reservas visíveis somente no estabelecimento comercial', () => {
  const reservations = items.find(item => item.to === '/table-reservations');

  expect(isNavigationItemVisible(reservations, ESTABLISHMENTS.COMMERCIAL, 'ADMIN')).toBe(true);
  expect(isNavigationItemVisible(reservations, 'outro-estabelecimento', 'ADMIN')).toBe(false);
});

test('exibe o gerenciamento de usuários somente para administradores', () => {
  const users = items.find(item => item.to === '/users');

  expect(isNavigationItemVisible(users, 'estabelecimento-a', 'ADMIN')).toBe(true);
  expect(isNavigationItemVisible(users, 'estabelecimento-a', 'MANAGER')).toBe(false);
  expect(isNavigationItemVisible(users, 'estabelecimento-a', 'STOCK_COUNTER')).toBe(false);
});
