import React from 'react';
import styled, { keyframes } from 'styled-components';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { useLoading } from '../context/LoadingContext';

const spin = keyframes`to { transform: rotate(360deg); }`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.zIndices.modal};
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.backdrop};
  cursor: wait;
`;

const SpinnerWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  min-width: 160px;
  padding: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.surfaceElevated};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ theme }) => theme.shadows.modal};
`;

const RotatingIcon = styled(AiOutlineLoading3Quarters)`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 2rem;
  animation: ${spin} 800ms linear infinite;
`;

const LoadingText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const LoadingOverlay = () => {
  const { isLoading } = useLoading();
  if (!isLoading) return null;
  return <Overlay role="status" aria-live="assertive" aria-label="Operação em andamento"><SpinnerWrapper><RotatingIcon aria-hidden="true" /><LoadingText>Aguarde...</LoadingText></SpinnerWrapper></Overlay>;
};

export default LoadingOverlay;
