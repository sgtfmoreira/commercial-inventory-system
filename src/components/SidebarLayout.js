import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { NavLink, Outlet } from 'react-router-dom';
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
  MdPriceChange
} from 'react-icons/md';
import { MdReceiptLong } from 'react-icons/md';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeModeProvider';
import Select from 'react-select';

import logo from '../assets/logobds.png';
import { ESTABLISHMENTS } from '../constants/establishments';

const shimmer = keyframes`
  0%   { background-position: -200% center; }
  100% { background-position:  200% center; }
`;

// ─── Layout shells ────────────────────────────────────────────────────────────
const Layout = styled.div`
  display: flex;
  min-height: 100vh;
`;

const HamburgerBtn = styled.button`
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
    border: 1px solid ${({ theme }) => theme.colors.border || '#e5e7eb'};
    border-radius: 8px;
    padding: 8px;
    color: ${({ theme }) => theme.colors.text || '#111827'};
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
`;

const LogoutButton = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  margin-top: auto; // Isso empurra o botão para o final da Sidebar
  background: transparent;
  border: none;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${({ theme }) => theme.colors.dangerLight};
    color: ${({ theme }) => theme.colors.danger};
  }

  svg {
    font-size: 20px;
  }
`;

const Sidebar = styled.aside`
  width: ${({ $collapsed }) => ($collapsed ? '68px' : '252px')};
  height: 100vh;
  background: ${({ theme }) => theme.colors.bgSidebar};
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0; left: 0;
  z-index: 200;
  transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;

  @media (max-width: 768px) {
    width: 260px;
    transform: ${({ $isOpen }) => ($isOpen ? 'translateX(0)' : 'translateX(-100%)')};
    transition: ${({ theme }) => theme.transition};
    z-index: 1000;
  }

  &::after {
    content: '';
    position: absolute;
    top: 0; right: -1px;
    width: 1px;
    height: 100%;
    background: linear-gradient(
      to bottom,
      transparent 0%,
      ${({ theme }) => theme.colors.primary}30 35%,
      ${({ theme }) => theme.colors.primary}30 65%,
      transparent 100%
    );
  }
`;

const SidebarHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'space-between')};
  padding: ${({ $collapsed }) => ($collapsed ? '18px 0' : '18px 16px')};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  min-height: 68px;
  gap: 10px;
`;

const LogoBlock = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

/* Pacifico script wordmark with blue shimmer */
const BrandWordmark = styled.span`
  font-family: 'Pacifico', cursive;
  font-size: 1.4rem;
  font-weight: 400;
  white-space: nowrap;
  line-height: 1;
  background: linear-gradient(
    90deg,
    #003d99 0%,
    #0066CC 35%,
    #1a8fff 60%,
    #0066CC 100%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: ${shimmer} 4s linear infinite;
`;

const EstabSelector = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 10px;
  padding: 4px 8px;
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.bgHover};
  cursor: pointer;
  font-size: 12px;
  transition: 0.2s;

  &:hover {
    background: ${({ theme }) => theme.colors.primaryLight};
  }
`;

const Dropdown = styled.div`
  position: absolute;
  top: 60px;
  left: 80px;
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  box-shadow: ${({ theme }) => theme.shadows.card};
  padding: 6px;
  z-index: 999;
`;

const DropdownItem = styled.div`
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;

  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }
`;

/* Collapsed state: round blue circle with "C" */
const LogoCircle = styled.div`
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.primary};
  box-shadow: ${({ theme }) => theme.shadows.glow};
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Pacifico', cursive;
  font-size: 1rem;
  color: #fff;
  flex-shrink: 0;
  padding-right: 2px;
`;

const CollapseBtn = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 1.15rem;
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 5px;
  border-radius: ${({ theme }) => theme.radii.sm};
  flex-shrink: 0;
  transition: ${({ theme }) => theme.transition};

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
    background: ${({ theme }) => theme.colors.primaryLight};
  }
  
  @media (max-width: 768px) {
    display: none;
  }
`;

