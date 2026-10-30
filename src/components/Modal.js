import DSButton from './Button';
import React, { useEffect, useId } from 'react';
import styled, { keyframes } from 'styled-components';
import { MdClose } from 'react-icons/md';

const fadeIn = keyframes`from { opacity: 0; } to { opacity: 1; }`;
const slideUp = keyframes`from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; }`;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: ${({ theme }) => theme.colors.backdrop};
  z-index: ${({ theme }) => theme.zIndices.modal};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.md};
  animation: ${fadeIn} ${({ theme }) => theme.transitions.normal};

  @media (max-width: 480px) {
    align-items: flex-end;
    padding: 8px 0 0;
  }
`;

const Sheet = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.xl};
  box-shadow: ${({ theme }) => theme.shadows.modal};
  width: 100%;
  max-width: ${({ maxWidth }) => maxWidth || '560px'};
  max-height: 90vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  animation: ${slideUp} ${({ theme }) => theme.transitions.slow};

  @media (max-width: 480px) {
    max-height: calc(100dvh - 8px);
    border-radius: ${({ theme }) => `${theme.radii.xl} ${theme.radii.xl} 0 0`};
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => `${theme.spacing.md} ${theme.spacing.lg}`};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgCard};

  @media (max-width: 480px) {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: ${({ theme }) => theme.spacing.md};
  }
`;

const Title = styled.h2`
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 0;
  line-height: 1.25;
  overflow-wrap: anywhere;
`;

const CloseBtn = styled(DSButton)`
  background: ${({ theme }) => theme.colors.bgInput};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  font-size: 1.25rem;
  cursor: pointer;
  transition: ${({ theme }) => theme.transition};
  flex: 0 0 auto;

  &:hover {
    background: ${({ theme }) => theme.colors.dangerLight};
    color: ${({ theme }) => theme.colors.danger};
  }
`;

const Body = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};

  @media (max-width: 480px) { padding: ${({ theme }) => theme.spacing.md}; }
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => `${theme.spacing.md} ${theme.spacing.lg}`};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgCard};

  @media (max-width: 480px) {
    position: sticky;
    bottom: 0;
    z-index: 1;
    flex-direction: column-reverse;
    padding: ${({ theme }) => theme.spacing.md};
    
    button {
      width: 100%;
    }
  }
`;

const Modal = ({ isOpen, onClose, title, children, maxWidth, footer }) => {
  const titleId = useId();
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => event.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <Backdrop onClick={(e) => e.target === e.currentTarget && onClose()}>
      <Sheet maxWidth={maxWidth} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <Header>
          <Title id={titleId}>{title}</Title>
          <CloseBtn onClick={onClose} aria-label="Fechar">
            <MdClose />
          </CloseBtn>
        </Header>
        <Body>{children}</Body>
        {footer && <Footer>{footer}</Footer>}
      </Sheet>
    </Backdrop>
  );
};

export default Modal;
