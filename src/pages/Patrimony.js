import DSButton from '../components/Button';
import DataTable from '../components/Table';
import React, { useState, useMemo, useEffect } from "react";
import styled, { useTheme } from "styled-components";
import { MdAdd, MdEdit, MdDelete, MdPictureAsPdf, MdInventory } from "react-icons/md";
import Card from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { Input } from "../components/FormFields";
import Select from "../components/Select";
import { useApp } from "../context/AppContext";
import api from "../services/api";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
    
    & > div {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    button {
      width: 100%;
      justify-content: center;
    }
  }
`;

const TitleBlock = styled.div``;

const PageTitle = styled.h1`
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
`;

const PageSubtitle = styled.p`
  color: #64748b;
  font-size: 14px;
  margin-top: 4px;
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
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;

  @media (max-width: 768px) {
    display: none;
  }
`;

const Td = styled.td`
  padding: 12px 16px;
  font-size: 14px;
  color: #334155;
  border-bottom: 1px solid #e2e8f0;

  @media (max-width: 768px) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    width: 100%;

    &:before {
      content: attr(data-label);
      font-weight: 700;
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
    }

    &:last-child {
      border-bottom: none;
      padding-top: 15px;
      justify-content: stretch;
    }
  }
`;

const Tr = styled.tr`
  &:hover {
    background: #f8fafc;
  }

  @media (max-width: 768px) {
    display: flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const IconButton = ({ className, ...props }) => (
  <DSButton size="sm" iconOnly variant={className === 'danger' ? 'danger' : 'ghost'} {...props} />
);

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const FormFull = styled.div`
  grid-column: 1 / -1;
`;

const EMPTY_FORM = {
    name: '',
    categoryId: '',
    unit: 'un',
    quantity: '',
    unitPrice: '',
};

export default function Patrimony() {
    const { state, loadProducts } = useApp();
    const { products, categories, establishment } = state;
    const theme = useTheme();

    const [search, setSearch] = useState("");
    const [modalOpen, setModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [deleteModal, setDeleteModal] = useState(null);

    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});

    // Apenas ASSETS
    const assets = useMemo(() => {
        return products.filter(p => p.type === "ASSET");
    }, [products]);

    const filtered = useMemo(() => {
        return assets.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    }, [assets, search]);

    const totalValue = assets.reduce((sum, p) => sum + (Number(p.quantity) * Number(p.unitPrice || 0)), 0);

    const openAdd = () => {
        setEditTarget(null);
        setForm(EMPTY_FORM);
        setErrors({});
        setModalOpen(true);
    };

    const openEdit = (p) => {
        setEditTarget(p);
        setForm({
            name: p.name,
            categoryId: p.categoryId || '',
            unit: p.unit || 'un',
            quantity: p.quantity,
            unitPrice: p.unitPrice,
        });
        setErrors({});
        setModalOpen(true);
    };

    const validate = () => {
        const e = {};
        if (!form.name.trim()) e.name = "Obrigatório";
        if (!form.categoryId) e.categoryId = "Obrigatório";
        if (form.quantity === "" || isNaN(form.quantity) || Number(form.quantity) < 0) e.quantity = "Inválido";
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;

        const payload = {
            name: form.name,
            categoryId: form.categoryId,
            unit: form.unit,
            purchaseUnit: form.unit, // Simplified for assets
            packQuantity: 1, // Usually 1 for plates/glasses
            type: "ASSET",
            unitPrice: Number(form.unitPrice || 0),
            quantity: Number(form.quantity || 0),
            minQuantity: 0, // Not strictly using minimums for assets in suggestions
        };

        try {
            if (editTarget) {
                await api.put(`/products/${editTarget.id}`, payload);
                toast.success("Patrimônio atualizado!");
            } else {
                await api.post('/products', payload);
                toast.success("Patrimônio criado com sucesso!");
            }
            await loadProducts();
            setModalOpen(false);
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.message || "Erro ao salvar patrimônio");
        }
    };

    const handleDelete = async () => {
        if (!deleteModal) return;
        try {
            await api.delete(`/products/${deleteModal.id}`);
            await loadProducts();
            setDeleteModal(null);
            toast.success("Removido com sucesso");
        } catch (err) {
            toast.error("Erro ao remover");
        }
    };

    const exportListPDF = () => {
        const doc = new jsPDF();
        const date = new Date().toLocaleDateString("pt-BR");
        
        doc.setFontSize(18);
        doc.text("Relatório de Patrimônio", 14, 20);
        
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Estabelecimento: ${establishment?.name || "Geral"}`, 14, 30);
        doc.text(`Data: ${date}`, 14, 37);
        doc.text(`Valor Total Estimado: R$ ${totalValue.toFixed(2)}`, 14, 44);

        const tableRows = filtered.map(p => {
            const cat = categories.find(c => c.id === p.categoryId)?.name || "-";
            const val = Number(p.quantity) * Number(p.unitPrice || 0);
            return [
                cat,
                p.name,
                p.quantity + " " + p.unit,
                `R$ ${Number(p.unitPrice || 0).toFixed(2)}`,
                `R$ ${val.toFixed(2)}`
            ];
        });

        autoTable(doc, {
            startY: 50,
            head: [["Categoria", "Item", "Quantidade", "Custo Unit.", "Total"]],
            body: tableRows,
            theme: "grid",
            headStyles: { fillColor: [15, 23, 42] },
            styles: { fontSize: 10 },
        });

        doc.save(`Patrimonio_${date}.pdf`);
    };

    const exportAuditPDF = () => {
        const doc = new jsPDF();
        const date = new Date().toLocaleDateString("pt-BR");
        
        doc.setFontSize(18);
        doc.text("Ficha de Auditoria de Patrimônio", 14, 20);
        
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Estabelecimento: ${establishment?.name || "Geral"}`, 14, 30);
        doc.text(`Data: ${date}`, 14, 37);

        const tableRows = filtered.map(p => {
            const cat = categories.find(c => c.id === p.categoryId)?.name || "-";
            return [
                cat,
                p.name,
                p.quantity + " " + p.unit,
                "__________________"
            ];
        });

        autoTable(doc, {
            startY: 45,
            head: [["Categoria", "Item", "Estoque Atual", "Contagem Física"]],
            body: tableRows,
            theme: "grid",
            headStyles: { fillColor: [51, 65, 85] },
            styles: { fontSize: 10 },
            columnStyles: {
                2: { halign: 'center' }
            }
        });

        doc.save(`Auditoria_Patrimonio_${date}.pdf`);
    };

    return (
        <div>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>Controle de Patrimônio</PageTitle>
                    <PageSubtitle>Taças, Copos, Pratos e Utensílios</PageSubtitle>
                </TitleBlock>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <Button variant="secondary" onClick={exportAuditPDF} disabled={filtered.length === 0}>
                        <MdInventory size={18} /> Ficha de Contagem
                    </Button>
                    <Button variant="secondary" onClick={exportListPDF} disabled={filtered.length === 0}>
                        <MdPictureAsPdf size={18} /> Exportar Lista
                    </Button>
                    <Button onClick={openAdd}>
                        <MdAdd size={18} /> Novo Item
                    </Button>
                </div>
            </PageHeader>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
                <Card>
                    <div style={{ fontSize: 13, color: "#64748B" }}>Total de Itens</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{assets.length}</div>
                </Card>
                <Card>
                    <div style={{ fontSize: 13, color: "#64748B" }}>Valor em Patrimônio</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>R$ {totalValue.toFixed(2)}</div>
                </Card>
            </div>

            <Card padding="0">
                <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0" }}>
                    <Input
                        placeholder="Buscar patrimônio..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ maxWidth: 300 }}
                    />
                </div>
                <TableWrapper>
                    <Table>
                        <thead>
                            <tr>
                                <Th>Item</Th>
                                <Th>Categoria</Th>
                                <Th>Quantidade</Th>
                                <Th>Custo Unit.</Th>
                                <Th>Ações</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <Td colSpan="5" style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                                        Nenhum item encontrado.
                                    </Td>
                                </tr>
                            ) : (
                                filtered.map(p => (
                                    <Tr key={p.id}>
                                        <Td data-label="Item"><strong>{p.name}</strong></Td>
                                        <Td data-label="Categoria">{categories.find(c => c.id === p.categoryId)?.name || "-"}</Td>
                                        <Td data-label="Quantidade">{p.quantity} {p.unit}</Td>
                                        <Td data-label="Custo Unit.">R$ {Number(p.unitPrice || 0).toFixed(2)}</Td>
                                        <Td data-label="Ações">
                                            <ActionButtons>
                                                <IconButton onClick={() => openEdit(p)}><MdEdit size={18} /></IconButton>
                                                <IconButton className="danger" onClick={() => setDeleteModal(p)}><MdDelete size={18} /></IconButton>
                                            </ActionButtons>
                                        </Td>
                                    </Tr>
                                ))
                            )}
                        </tbody>
                    </Table>
                </TableWrapper>
            </Card>

            <Modal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editTarget ? "Editar Patrimônio" : "Novo Patrimônio"}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSubmit}>Salvar</Button>
                    </>
                }
            >
                <FormGrid>
                    <FormFull>
                        <Input label="Nome do Item *" value={form.name} onChange={e => setForm({...form, name: e.target.value})} error={errors.name} />
                    </FormFull>
                    <FormFull>
                        <Select 
                            label="Categoria *" 
                            value={form.categoryId} 
                            onChange={v => setForm({...form, categoryId: v})}
                            error={errors.categoryId}
                            options={[{value: '', label: '-- Selecione --'}, ...categories.map(c => ({value: c.id, label: c.name}))]}
                        />
                    </FormFull>
                    <Input label="Unidade (Ex: un, jogo)" value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} />
                    <Input label="Custo Unitário (R$)" type="number" step="0.01" value={form.unitPrice} onChange={e => setForm({...form, unitPrice: e.target.value})} />
                    <FormFull>
                        <Input label="Quantidade Atual *" type="number" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} error={errors.quantity} />
                    </FormFull>
                </FormGrid>
            </Modal>

            <Modal
                isOpen={!!deleteModal}
                onClose={() => setDeleteModal(null)}
                title="Deletar Item"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteModal(null)}>Cancelar</Button>
                        <Button variant="danger" onClick={handleDelete}>Deletar</Button>
                    </>
                }
            >
                Tem certeza que deseja deletar <strong>{deleteModal?.name}</strong>?
            </Modal>
        </div>
    );
}
