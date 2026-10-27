import styled from 'styled-components';

const Card = styled.div`
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ theme }) => theme.shadows.card};
  padding: ${({ padding, theme }) => padding || theme.spacing.lg};
  transition: border-color ${({ theme }) => theme.transitions.normal}, box-shadow ${({ theme }) => theme.transitions.normal}, transform ${({ theme }) => theme.transitions.normal};
  ${({ fullHeight }) => fullHeight && 'height: 100%;'}
  ${({ $interactive, theme }) => $interactive && `cursor: pointer; &:hover { border-color: ${theme.colors.primarySoft}; box-shadow: ${theme.shadows.raised}; transform: translateY(-1px); }`}
`;

export const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

export const StatCard = styled(Card)`
  padding: ${({ theme }) => theme.spacing.md};
  box-shadow: none;

  span {
    display: block;
    margin-bottom: ${({ theme }) => theme.spacing.xs};
    color: ${({ theme }) => theme.colors.textMuted};
    font-size: ${({ theme }) => theme.fontSizes.xs};
    font-weight: ${({ theme }) => theme.fontWeights.medium};
  }

  strong {
    color: ${({ theme }) => theme.colors.textPrimary};
    font-size: ${({ theme }) => theme.fontSizes.xl};
    font-weight: ${({ theme }) => theme.fontWeights.bold};
  }
`;

export default Card;
