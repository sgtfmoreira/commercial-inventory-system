import DSButton from './Button';
import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  MdDashboard,
  MdInventory2,
  MdPeople,
  MdShoppingCart,
  MdHistory,
  MdEventNote,
  MdMenu,
  MdClose,
  MdLightbulb,
  MdChecklist,
  MdCompareArrows,
  MdWbSunny,
  MdNightlightRound,
  MdLogout,
  MdStore,
  MdFactory,
  MdContentCut,
  MdAccountTree,
  MdBusiness,
  MdPriceChange,
  MdExpandLess,
  MdExpandMore,
  MdChevronLeft,
  MdChevronRight
} from 'react-icons/md';
import { MdReceiptLong } from 'react-icons/md';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeModeProvider';
import Select from 'react-select';

import { ESTABLISHMENTS } from '../constants/establishments';

const brandLogo = `${process.env.PUBLIC_URL}/BASTIDOR_LOGO02.jpg`;
const brandIcon = `${process.env.PUBLIC_URL}/bastidor-os-icon.svg`;

// ─── Layout shells ────────────────────────────────────────────────────────────
const Layout = styled.div`
  display: flex;
  min-height: 100vh;
`;

const HamburgerBtn = styled(DSButton)`
  display: none;
  @media (max-width: 768px) {
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    top: 16px;
    left: 16px;
    z-index: 900;
    background: ${({ theme }) => theme.colors.bgCard || '#fff'};
    border: 1px solid ${({ theme }) => theme.colors.border || 'var(--color-border)'};
    width: 48px;
    height: 48px;
    min-height: 48px;
    padding: 0;
    border-radius: 50%;
    color: ${({ theme }) => theme.colors.textPrimary};
    cursor: pointer;
    box-shadow: ${({ theme }) => theme.shadows.card};
  }
`;

const LogoutButton = styled(DSButton)`
  display: flex;
  align-items: center;
  gap: 16px;
  width: ${({ $collapsed }) => ($collapsed ? '56px' : 'calc(100% - 24px)')};
  min-height: 48px;
  padding: ${({ $collapsed }) => ($collapsed ? '0' : '0 16px')};
  margin: auto 12px 8px;
  background: transparent;
  border: none;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
  color: ${({ theme }) => theme.mode === 'dark' ? '#CAC4D0' : '#49454F'};
  font-size: 14px;
  line-height: 20px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  border-radius: 24px;
  box-shadow: none;
  cursor: pointer;
  transition: ${({ theme }) => theme.transition};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.dangerLight};
    color: ${({ theme }) => theme.colors.danger};
  }

  svg {
    font-size: 20px;
  }
`;

const Sidebar = styled.aside`
  width: ${({ $collapsed }) => ($collapsed ? '80px' : '280px')};
  height: 100vh;
  background: ${({ theme }) => theme.mode === 'dark' ? '#1D1B20' : '#FFFBFE'};
  border-right: 1px solid ${({ theme }) => theme.mode === 'dark' ? '#49454F' : '#CAC4D0'};
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0; left: 0;
  z-index: 200;
  box-shadow: none;
  transition: width ${({ theme }) => theme.transitions.slow};
  overflow: hidden;

  @media (max-width: 768px) {
    width: min(304px, calc(100vw - 56px));
    transform: ${({ $isOpen }) => ($isOpen ? 'translateX(0)' : 'translateX(-100%)')};
    transition: ${({ theme }) => theme.transition};
    z-index: 1000;
  }

`;

const SidebarHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'space-between')};
  padding: ${({ $collapsed }) => ($collapsed ? '16px 12px 12px' : '16px 16px 12px')};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  min-height: ${({ $collapsed }) => ($collapsed ? '72px' : '144px')};
  gap: 8px;
`;

const LogoBlock = styled.div`
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
`;

const BrandRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const BrandLogo = styled.img`
  height: 40px;
  max-width: 156px;
  object-fit: contain;
  object-position: left center;
  flex-shrink: 1;
`;

const MobileCloseButton = styled(DSButton)`
  display: none;
  width: 36px;
  height: 40px;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 1.4rem;
  cursor: pointer;
  box-shadow: none;

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.colors.textPrimary};
    background: ${({ theme }) => theme.colors.bgHover};
  }

  @media (max-width: 768px) {
    display: flex;
  }
`;

const ManageUnitsButton = styled(DSButton)`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  padding: 0 8px;
  background: transparent;
  border: none;
  border-radius: 16px;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 12px;
  line-height: 16px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  box-shadow: none;

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.colors.primary};
    background: ${({ theme }) => theme.colors.primarySurface};
  }
