import styled from 'styled-components';

export const TableContainer = styled.div`
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`;

export const TableSurface = styled(TableContainer)`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.bgCard};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

export const DataTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
  color: ${({ theme }) => theme.colors.textPrimary};

  th,
  td {
    padding: 12px 16px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    text-align: left;
    vertical-align: middle;
  }

  th {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.textSecondary};
    font-size: ${({ theme }) => theme.fontSizes.xs};
    font-weight: ${({ theme }) => theme.fontWeights.bold};
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  tbody tr {
    transition: background-color ${({ theme }) => theme.transitions.fast};
  }

  tbody tr:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }
`;

export const TableHead = styled.thead``;
export const TableBody = styled.tbody``;
export const TableRow = styled.tr``;
export const TableHeaderCell = styled.th``;
export const TableCell = styled.td``;

export const TableEmptyCell = styled(TableCell)`
  padding: 32px 16px;
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
`;

export default DataTable;
