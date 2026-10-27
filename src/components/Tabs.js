import React from 'react';
import styled from 'styled-components';
import Button from './Button';

export const Tabs = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  width: fit-content;
  max-width: 100%;
  padding: ${({ theme }) => theme.spacing.xs};
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.bgHover};
`;

export const Tab = ({ active = false, children, ...props }) => (
  <Button
    type="button"
    size="sm"
    variant={active ? 'primary' : 'ghost'}
    aria-pressed={active}
    {...props}
  >
    {children}
  </Button>
);

export default Tabs;
