import React from 'react';
import styled, { css, keyframes } from 'styled-components';

const spin = keyframes`to { transform: rotate(360deg); }`;

const variants = {
  primary: css`
    color: ${({ theme }) => theme.colors.textInverse};
    background: ${({ theme }) => theme.colors.primary};
    box-shadow: ${({ theme }) => theme.shadows.button};
    &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.primaryHover}; }
  `,
  secondary: css`
    color: ${({ theme }) => theme.colors.primary};
    background: ${({ theme }) => theme.colors.primarySurface};
    &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.primaryLight}; color: ${({ theme }) => theme.colors.primaryHover}; }
  `,
  outlined: css`
    color: ${({ theme }) => theme.colors.textPrimary};
    background: transparent;
    border-color: ${({ theme }) => theme.colors.borderStrong};
    &:hover:not(:disabled) { color: ${({ theme }) => theme.colors.primary}; background: ${({ theme }) => theme.colors.primarySurface}; border-color: ${({ theme }) => theme.colors.primarySoft}; }
  `,
  ghost: css`
    color: ${({ theme }) => theme.colors.textSecondary};
    background: transparent;
    &:hover:not(:disabled) { color: ${({ theme }) => theme.colors.primary}; background: ${({ theme }) => theme.colors.primarySurface}; }
  `,
  text: css`
    color: ${({ theme }) => theme.colors.primary};
    background: transparent;
    padding-inline: ${({ theme }) => theme.spacing.sm};
    &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.primarySurface}; }
  `,
  danger: css`
    color: ${({ theme }) => theme.colors.danger};
    background: ${({ theme }) => theme.colors.dangerLight};
    &:hover:not(:disabled) { color: #fff; background: ${({ theme }) => theme.colors.dangerHover}; }
  `,
  destructive: css`
    color: #fff;
    background: ${({ theme }) => theme.colors.danger};
    &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.dangerHover}; }
  `,
  success: css`
    color: #fff;
    background: ${({ theme }) => theme.colors.success};
    &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.successHover}; }
  `,
};

const StyledButton = styled.button`
  position: relative;
  min-height: ${({ $size, theme }) => $size === 'sm' ? theme.sizes.controlSm : $size === 'lg' ? theme.sizes.controlLg : theme.sizes.controlMd};
  display: inline-grid;
  grid-template-areas: 'content';
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ $size, $iconOnly }) => $iconOnly ? '0' : $size === 'sm' ? '6px 12px' : $size === 'lg' ? '12px 22px' : '9px 16px'};
  width: ${({ $fullWidth, $iconOnly, $size, theme }) => $fullWidth ? '100%' : $iconOnly ? ($size === 'sm' ? theme.sizes.controlSm : $size === 'lg' ? theme.sizes.controlLg : theme.sizes.controlMd) : 'auto'};
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme, $size }) => $size === 'sm' ? theme.fontSizes.sm : $size === 'lg' ? theme.fontSizes.lg : theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  line-height: 1;
  white-space: nowrap;
  transition: background ${({ theme }) => theme.transitions.fast}, color ${({ theme }) => theme.transitions.fast}, border-color ${({ theme }) => theme.transitions.fast}, transform ${({ theme }) => theme.transitions.fast};
  ${({ $variant }) => variants[$variant] || variants.primary}
  &:active:not(:disabled) { transform: translateY(1px); }
  &:disabled { color: ${({ theme }) => theme.colors.disabledForeground}; background: ${({ theme }) => theme.colors.disabled}; box-shadow: none; opacity: 1; }
  svg { flex: 0 0 auto; font-size: 1.15em; }
`;

const Spinner = styled.span`
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: ${spin} 700ms linear infinite;
`;

const Content = styled.span`
  grid-area: content;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: inherit;
  visibility: ${({ $hidden }) => $hidden ? 'hidden' : 'visible'};
`;

const LoadingLayer = styled.span`
  grid-area: content;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const normalizeVariant = (variant) => variant === 'pdf' ? 'primary' : variant;

const Button = ({
  children,
  variant,
  $variant: legacyVariant,
  $secondary = false,
  $danger = false,
  danger = false,
  $active,
  active,
  size = 'md',
  fullWidth = false,
  iconOnly = false,
  loading = false,
  loadingLabel = 'Carregando',
  disabled,
  title,
  ...rest
}) => {
  const selected = $active ?? active;
  const resolvedVariant = normalizeVariant(
    variant || legacyVariant || (($danger || danger) ? 'danger' : $secondary ? 'secondary' : selected === false ? 'outlined' : 'primary')
  );

  return <StyledButton
    $variant={resolvedVariant}
    $size={size}
    $fullWidth={fullWidth}
    $iconOnly={iconOnly}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    title={title}
    {...rest}
  >
    <Content $hidden={loading}>{children}</Content>
    {loading && <LoadingLayer><Spinner aria-hidden="true" />{!iconOnly && <span>{loadingLabel}</span>}</LoadingLayer>}
  </StyledButton>;
};

export default Button;