`;

const LogoCircle = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background: ${({ theme }) => theme.mode === 'dark' ? '#4F378B' : '#E8DEF8'};
  display: flex;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  align-items: center;
  justify-content: center;
  font-family: ${({ theme }) => theme.fonts.brand};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.mode === 'dark' ? '#EADDFF' : '#21005D'};
  flex-shrink: 0;
`;

const CollapseBtn = styled(DSButton)`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  width: 40px;
  min-height: 40px;
  font-size: 24px;
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 0;
  border-radius: 50%;
  flex-shrink: 0;
  transition: ${({ theme }) => theme.transition};
  box-shadow: none;

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.colors.primary};
    background: ${({ theme }) => theme.colors.primaryLight};
  }
  
  @media (max-width: 768px) {
    display: none;
  }
`;

const Nav = styled.nav`
  flex: 1;
  padding: 8px 0 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: ${({ theme }) => theme.colors.borderStrong} transparent;
`;

const GroupButton = styled(DSButton)`
  width: ${({ $collapsed }) => ($collapsed ? '56px' : 'calc(100% - 24px)')};
  min-height: 48px;
  margin: 2px 12px;
  padding: ${({ $collapsed }) => ($collapsed ? '0' : '0 16px')};
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
  gap: 16px;
  background: ${({ theme, $active, $collapsed }) => $active && $collapsed
    ? (theme.mode === 'dark' ? '#4F378B' : '#E8DEF8')
    : 'transparent'};
  border: none;
  border-radius: 24px;
  color: ${({ theme, $active }) => $active
    ? (theme.mode === 'dark' ? '#EADDFF' : '#21005D')
    : (theme.mode === 'dark' ? '#CAC4D0' : '#49454F')};
  font-size: 14px;
  line-height: 20px;
  font-weight: ${({ theme, $active }) => ($active ? theme.fontWeights.semibold : theme.fontWeights.medium)};
  cursor: pointer;
  transition: ${({ theme }) => theme.transition};
  box-shadow: none;

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.mode === 'dark' ? '#E6E1E5' : '#1D1B20'};
    background: ${({ theme }) => theme.mode === 'dark' ? 'rgba(230,225,229,0.08)' : 'rgba(29,27,32,0.08)'};
  }
`;

const GroupLabel = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  white-space: nowrap;
`;

const GroupItems = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0 8px 16px;
`;

const StyledNavLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 48px;
  padding: ${({ $collapsed }) => ($collapsed ? '0' : '0 16px')};
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
  margin: 0 12px;
  border-radius: 24px;
  color: ${({ theme }) => theme.mode === 'dark' ? '#CAC4D0' : '#49454F'};
  font-size: 14px;
  line-height: 20px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  transition: ${({ theme }) => theme.transition};
  white-space: nowrap;
  position: relative;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.mode === 'dark' ? 'rgba(230,225,229,0.08)' : 'rgba(29,27,32,0.08)'};
    color: ${({ theme }) => theme.mode === 'dark' ? '#E6E1E5' : '#1D1B20'};
  }

  &.active {
    background: ${({ theme }) => theme.mode === 'dark' ? '#4F378B' : '#E8DEF8'};
    color: ${({ theme }) => theme.mode === 'dark' ? '#EADDFF' : '#21005D'};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
  }
`;

const DashboardLink = styled(StyledNavLink)`
  margin-bottom: 8px;
`;

const NavIcon = styled.span`
  width: 24px;
  height: 24px;
  font-size: 24px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
`;

const NavLabel = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const AlertDot = styled.span`
  background: ${({ theme }) => theme.colors.danger};
  color: #fff;
  border-radius: ${({ theme }) => theme.radii.pill};
  font-size: 11px;
  line-height: 16px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  padding: 0 6px;
  min-width: 24px;
  text-align: center;
  flex-shrink: 0;
`;

const SidebarFooter = styled.div`
  padding: 8px 12px 12px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  text-align: center;
  white-space: nowrap;
`;

const FooterBrand = styled.span`
  font-family: ${({ theme }) => theme.fonts.brand};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: 11px;
  line-height: 16px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const FooterRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'space-between')};
  gap: 8px;
`;

const ThemeToggle = styled(DSButton)`
  width: 40px;
  min-height: 40px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.bgHover};
  color: ${({ theme }) => theme.colors.textSecondary};
  box-shadow: none;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primarySurface};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const CollapsedToggle = styled.div`
  display: flex;
  justify-content: center;
  padding: 4px 0 8px;
`;

const Main = styled.main`
  flex: 1;
  min-width: 0;
  margin-left: ${({ $collapsed }) => ($collapsed ? '80px' : '280px')};
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.bg};
  transition: margin-left 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  
  @media (max-width: 768px) {
    margin-left: 0;
  }
`;