const Nav = styled.nav`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.sm} 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow-y: auto;
  overflow-x: hidden;
`;

const NavSection = styled.div`
  padding: ${({ $collapsed }) => ($collapsed ? '8px 0 2px' : '8px 16px 2px')};
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
  overflow: hidden;
`;

const StyledNavLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: ${({ $collapsed }) => ($collapsed ? '9px 0' : '9px 12px')};
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
  margin: 0 6px;
  border-radius: ${({ theme }) => theme.radii.md};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  transition: ${({ theme }) => theme.transition};
  white-space: nowrap;
  position: relative;

  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

&.active {
  background: ${({ theme }) => theme.colors.bgHover};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};

  &::before {
    content: '';
    position: absolute;
    left: -8px;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 60%;
    background: ${({ theme }) => theme.colors.primary};
    border-radius: 0 3px 3px 0;
  }
}
`;

const NavIcon = styled.span`
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  flex-shrink: 0;
`;

const NavLabel = styled.span`
  flex: 1;
  overflow: hidden;
`;

const AlertDot = styled.span`
  background: ${({ theme }) => theme.colors.danger};
  color: #fff;
  border-radius: ${({ theme }) => theme.radii.pill};
  font-size: 10px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  padding: 1px 6px;
  min-width: 20px;
  text-align: center;
  flex-shrink: 0;
`;

const SidebarFooter = styled.div`
  padding: ${({ theme }) => theme.spacing.sm};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  text-align: center;
  white-space: nowrap;
`;

const FooterBrand = styled.span`
  font-family: 'Pacifico', cursive;
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Main = styled.main`
  flex: 1;
  min-width: 0;
  margin-left: ${({ $collapsed }) => ($collapsed ? '68px' : '252px')};
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.bg};
  transition: margin-left 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  
  @media (max-width: 768px) {
    margin-left: 0;
  }
`;

