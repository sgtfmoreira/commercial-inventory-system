import { InputControl } from '../components/FormFields';
import DataTable from '../components/Table';
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { MdSave, MdCheckCircle, MdArrowBack } from "react-icons/md";
import api from "../services/api";
import { useApp } from "../context/AppContext";
import Card from "../components/Card";
import Button from "../components/Button";

/* -------------------------------------------------------------------------- */
/* Styled UI                                   */
/* -------------------------------------------------------------------------- */

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
  gap: 16px;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const TitleSection = styled.div`
  flex: 1;
`;

const StatusBadge = styled.span`
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  background: ${({ isOpen }) => (isOpen ? "#FEF3C7" : "#DCFCE7")};
  color: ${({ isOpen }) => (isOpen ? "#92400E" : "#166534")};
`;

const TableWrapper = styled.div`
  width: 100%;
  overflow-x: auto;
`;

const Table = styled(DataTable)`
  width: 100%;
  border-collapse: collapse;

  @media (max-width: 768px) {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px;
  }
`;

const Th = styled.th`
  text-align: left;
  padding: 16px;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: 768px) {
    display: none;
  }
`;

const Tr = styled.tr`
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }

  @media (max-width: 768px) {
    display: flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 12px;
    padding: 12px;
  }
`;

const Td = styled.td`
  padding: 16px;
  font-size: 14px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: 768px) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--color-primary-surface);
    width: 100%;

    &:before {
      content: attr(data-label);
      font-weight: 700;
      font-size: 11px;
      color: ${({ theme }) => theme.colors.textMuted};
      text-transform: uppercase;
    }

    &:last-child { border-bottom: none; }
  }
`;

const Input = styled(InputControl)`
  width: 100px;
  padding: 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  text-align: center;
  font-size: 16px; // Evita zoom no mobile
  font-weight: 600;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }

  @media (max-width: 768px) {
    width: 80px;
  }
`;

const ActionFooter = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 24px;

  @media (max-width: 768px) {
    flex-direction: column;
    
    button { width: 100%; }
  }
`;

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InputLabel = styled.label`
  font-size: 10px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  margin-left: 2px;
`;

const DoubleInputContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const TotalPreview = styled.div`
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 4px;
  font-weight: 500;