const PageWrapper = styled.div`
  width: 100%;
  max-width: ${({ theme }) => theme.sizes.contentMax};
  padding: ${({ theme }) => theme.spacing.lg};
  margin: 0 auto;

  @media (max-width: 768px) {
    padding: 64px 16px 24px;
  }
`;

// ─── Navigation items (grouped) ───────────────────────────────────────────────
export const NAV_GROUPS = [
  {
    label: 'Compras',
    icon: <MdShoppingCart />,
    items: [
      { to: '/purchase-suggestions', label: 'Sugestões de compra', icon: <MdLightbulb />, end: true },
      { to: '/purchase-orders', label: 'Ordens de compra', icon: <MdShoppingCart />, end: true },
      { to: '/suppliers', label: 'Fornecedores', icon: <MdPeople /> },
      { to: '/commercial-agreements', label: 'Acordos e bonificações', icon: <MdReceiptLong />, end: true },
    ],
  },
  {
    label: 'Estoque',
    icon: <MdInventory2 />,
    badge: true,
    items: [
      { to: '/products', label: 'Produtos', icon: <MdInventory2 />, badge: true, end: true },
      { to: '/stock-movement', label: 'Movimentações', icon: <MdCompareArrows />, end: true },
      { to: '/stock-transfers', label: 'Transferências', icon: <MdCompareArrows />, end: true },
      { to: '/stock-locations', label: 'Locais de estoque', icon: <MdStore />, end: true },
      { to: '/stock-audits', label: 'Auditorias', icon: <MdChecklist />, match: 'audit-root' },
      { to: '/stock-audits/history', label: 'Histórico de auditorias', icon: <MdHistory />, end: true },
      { to: '/stock-history', label: 'Histórico de estoque', icon: <MdHistory />, end: true },
    ],
  },
  {
    label: 'Operação',
    icon: <MdFactory />,
    items: [
      { to: '/production', label: 'Produção', icon: <MdFactory /> },
      { to: '/portioning', label: 'Desossa e porcionamento', icon: <MdContentCut /> },
      { to: '/material-consumption', label: 'Consumo de materiais', icon: <MdReceiptLong /> },
      { to: '/entries', label: 'Lançamentos', icon: <MdReceiptLong /> },
      { to: '/patrimony', label: 'Patrimônio', icon: <MdStore /> },
    ],
  },
  {
    label: 'Comercial',
    icon: <MdEventNote />,
    items: [
      { to: '/events', label: 'Eventos', icon: <MdEventNote />, match: 'prefix' },
      { to: '/table-reservations', label: 'Reservas de mesas', icon: <MdEventNote />, establishmentId: ESTABLISHMENTS.COMMERCIAL },
      { to: '/marketing-events', label: 'Ações de marketing', icon: <MdEventNote /> },
    ],
  },
  {
    label: 'Análises',
    icon: <MdChecklist />,
    items: [
      { to: '/reports', label: 'Relatórios operacionais', icon: <MdChecklist /> },
      { to: '/financial-report', label: 'Relatório financeiro', icon: <MdReceiptLong /> },
      { to: '/activity-log', label: 'Log de atividades', icon: <MdEventNote /> },
    ],
  },
  {
    label: 'Organização',
    icon: <MdBusiness />,
    items: [
      { to: '/organization-products', label: 'Catálogo central', icon: <MdAccountTree /> },
      { to: '/organization-suppliers', label: 'Fornecedores centrais', icon: <MdBusiness /> },
      { to: '/supplier-price-updates', label: 'Atualizações de preços', icon: <MdPriceChange /> },
      { to: '/supplier-portal-users', label: 'Acessos de fornecedores', icon: <MdPeople /> },
      { to: '/users', label: 'Usuários', icon: <MdPeople />, roles: ['ADMIN'] },
    ],
  },
];

export const isNavigationItemActive = (item, pathname) => {
  if (item.match === 'prefix') {
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
  }

  if (item.match === 'audit-root') {
    return pathname === item.to || (
      pathname.startsWith(`${item.to}/`) && pathname !== '/stock-audits/history'
    );
  }

  return pathname === item.to;
};

export const isNavigationItemVisible = (item, establishmentId, role) => {
  if (item.establishmentId && item.establishmentId !== establishmentId) return false;
  if (item.roles && !item.roles.includes(role)) return false;
  return true;
};