const PageWrapper = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  max-width: 1400px;
`;

// ─── Navigation items (grouped) ───────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'Principal',
    items: [
      { to: '/', label: 'Dashboard', icon: <MdDashboard /> },
      { to: '/products', label: 'Produtos', icon: <MdInventory2 />, badge: true },
      { to: '/organization-products', label: 'Catálogo Central', icon: <MdAccountTree /> },
      { to: '/organization-suppliers', label: 'Fornecedores Centrais', icon: <MdBusiness /> },
      { to: '/supplier-price-updates', label: 'Preços de Fornecedores', icon: <MdPriceChange /> },
      { to: '/supplier-portal-users', label: 'Acessos de Fornecedores', icon: <MdPeople /> },
      { to: '/patrimony', label: 'Patrimônio', icon: <MdStore /> },
      { to: '/suppliers', label: 'Fornecedores', icon: <MdPeople /> },
      { to: '/production', label: 'Produção', icon: <MdFactory /> },
      { to: '/portioning', label: 'Desossa (Porcionamento)', icon: <MdContentCut /> },
      { to: '/purchase-orders', label: 'Ordens de Compra', icon: <MdShoppingCart /> },
      { to: '/commercial-agreements', label: 'Acordos e Bonificacoes', icon: <MdReceiptLong /> },
      { to: '/purchase-suggestions', label: 'Sugestões de Compra', icon: <MdLightbulb /> },
      { to: '/stock-audits', label: 'Auditoria de estoque', icon: <MdLightbulb /> },
      { to: '/stock-transfers', label: 'Transferencia de estoque', icon: <MdCompareArrows /> },
      { to: '/events', label: 'Eventos', icon: <MdEventNote /> },
      { to: '/table-reservations', label: 'Reservas de mesas', icon: <MdEventNote />, establishmentId: ESTABLISHMENTS.COMMERCIAL },
      { to: '/marketing-events', label: 'Eventos de Marketing', icon: <MdEventNote /> },
      { to: '/entries', label: 'Lançamentos', icon: <MdReceiptLong /> },
      { to: '/material-consumption', label: 'Consumo de materiais', icon: <MdReceiptLong /> },
      { to: '/stock-movement/', label: 'movimentação de estoque', icon: <MdCompareArrows /> },
      { to: '/stock-audits/history', label: 'historico de auditorias', icon: <MdChecklist /> },
      { to: '/reports', label: 'relatorios', icon: <MdChecklist /> },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/select-establishment', label: 'Minhas Unidades', icon: <MdStore /> },
      { to: '/stock-locations', label: 'Locais de Estoque', icon: <MdStore /> },
      { to: '/users/', label: 'Usuários', icon: <MdPeople /> },
    ],
  },
  {
    label: 'Relatórios',
    items: [
      { to: '/stock-history', label: 'Histórico de Estoque', icon: <MdHistory /> },
      { to: '/activity-log', label: 'Reg. de Atividades', icon: <MdEventNote /> },
      { to: '/financial-report', label: 'Relatório Financeiro', icon: <MdReceiptLong /> },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
const SidebarLayout = ({ children }) => {

  const { state, switchEstablishment, getLowStockProducts } = useApp();
  const { themeMode, toggleTheme } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const lowStockCount = getLowStockProducts().length;

  // 🔥 função de troca
  const handleSwitch = async (establishmentId) => {
    try {
      await switchEstablishment(establishmentId);
    } catch (err) {
      alert(err.message);
    }
  };
  const handleLogout = () => {
    if (window.confirm("Deseja realmente sair do sistema?")) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  };
  console.log("STATE:", state);

  const { establishments = [], establishment } = state;
  const options = (establishments || []).map(est => ({
    value: est.id,
    label: est.name || "Sem nome"
  }));

  const currentOption = options.find(opt => opt.value === establishment?.id) || null;

  return (
    <Layout>
      <HamburgerBtn onClick={() => setIsMenuOpen(true)} title="Abrir menu">
        <MdMenu size={24} />
      </HamburgerBtn>
      <Sidebar $collapsed={collapsed} $isOpen={isMenuOpen}>
        {/* Header */}
        <SidebarHeader $collapsed={collapsed}>
          {!collapsed && (
            <LogoBlock style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '200%', gap: '10px', marginTop: '0px', marginBottom: '5px' }}>
              <img src={logo} alt="BDS Logo" style={{ height: '4.4rem', flexShrink: 0 }} />

              {/* Mobile close button */}
              <button onClick={() => setIsMenuOpen(false)} style={{ background: 'transparent', border: 'none', color: themeMode === 'light' ? '#111827' : '#f1f5f9', fontSize: '1.5rem', marginTop: '8px' }} title="Fechar menu">
                <MdClose />
              </button>

              {/* 🔽 SELECT DE ESTABELECIMENTO (REACT-SELECT) */}
              <div style={{ width: '100%', minWidth: 140 }}>
                <Select
                  options={options}
                  value={currentOption}
                  onChange={(selected) => switchEstablishment(selected?.value)}
                  placeholder="Selecione..."
                  isSearchable={false}
                  menuPortalTarget={document.body}
                  styles={{
                    control: (base) => ({
                      ...base,
                      minWidth: '120px',
                      background: themeMode === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)',
                      border: '1px solid transparent',
                      borderColor: 'transparent',
                      borderRadius: '6px',
                      boxShadow: 'none',
                      minHeight: '32px',
                      cursor: 'pointer',
                      '&:hover': {
                        borderColor: themeMode === 'light' ? '#e2e8f0' : '#334155',
                        background: themeMode === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                      }
                    }),
                    valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                    singleValue: (base) => ({
                      ...base,
                      fontSize: '11px',
                      fontWeight: 700,
                      color: themeMode === 'light' ? '#111827' : '#f1f5f9'
                    }),
                    placeholder: (base) => ({
                      ...base,
                      fontSize: '11px',
                      color: themeMode === 'light' ? '#94a3b8' : '#64748b'
                    }),
                    indicatorSeparator: () => ({ display: 'none' }),
                    dropdownIndicator: (base) => ({
                      ...base,
                      padding: '2px',
                      color: themeMode === 'light' ? '#64748b' : '#94a3b8',
                      '&:hover': { color: themeMode === 'light' ? '#111827' : '#f1f5f9' }
                    }),
                    menu: (base) => ({
                      ...base,
                      fontSize: '12px',
                      background: themeMode === 'light' ? '#fff' : '#1e293b',
                      border: '1px solid',
                      borderColor: themeMode === 'light' ? '#e2e8f0' : '#334155',
                      borderRadius: '8px',
                      padding: '4px',
                      zIndex: 1000,
                      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                    }),
                    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                    option: (base, optState) => ({
                      ...base,
                      borderRadius: '4px',
                      backgroundColor: optState.isSelected
                        ? (themeMode === 'light' ? '#111827' : '#3b82f6')
                        : optState.isFocused
                          ? (themeMode === 'light' ? '#f1f5f9' : '#334155')
                          : 'transparent',
                      color: optState.isSelected
                        ? '#fff'
                        : themeMode === 'light' ? '#111827' : '#f1f5f9',
                      cursor: 'pointer',
                      padding: '6px 12px',
                      fontWeight: optState.isSelected ? 600 : 400,
                      '&:active': { background: themeMode === 'light' ? '#e2e8f0' : '#475569' }
                    })
                  }}
                />
              </div>

            </LogoBlock>
          )}

          {collapsed && <LogoCircle>B</LogoCircle>}

          {!collapsed && (
            <CollapseBtn onClick={() => setCollapsed(true)} title="Recolher">
              <MdClose />
            </CollapseBtn>
          )}
        </SidebarHeader>

        {/* Expand button when collapsed (desktop only) */}
        {collapsed && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <CollapseBtn onClick={() => setCollapsed(false)} title="Expandir">
              <MdMenu />
            </CollapseBtn>
          </div>
        )}

        {/* Nav groups */}
        <Nav>
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <NavSection $collapsed={collapsed}>
                  {group.label}
                </NavSection>
              )}
              {group.items.filter(item => !item.establishmentId || item.establishmentId === establishment?.id).map(({ to, label, icon, badge }) => (
                <StyledNavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  $collapsed={collapsed}
                  title={collapsed ? label : undefined}
                  onClick={() => {
                    setIsMenuOpen(false);
                  }}
                >
                  <NavIcon>{icon}</NavIcon>
                  {!collapsed && <NavLabel>{label}</NavLabel>}
                  {!collapsed && badge && lowStockCount > 0 && (
                    <AlertDot>{lowStockCount}</AlertDot>
                  )}
                </StyledNavLink>
              ))}
            </div>
          ))}
        </Nav>
        <LogoutButton onClick={handleLogout}>
          <MdLogout />
          {!collapsed && <span>Sair da Conta</span>}
        </LogoutButton>

        <SidebarFooter>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            gap: 8,
            marginBottom: 8
          }}>
            <button
              onClick={toggleTheme}
              title={themeMode === 'light' ? "Mudar para Modo Noturno" : "Mudar para Modo Claro"}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 6,
                borderRadius: 6,
                cursor: 'pointer',
                transition: '0.2s',
                backgroundColor: 'rgba(0,0,0,0.05)'
              }}
            >
              {themeMode === 'light' ? <MdNightlightRound fontSize={18} /> : <MdWbSunny fontSize={18} />}
            </button>
            {!collapsed && <FooterBrand>Controle de Compras BDS · v1.0</FooterBrand>}
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Mobile overlay */}
      <Overlay $isOpen={isMenuOpen} onClick={() => setIsMenuOpen(false)} />

      <Main $collapsed={collapsed}>
        <PageWrapper>
          <Outlet />
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
