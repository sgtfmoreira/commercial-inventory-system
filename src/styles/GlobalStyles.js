import { createGlobalStyle } from 'styled-components';

const GlobalStyles = createGlobalStyle`
  :root {
    color-scheme: ${({ theme }) => theme.mode};
    --color-primary: ${({ theme }) => theme.colors.primary};
    --color-primary-hover: ${({ theme }) => theme.colors.primaryHover};
    --color-primary-surface: ${({ theme }) => theme.colors.primarySurface};
    --color-background: ${({ theme }) => theme.colors.background};
    --color-surface: ${({ theme }) => theme.colors.surface};
    --color-text: ${({ theme }) => theme.colors.textPrimary};
    --color-text-secondary: ${({ theme }) => theme.colors.textSecondary};
    --color-text-muted: ${({ theme }) => theme.colors.textMuted};
    --color-border: ${({ theme }) => theme.colors.border};
    --color-success: ${({ theme }) => theme.colors.success};
    --color-warning: ${({ theme }) => theme.colors.warning};
    --color-danger: ${({ theme }) => theme.colors.danger};
    --color-info: ${({ theme }) => theme.colors.info};
    --focus-ring: 0 0 0 3px ${({ theme }) => theme.colors.primaryGlow};
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 16px; scroll-behavior: smooth; }
  body {
    min-width: 320px;
    font-family: ${({ theme }) => theme.fonts.base};
    background-color: ${({ theme }) => theme.colors.bg};
    color: ${({ theme }) => theme.colors.textPrimary};
    font-size: ${({ theme }) => theme.fontSizes.md};
    line-height: ${({ theme }) => theme.lineHeights.body};
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  h1, h2, h3, h4, h5, h6 { font-family: ${({ theme }) => theme.fonts.heading}; line-height: ${({ theme }) => theme.lineHeights.heading}; letter-spacing: -0.02em; }
  ::selection { color: ${({ theme }) => theme.colors.textPrimary}; background: ${({ theme }) => theme.colors.primarySoft}; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${({ theme }) => theme.colors.borderStrong}; border: 2px solid ${({ theme }) => theme.colors.bg}; border-radius: ${({ theme }) => theme.radii.pill}; }
  ::-webkit-scrollbar-thumb:hover { background: ${({ theme }) => theme.colors.primarySoft}; }
  a { text-decoration: none; color: inherit; }
  button, input, select, textarea { font: inherit; }
  button { cursor: pointer; border: 0; }
  button:disabled { cursor: not-allowed; }
  ul, ol { list-style: none; }
  img, svg { display: block; max-width: 100%; }
  :where(a, button, input, select, textarea, [tabindex]):focus-visible { outline: 2px solid ${({ theme }) => theme.colors.borderFocus}; outline-offset: 2px; }
  :where(input, select, textarea) { accent-color: ${({ theme }) => theme.colors.primary}; }
  :where(input, select, textarea):disabled { color: ${({ theme }) => theme.colors.disabledForeground}; background: ${({ theme }) => theme.colors.disabled}; cursor: not-allowed; }
  table { font-variant-numeric: tabular-nums; }
  @media (max-width: ${({ theme }) => theme.breakpoints.md}) { body { font-size: ${({ theme }) => theme.fontSizes.sm}; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; } }
`;

export default GlobalStyles;
