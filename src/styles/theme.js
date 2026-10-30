const baseTheme = {
  fonts: {
    base: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    brand: "'Manrope', 'Inter', sans-serif",
    heading: "'Manrope', 'Inter', sans-serif",
    mono: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
  },
  fontSizes: { xs: '0.75rem', sm: '0.8125rem', md: '0.875rem', lg: '1rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem' },
  lineHeights: { tight: 1.2, heading: 1.3, body: 1.5 },
  fontWeights: { normal: 400, medium: 500, semibold: 600, bold: 700 },
  spacing: { '2xs': '2px', xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px', '2xl': '48px', '3xl': '64px' },
  sizes: { controlSm: '32px', controlMd: '40px', controlLg: '48px', sidebar: '252px', sidebarCollapsed: '68px', contentMax: '1440px' },
  radii: { xs: '4px', sm: '6px', md: '10px', lg: '14px', xl: '20px', pill: '9999px' },
  borders: { subtle: '1px solid', strong: '1.5px solid' },
  breakpoints: { sm: '480px', md: '768px', lg: '1024px', xl: '1280px' },
  transitions: { fast: '120ms ease', normal: '180ms ease', slow: '280ms cubic-bezier(0.4, 0, 0.2, 1)' },
  transition: 'all 180ms ease',
  zIndices: { dropdown: 600, sticky: 700, overlay: 900, modal: 1000, loading: 1050, toast: 1100 },
};

export const lightTheme = {
  ...baseTheme,
  mode: 'light',
  colors: {
    bg: '#FAFAFD', background: '#FAFAFD', bgCard: '#FFFFFF', surface: '#FFFFFF', surfaceElevated: '#FFFFFF', bgInput: '#FFFFFF', bgHover: '#F5F3FC', bgSidebar: '#FFFFFF',
    primary: '#6D5EF4', primaryHover: '#5B4BD8', primaryActive: '#4D3FC4', primarySoft: '#A89EFF', primaryLight: '#F3F0FF', primarySurface: '#F3F0FF', primaryGlow: 'rgba(109, 94, 244, 0.22)',
    success: '#16845B', successHover: '#0F6D4A', successLight: '#E9F7F0', warning: '#B7660B', warningHover: '#965108', warningLight: '#FFF5E6', danger: '#C9364F', dangerHover: '#A92A40', dangerLight: '#FDEDF0', info: '#3667C8', infoHover: '#2955AD', infoLight: '#EDF3FF',
    textPrimary: '#171327', textSecondary: '#5F5A72', textMuted: '#858096', textInverse: '#FFFFFF', textDisabled: '#AAA6B5',
    border: '#E8E5F2', borderStrong: '#D7D2E5', borderFocus: '#6D5EF4', disabled: '#F0EEF5', disabledForeground: '#AAA6B5', backdrop: 'rgba(23, 19, 39, 0.48)',
  },
  shadows: { xs: '0 1px 2px rgba(31, 25, 58, 0.05)', card: '0 2px 10px rgba(31, 25, 58, 0.06)', raised: '0 10px 28px rgba(31, 25, 58, 0.10)', modal: '0 24px 64px rgba(31, 25, 58, 0.18)', button: '0 2px 6px rgba(76, 62, 193, 0.18)', glow: '0 0 0 3px rgba(109, 94, 244, 0.18)' },
};

export const darkTheme = {
  ...baseTheme,
  mode: 'dark',
  colors: {
    bg: '#12101B', background: '#12101B', bgCard: '#1B1827', surface: '#1B1827', surfaceElevated: '#242033', bgInput: '#211E2E', bgHover: '#2B273B', bgSidebar: '#171420',
    primary: '#A89EFF', primaryHover: '#BDB5FF', primaryActive: '#8D80FA', primarySoft: '#8D80FA', primaryLight: 'rgba(168, 158, 255, 0.14)', primarySurface: '#29243F', primaryGlow: 'rgba(168, 158, 255, 0.28)',
    success: '#55C895', successHover: '#73D7AA', successLight: 'rgba(85, 200, 149, 0.14)', warning: '#F2B85B', warningHover: '#F7C979', warningLight: 'rgba(242, 184, 91, 0.14)', danger: '#FF7B8F', dangerHover: '#FF9BAC', dangerLight: 'rgba(255, 123, 143, 0.14)', info: '#7EA6F4', infoHover: '#9AB9F7', infoLight: 'rgba(126, 166, 244, 0.14)',
    textPrimary: '#F4F1FB', textSecondary: '#C0BACE', textMuted: '#8E879F', textInverse: '#171327', textDisabled: '#6F697C',
    border: '#373247', borderStrong: '#4A445C', borderFocus: '#A89EFF', disabled: '#2A2635', disabledForeground: '#6F697C', backdrop: 'rgba(5, 4, 10, 0.7)',
  },
  shadows: { xs: '0 1px 2px rgba(0, 0, 0, 0.25)', card: '0 3px 14px rgba(0, 0, 0, 0.24)', raised: '0 14px 34px rgba(0, 0, 0, 0.32)', modal: '0 28px 72px rgba(0, 0, 0, 0.48)', button: '0 2px 8px rgba(0, 0, 0, 0.25)', glow: '0 0 0 3px rgba(168, 158, 255, 0.22)' },
};

export const theme = lightTheme;
