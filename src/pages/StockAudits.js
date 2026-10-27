import DataTable from '../components/Table';
import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { MdAdd, MdSearch, MdChevronRight, MdPictureAsPdf } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useApp } from "../context/AppContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import Card from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Select from "../components/Select";

/* -------------------------------------------------------------------------- */
/* Styled UI                                   */
/* -------------------------------------------------------------------------- */

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
  gap: 16px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const Title = styled.h1`
  font-size: ${({ theme }) => theme.fontSizes["3xl"]};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
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
  letter-spacing: 0.05em;
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: 768px) {
    display: none;
  }
`;

const Tr = styled.tr`
  transition: all 0.2s;
  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }

  @media (max-width: 768px) {
    display: flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 12px;
    padding: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  }
`;

const Td = styled.td`
  padding: 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: 768px) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid #f1f5f9;
    width: 100%;

    &:before {
      content: attr(data-label);
      font-weight: 700;
      font-size: 11px;
      color: ${({ theme }) => theme.colors.textMuted};
      text-transform: uppercase;
    }

    &:last-child {
      border-bottom: none;
      padding-top: 15px;
      justify-content: stretch;
    }
  }
`;

const StatusBadge = styled.span`
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;

  background: ${({ theme, status }) =>
        status === "OPEN" ? "#FEF3C7" : "#DCFCE7"};

  color: ${({ theme, status }) =>
        status === "OPEN" ? "#92400E" : "#166534"};
`;

/* -------------------------------------------------------------------------- */
/* Component                                   */
/* -------------------------------------------------------------------------- */