// ─── Component ────────────────────────────────────────────────────────────────
const SidebarLayout = () => {
  const { state, switchEstablishment, getLowStockProducts } = useApp();
  const { themeMode, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar:collapsed') === 'true');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(() => localStorage.getItem('sidebar:open-group') || 'Compras');

  const { establishments = [], establishment, user } = state;
  const lowStockCount = getLowStockProducts().length;

  const visibleGroups = useMemo(() => NAV_GROUPS
    .map(group => ({
      ...group,
      items: group.items.filter(item => isNavigationItemVisible(item, establishment?.id, user?.role)),
    }))
    .filter(group => group.items.length > 0), [establishment?.id, user?.role]);

  useEffect(() => {
    localStorage.setItem('sidebar:collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const activeGroup = visibleGroups.find(group =>
      group.items.some(item => isNavigationItemActive(item, location.pathname))
    );

    if (activeGroup) {
      setOpenGroup(activeGroup.label);
      localStorage.setItem('sidebar:open-group', activeGroup.label);
    }
  }, [location.pathname, visibleGroups]);

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = event => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMenuOpen]);

  const handleLogout = () => {
    if (window.confirm("Deseja realmente sair do sistema?")) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  };

  const handleSwitchEstablishment = async selected => {
    if (!selected?.value || selected.value === establishment?.id) return;

    try {
      await switchEstablishment(selected.value);
    } catch (error) {
      alert(error.message || 'Não foi possível trocar de unidade.');
    }
  };

  const handleGroupToggle = label => {
    if (collapsed) setCollapsed(false);
    const nextGroup = collapsed || openGroup !== label ? label : null;
    setOpenGroup(nextGroup);
    if (nextGroup) localStorage.setItem('sidebar:open-group', nextGroup);
    else localStorage.removeItem('sidebar:open-group');
  };

  const options = (establishments || []).map(est => ({
    value: est.id,
    label: est.name || "Sem nome"
  }));

  const currentOption = options.find(opt => opt.value === establishment?.id) || null;

  return (
    <Layout>
      <HamburgerBtn onClick={() => { setCollapsed(false); setIsMenuOpen(true); }} title="Abrir menu" aria-label="Abrir menu de navegação">
        <MdMenu size={24} />
      </HamburgerBtn>
      <Sidebar $collapsed={collapsed} $isOpen={isMenuOpen}>
        <SidebarHeader $collapsed={collapsed}>
          {!collapsed && (
            <LogoBlock>
              <BrandRow>
                <BrandLogo src={brandLogo} alt="Bastidor OS" />
                <MobileCloseButton onClick={() => setIsMenuOpen(false)} title="Fechar menu" aria-label="Fechar menu de navegação">
                  <MdClose />
                </MobileCloseButton>
              </BrandRow>

              <div style={{ width: '100%', minWidth: 140 }}>
                <Select
                  options={options}
                  value={currentOption}
                  onChange={handleSwitchEstablishment}
                  placeholder="Selecione..."
                  isSearchable={false}
                  menuPortalTarget={document.body}
                  styles={{
                    control: (base) => ({
                      ...base,
                      minWidth: '120px',
                      background: 'transparent',
                      border: '1px solid var(--color-border)',
                      borderRadius: '12px',
                      boxShadow: 'none',
                      minHeight: '40px',
                      cursor: 'pointer',
                      '&:hover': {
                        borderColor: 'var(--color-primary)',
                        background: 'var(--color-primary-surface)',
                      }
                    }),
                    valueContainer: (base) => ({ ...base, padding: '0 12px' }),
                    singleValue: (base) => ({
                      ...base,
                      fontSize: '14px',
                      fontWeight: 500,
                      color: 'var(--color-text)'
                    }),
                    placeholder: (base) => ({
                      ...base,
                      fontSize: '14px',
                      color: 'var(--color-text-muted)'
                    }),
                    indicatorSeparator: () => ({ display: 'none' }),
                    dropdownIndicator: (base) => ({
                      ...base,
                      padding: '8px',
                      color: 'var(--color-text-muted)',
                      '&:hover': { color: 'var(--color-primary)' }
                    }),
                    menu: (base) => ({
                      ...base,
                      fontSize: '14px',
                      background: 'var(--color-surface)',
                      border: '1px solid',
                      borderColor: 'var(--color-border)',
                      borderRadius: '12px',
                      padding: '8px',
                      zIndex: 1000,
                      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                    }),
                    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                    option: (base, optState) => ({
                      ...base,
                      borderRadius: '8px',
                      backgroundColor: optState.isSelected
                        ? 'var(--color-primary)'
                        : optState.isFocused
                          ? 'var(--color-primary-surface)'
                          : 'transparent',
                      color: optState.isSelected
                        ? '#fff'
                        : 'var(--color-text)',
                      cursor: 'pointer',
                      padding: '10px 12px',
                      fontWeight: optState.isSelected ? 600 : 400,
                      '&:active': { background: 'var(--color-primary-surface)' }
                    })
                  }}
                />
              </div>
              <ManageUnitsButton type="button" onClick={() => navigate('/select-establishment')}>
                <MdStore /> Gerenciar unidades
              </ManageUnitsButton>
            </LogoBlock>
          )}

          {collapsed && <LogoCircle><img src={brandIcon} alt="Bastidor OS" /></LogoCircle>}

          {!collapsed && (
            <CollapseBtn onClick={() => setCollapsed(true)} title="Recolher" aria-label="Recolher barra lateral">
              <MdChevronLeft />
            </CollapseBtn>
          )}
        </SidebarHeader>

        {collapsed && (
          <CollapsedToggle>
            <CollapseBtn onClick={() => setCollapsed(false)} title="Expandir" aria-label="Expandir barra lateral">
              <MdChevronRight />
            </CollapseBtn>
          </CollapsedToggle>
        )}

        <Nav aria-label="Navegação principal">
          <DashboardLink
            to="/"
            end
            $collapsed={collapsed}
            title={collapsed ? 'Dashboard' : undefined}
            onClick={() => setIsMenuOpen(false)}
          >
            <NavIcon><MdDashboard /></NavIcon>
            {!collapsed && <NavLabel>Dashboard</NavLabel>}
          </DashboardLink>

          {visibleGroups.map((group, index) => {
            const isOpen = !collapsed && openGroup === group.label;
            const isActive = group.items.some(item => isNavigationItemActive(item, location.pathname));
            const groupId = `sidebar-group-${index}`;

            return (
              <div key={group.label}>
                <GroupButton
                  type="button"
                  $collapsed={collapsed}
                  $active={isActive}
                  aria-expanded={isOpen}
                  aria-controls={groupId}
                  title={collapsed ? group.label : undefined}
                  onClick={() => handleGroupToggle(group.label)}
                >
                  <NavIcon>{group.icon}</NavIcon>
                  {!collapsed && <GroupLabel>{group.label}</GroupLabel>}
                  {group.badge && lowStockCount > 0 && <AlertDot>{lowStockCount}</AlertDot>}
                  {!collapsed && (isOpen ? <MdExpandLess /> : <MdExpandMore />)}
                </GroupButton>

                {isOpen && (
                  <GroupItems id={groupId}>
                    {group.items.map(item => {
                      const isItemActive = isNavigationItemActive(item, location.pathname);
                      return (
                        <StyledNavLink
                          key={item.to}
                          to={item.to}
                          end={item.match !== 'prefix'}
                          className={isItemActive ? 'active' : undefined}
                          $collapsed={false}
                          onClick={() => setIsMenuOpen(false)}
                        >
                          <NavIcon>{item.icon}</NavIcon>
                          <NavLabel>{item.label}</NavLabel>
                          {item.badge && lowStockCount > 0 && <AlertDot>{lowStockCount}</AlertDot>}
                        </StyledNavLink>
                      );
                    })}
                  </GroupItems>
                )}
              </div>
            );
          })}
        </Nav>
        <LogoutButton $collapsed={collapsed} onClick={handleLogout} title={collapsed ? 'Sair da conta' : undefined} aria-label="Sair da conta">
          <MdLogout />
          {!collapsed && <span>Sair da Conta</span>}
        </LogoutButton>

        <SidebarFooter>
          <FooterRow $collapsed={collapsed}>
            <ThemeToggle
              onClick={toggleTheme}
              title={themeMode === 'light' ? "Mudar para Modo Noturno" : "Mudar para Modo Claro"}
              aria-label={themeMode === 'light' ? "Mudar para modo escuro" : "Mudar para modo claro"}
            >
              {themeMode === 'light' ? <MdNightlightRound fontSize={20} /> : <MdWbSunny fontSize={20} />}
            </ThemeToggle>
            {!collapsed && <FooterBrand>Bastidor OS · v1.0</FooterBrand>}
          </FooterRow>
        </SidebarFooter>
      </Sidebar>

      <Overlay $isOpen={isMenuOpen} onClick={() => setIsMenuOpen(false)} />

      <Main $collapsed={collapsed}>
        <PageWrapper>
          <Outlet key={`establishment:${establishment?.id || 'none'}`} />
        </PageWrapper>
      </Main>
    </Layout>
  );
};


const Overlay = styled.div`
  display: ${({ $isOpen }) => ($isOpen ? 'block' : 'none')};
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
`;

export default SidebarLayout;
