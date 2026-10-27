import React from 'react';
import styled from 'styled-components';

const Wrapper = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 3px 9px;
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.radii.pill};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  white-space: nowrap;
  line-height: 1;

  background: ${({ variant, theme }) => {
        switch (variant) {
            case 'success': return theme.colors.successLight;
            case 'warning': return theme.colors.warningLight;
            case 'danger': return theme.colors.dangerLight;
            case 'info': return theme.colors.infoLight;
            default: return theme.colors.primaryLight;
        }
    }};

  color: ${({ variant, theme }) => {
        switch (variant) {
            case 'success': return theme.colors.success;
            case 'warning': return theme.colors.warning;
            case 'danger': return theme.colors.danger;
            case 'info': return theme.colors.info;
            default: return theme.colors.primary;
        }
    }};
`;

const Badge = ({ children, variant = 'primary' }) => (
    <Wrapper variant={variant} role="status">{children}</Wrapper>
);

export default Badge;