export default function StockAudits() {
    const navigate = useNavigate();
    const { state } = useApp();
    const { products, categories, establishment } = state;
    
    const [audits, setAudits] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [locations, setLocations] = useState([]);
    const [auditLocationId, setAuditLocationId] = useState("");

    useEffect(() => {
        api.get('/stock-locations')
            .then(data => {
                const list = Array.isArray(data) ? data : [];
                setLocations(list);
                setAuditLocationId(list.find(location => location.isDefault)?.id || list[0]?.id || "");
            })
            .catch(error => console.error("Erro ao carregar locais", error));
    }, []);

    const generateBlankPDF = () => {
        const doc = new jsPDF();
        const date = new Date().toLocaleDateString("pt-BR");
        
        // Cabeçalho
        doc.setFontSize(18);
        doc.text("Ficha de Contagem de Estoque", 14, 20);
        
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Estabelecimento: ${establishment?.name || "Geral"}`, 14, 30);
        doc.text(`Data da Emissão: ${date}`, 14, 37);
        
        // Preparar dados da tabela
        // Ordenar produtos por categoria (excluindo ASSET)
        const sortedProducts = products.filter(p => p.type !== "ASSET").sort((a, b) => {
            const catA = categories.find(c => c.id === a.categoryId)?.name || "";
            const catB = categories.find(c => c.id === b.categoryId)?.name || "";
            return catA.localeCompare(catB) || a.name.localeCompare(b.name);
        });

        const tableRows = sortedProducts.map(p => {
            const q = Number(p.quantity || 0);
            const pq = Number(p.packQuantity || 1);
            
            // Texto do estoque (ex: 3750ml)
            let stockDetail = `${q} ${p.unit || 'ml'}`;
            
            // Adiciona conversão se houver (ex: 5 garrafas)
            if (pq > 1) {
                const units = (q / pq).toFixed(1);
                stockDetail += ` (${units} ${p.purchaseUnit || 'un'})`;
            }

            return [
                categories.find(c => c.id === p.categoryId)?.name || "Sem Categoria",
                p.name,
                p.unit || "un",
                stockDetail,
                "________________"
            ];
        });

        autoTable(doc, {
            startY: 45,
            head: [["Categoria", "Produto", "Und", "Estoque (Sist.)", "Contagem Física"]],
            body: tableRows,
            theme: "grid",
            headStyles: { fillColor: [51, 65, 85] }, // Cor slate-700
            styles: { fontSize: 9 },
            columnStyles: {
                3: { halign: 'center', cellWidth: 30 },
                4: { cellWidth: 40 }
            }
        });

        doc.save(`Ficha_Contagem_${establishment?.name || "Estoque"}_${date}.pdf`);
    };

    async function loadAudits() {
        try {
            const data = await api.get("/stock-audits");
            setAudits(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("❌ Erro ao carregar auditorias:", error);
            setAudits([]);
        }
    }

    useEffect(() => {
        loadAudits();
    }, []);

    async function createAudit() {
        try {
            const res = await api.post("/stock-audits", { locationId: auditLocationId || undefined });
            const auditId = res?.id;
            setModalOpen(false);

            if (auditId) {
                navigate(`/stock-audits/${auditId}`);
            }
        } catch (error) {
            console.error("❌ Erro ao criar auditoria:", error);
        }
    }

    return (
        <>
            <PageHeader>
                <div>
                    <Title>Auditorias de Estoque</Title>
                    <p style={{ color: "#64748B", fontSize: "14px", marginTop: "4px" }}>
                        Acompanhe e realize conferências de estoque periódicas
                    </p>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                    <Button
                        variant="secondary"
                        onClick={generateBlankPDF}
                        disabled={products.length === 0}
                    >
                        <MdPictureAsPdf size={20} />
                        Ficha de Contagem
                    </Button>

                    <Button
                        onClick={() => setModalOpen(true)}
                        style={{ width: window.innerWidth < 768 ? "100%" : "auto" }}
                    >
                        <MdAdd size={20} />
                        Nova Auditoria
                    </Button>
                </div>
            </PageHeader>

            <Card padding="0">
                <TableWrapper>
                    <Table>
                        <thead>
                            <tr>
                                <Th>Data de Início</Th>
                                <Th>Status</Th>
                                <Th>Ações</Th>
                            </tr>
                        </thead>

                        <tbody>
                            {audits.length === 0 ? (
                                <tr>
                                    <Td colSpan="3" style={{ textAlign: "center", padding: "40px" }}>
                                        <div style={{ color: "#94A3B8" }}>
                                            <MdSearch size={40} style={{ marginBottom: "8px" }} />
                                            <p>Nenhuma auditoria encontrada</p>
                                        </div>
                                    </Td>
                                </tr>
                            ) : (
                                audits.map((audit) => (
                                    <Tr key={audit.id}>
                                        <Td data-label="Data de Início">
                                            <div style={{ fontWeight: 600 }}>
                                                {audit.createdAt
                                                    ? new Date(audit.createdAt).toLocaleDateString("pt-BR", {
                                                        day: "2-digit",
                                                        month: "long",
                                                        year: "numeric"
                                                    })
                                                    : "-"}
                                            </div>
                                        </Td>

                                        <Td data-label="Status">
                                            <StatusBadge status={audit.status}>
                                                {audit.status === "OPEN" ? "Em Aberto" : "Concluída"}
                                            </StatusBadge>
                                        </Td>

                                        <Td>
                                            <Button
                                                variant="secondary"
                                                onClick={() => navigate(`/stock-audits/${audit.id}`)}
                                                style={{ width: "100%", justifyContent: "center" }}
                                            >
                                                Abrir Auditoria
                                                <MdChevronRight size={18} />
                                            </Button>
                                        </Td>
                                    </Tr>
                                ))
                            )}
                        </tbody>
                    </Table>
                </TableWrapper>
            </Card>

            {/* MODAL CRIAR AUDITORIA */}
            <Modal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title="Nova Auditoria"
                style={{ maxWidth: "450px" }}
                footer={
                    <div style={{ display: "flex", gap: "12px", width: "100%" }}>
                        <Button
                            variant="secondary"
                            onClick={() => setModalOpen(false)}
                            style={{ flex: 1 }}
                        >
                            Cancelar
                        </Button>

                        <Button onClick={createAudit} disabled={!auditLocationId} style={{ flex: 1 }}>
                            Confirmar
                        </Button>
                    </div>
                }
            >
                <div style={{ textAlign: "center", padding: "10px 0" }}>
                    <div style={{
                        width: "60px",
                        height: "60px",
                        background: "#F1F5F9",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 16px"
                    }}>
                        <MdAdd size={30} color="#64748B" />
                    </div>
                    <h3 style={{ marginBottom: "8px", color: "#1E293B" }}>Iniciar Nova Conferência?</h3>
                    <p style={{ color: "#64748B", fontSize: "14px", lineHeight: "1.5" }}>
                        Uma nova lista será gerada com o saldo atual do local selecionado.
                    </p>
                    <div style={{ textAlign: "left", marginTop: "20px" }}>
                        <Select
                            label="Local da auditoria"
                            value={auditLocationId}
                            onChange={setAuditLocationId}
                            options={locations.map(location => ({ value: location.id, label: location.name }))}
                        />
                    </div>
                </div>
            </Modal>
        </>
    );
}