`;

/* -------------------------------------------------------------------------- */
/* Component                                   */
/* -------------------------------------------------------------------------- */

export default function StockAuditDetail() {
    const navigate = useNavigate();
    const { id } = useParams();
    const { fetchAllData } = useApp();

    const [audit, setAudit] = useState(null);
    const [items, setItems] = useState([]);
    const [saving, setSaving] = useState(false);
    const [hasSaved, setHasSaved] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    async function loadAudit() {
        try {
            const data = await api.get(`/stock-audits/${id}`);
            setAudit(data);
            setItems(data.items.map(item => {
                const counted = Number(item.countedQuantity || 0);
                const system = Number(item.systemQuantity || 0);
                return {
                    ...item,
                    countedQuantity: counted,
                    difference: counted - system
                };
            }));

            // Se os itens já têm contagem salva (vindos do banco), considerar como "salvo"
            // countedAt diferencia uma contagem zero confirmada de uma auditoria
            // nova, cujos itens também começam em zero.
            setHasSaved(Boolean(data.countedAt));
            setHasChanges(false);
        } catch (error) {
            console.error(error);
        }
    }

    useEffect(() => {
        loadAudit();
    }, [id]);

    function handleDoubleChange(itemId, type, value, packQty) {
        const numValue = value === "" ? 0 : Number(value);

        const updated = items.map(item => {
            if (item.id === itemId) {
                const currentTotal = Number(item.countedQuantity || 0);
                const whole = Math.floor(currentTotal / packQty);
                const loose = currentTotal % packQty;

                let newTotal = 0;
                if (type === 'whole') {
                    newTotal = (numValue * packQty) + loose;
                } else if (type === 'loose') {
                    newTotal = (whole * packQty) + numValue;
                } else {
                    newTotal = numValue;
                }

                const difference = newTotal - Number(item.systemQuantity);

                return {
                    ...item,
                    countedQuantity: newTotal,
                    difference
                };
            }
            return item;
        });
        setItems(updated);
        setHasChanges(true);
    }

    const saveItems = async () => {
        setSaving(true);
        try {
            const payload = items.map(item => ({
                id: item.id,
                countedQuantity: Number(item.countedQuantity || 0),
                systemQuantity: Number(item.systemQuantity || 0)
            }));
            await api.patch(`/stock-audits/${id}/items`, payload);
            await loadAudit();
            setHasSaved(true);
            setHasChanges(false);
        } catch (error) {
            console.error("ERRO SAVE ITEMS:", error);
        }
        setSaving(false);
    };

    async function finishAudit() {
        if (!window.confirm("Deseja finalizar a auditoria? O estoque do sistema será atualizado.")) return;
        try {
            await api.patch(`/stock-audits/${id}/finish`);

            // 🔥 RECARREGAR TODOS OS DADOS — inclui stockMovements para as perdas
            // aparecerem imediatamente no Dashboard e Relatórios
            await fetchAllData(false);

            navigate("/stock-audits");
        } catch (error) {
            console.error("ERRO AO FINALIZAR AUDITORIA:", error);
            alert("Erro ao finalizar auditoria: " + (error?.response?.data?.error || error.message));
        }
    }

    if (!audit) return <div style={{ padding: 40, textAlign: "center" }}>Carregando auditoria...</div>;

    const isOpen = audit.status === "OPEN";

    return (
        <>
            <PageHeader>
                <TitleSection>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Button variant="secondary" size="sm" onClick={() => navigate("/stock-audits")}>
                            <MdArrowBack />
                        </Button>
                        <h1 style={{ fontSize: "24px", fontWeight: 700 }}>Executar Auditoria</h1>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
                        <StatusBadge isOpen={isOpen}>
                            {isOpen ? "Em Andamento" : "Finalizada"}
                        </StatusBadge>
                        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                            Iniciada em: {new Date(audit.createdAt).toLocaleDateString()}
                        </span>
                    </div>
                </TitleSection>
            </PageHeader>

            <Card padding="0">
                <TableWrapper>
                    <Table>
                        <thead>
                            <tr>
                                <Th>Produto</Th>
                                <Th>Sistema</Th>
                                <Th>Contado</Th>
                                <Th>Diferença</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => {
                                const packQty = Number(item.product?.packQuantity || 1);
                                const hasConversion = packQty > 1 && item.product?.purchaseUnit;
                                
                                const currentTotal = Number(item.countedQuantity || 0);
                                const wholePart = Math.floor(currentTotal / packQty);
                                const loosePart = currentTotal % packQty;

                                return (
                                    <Tr key={item.id}>
                                        <Td data-label="Produto">
                                            <div style={{ fontWeight: 600 }}>{item.product.name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                                                {hasConversion ? `1 ${item.product.purchaseUnit} = ${packQty} ${item.product.unit}` : item.product.unit}
                                            </div>
                                        </Td>

                                        <Td data-label="Sistema">
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 600 }}>{item.systemQuantity}</span>
                                                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{item.product?.unit}</span>
                                            </div>
                                        </Td>

                                        <Td data-label="Contado">
                                            {hasConversion ? (
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <DoubleInputContainer>
                                                        <InputGroup>
                                                            <InputLabel>{item.product.purchaseUnit}</InputLabel>
                                                            <Input
                                                                type="number"
                                                                value={wholePart || ""}
                                                                placeholder="0"
                                                                disabled={!isOpen}
                                                                onChange={(e) => handleDoubleChange(item.id, 'whole', e.target.value, packQty)}
                                                            />
                                                        </InputGroup>
                                                        <span style={{ marginTop: 16, fontWeight: 700, color: 'var(--color-text-muted)' }}>+</span>
                                                        <InputGroup>
                                                            <InputLabel>{item.product.unit}</InputLabel>
                                                            <Input
                                                                type="number"
                                                                value={loosePart || ""}
                                                                placeholder="0"
                                                                disabled={!isOpen}
                                                                onChange={(e) => handleDoubleChange(item.id, 'loose', e.target.value, packQty)}
                                                            />
                                                        </InputGroup>
                                                    </DoubleInputContainer>
                                                    <TotalPreview>= {currentTotal} {item.product.unit}</TotalPreview>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Input
                                                        type="number"
                                                        value={item.countedQuantity || ""}
                                                        placeholder="0"
                                                        disabled={!isOpen}
                                                        onChange={(e) => handleDoubleChange(item.id, 'total', e.target.value, 1)}
                                                    />
                                                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                                                        {item.product?.unit}
                                                    </span>
                                                </div>
                                            )}
                                        </Td>

                                        <Td data-label="Diferença">
                                            <div style={{
                                                fontWeight: "800",
                                                color: item.difference < 0 ? "var(--color-danger)" : "#16a34a",
                                                background: item.difference < 0 ? "#fef2f2" : "#f0fdf4",
                                                padding: "4px 8px",
                                                borderRadius: "4px",
                                                minWidth: "40px",
                                                textAlign: "center"
                                            }}>
                                                {item.difference > 0 ? `+${item.difference}` : item.difference || 0}
                                            </div>
                                        </Td>
                                    </Tr>
                                );
                            })}
                        </tbody>
                    </Table>
                </TableWrapper>
            </Card>

            {isOpen && (
                <ActionFooter>
                    <Button onClick={saveItems} disabled={saving} style={{ flex: 1 }}>
                        <MdSave /> {saving ? "Salvando..." : hasChanges ? "⚠️ Salvar Contagem" : "Salvar Contagem"}
                    </Button>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <Button
                            onClick={finishAudit}
                            variant="success"
                            disabled={!hasSaved || hasChanges}
                            style={{ width: '100%', opacity: (!hasSaved || hasChanges) ? 0.5 : 1 }}
                        >
                            <MdCheckCircle /> Finalizar Auditoria
                        </Button>
                        {(!hasSaved || hasChanges) && (
                            <span style={{
                                fontSize: '11px',
                                color: 'var(--color-danger)',
                                fontWeight: 600,
                                textAlign: 'center'
                            }}>
                                {hasChanges
                                    ? "⚠️ Salve a contagem antes de finalizar"
                                    : "⚠️ Faça a contagem e salve antes de finalizar"}
                            </span>
                        )}
                    </div>
                </ActionFooter>
            )}
        </>
    );
}
