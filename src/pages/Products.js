import { CheckboxControl } from '../components/FormFields';
import DSButton from '../components/Button';
import { InputControl } from '../components/FormFields';
import DataTable from '../components/Table';
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { MdAdd, MdEdit, MdDelete, MdSearch, MdEdit as MdQty, MdStore, MdWarning, MdPictureAsPdf, MdTimeline } from 'react-icons/md';
import { useApp, ACTIONS } from '../context/AppContext';
import { formatCurrency } from '../utils/formatCurrency';
import Card from '../components/Card';
import Button from '../components/Button';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import toast from "react-hot-toast";
import EmptyState from '../components/EmptyState';
import api from "../services/api";
import RecipeModal from "../components/RecipeModal";
import { Input, CurrencyInput } from '../components/FormFields';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Select from "../components/Select";
import { useLocation } from "react-router-dom";
import { MdMenuBook } from "react-icons/md";
import {
    getProductSuppliers,
    addProductSupplier,
    removeProductSupplier
} from "../services/productSupplierService";
import { getStockLocations } from "../services/stockLocationService";
import { getProductPriceHistory } from "../services/productService";

// ─── Constants ─────────────────────────────────────────────────────────────────
const UNITS = ['unidade', 'kg', 'g', 'litro', 'ml', 'caixa', 'pacote', 'saco', 'rolo', 'metro', 'pç'];
const EMPTY_FORM = {
    name: '',
    categoryId: '',
    type: 'INVENTORY',
    unit: 'unidade',
    purchaseUnit: '',
    packQuantity: 1,
    unitPrice: '',
    salePrice: '',
    quantity: '',
    minQuantity: '',
    supplierId: '',
    defaultLocationId: '',
    isActive: true,
    purchaseClassification: 'CMV_BEVERAGES',
    restockFrequency: 'ON_DEMAND',
    idealQuantity: '',
    trackInventory: true,
    responsibleSector: '',
};

// ─── Styled ────────────────────────────────────────────────────────────────────
const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
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
  font-size: ${({ theme }) => theme.fontSizes['3xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
`;

const PageSubtitle = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-top: 4px;
`;

const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
`;

const SearchBox = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 10px 14px;
  flex: 1;
  min-width: 240px;
  transition: ${({ theme }) => theme.transition};

  svg {
    color: ${({ theme }) => theme.colors.textMuted};
    font-size: 18px;
  }

  &:focus-within {
    border-color: ${({ theme }) => theme.colors.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primaryLight};
  }
`;

const SearchInput = styled(InputControl)`
  background: none;
  border: none;
  outline: none;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  width: 100%;
  &::placeholder { color: ${({ theme }) => theme.colors.textMuted}; }
`;

const FilterGroup = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
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
  padding: 10px 12px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: 768px) {
    display: none;
  }
`;

const Td = styled.td`
  padding: 10px 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  vertical-align: middle;

  @media (max-width: 768px) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
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

const Tr = styled.tr`
  transition: ${({ theme }) => theme.transition};

  ${({ lowStock }) =>
        lowStock &&
        `
      background: rgba(239,68,68,0.05);
  `}

  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }

  @media (max-width: 768px) {
    display: flex;
    flex-direction: column;
    background: ${({ theme }) => theme.colors.bgCard};
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 12px;
    padding: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  }
`;

const ActionRow = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
`;

const IconBtn = ({ color, ...props }) => (
  <DSButton size="sm" iconOnly variant={color === 'danger' ? 'danger' : 'outlined'} {...props} />
);

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.lg};

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const FormFull = styled.div`
  grid-column: 1 / -1;
`;

const DateMeta = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.6;
`;

const TableOverflow = styled.div`
  overflow-x: auto;
  width: 100%;
  max-width: 100%;
`;

// ─── Page Component ─────────────────────────────────────────────────────────────
const Products = () => {
    const { state, dispatch } = useApp();
    const location = useLocation();
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterStock, setFilterStock] = useState('all');

    const [modalOpen, setModalOpen] = useState(false);
    const [deleteModal, setDeleteModal] = useState(null);
    const [qtyModal, setQtyModal] = useState(null);
    const [editTarget, setEditTarget] = useState(null);
    const [qtyValue, setQtyValue] = useState('');
    const [errors, setErrors] = useState({});
    const [supplierModal, setSupplierModal] = useState(null);
    const [productSuppliers, setProductSuppliers] = useState([]);
    const [selectedSupplier, setSelectedSupplier] = useState("");
    const [supplierPrice, setSupplierPrice] = useState("");
    const [syncNetwork, setSyncNetwork] = useState(true);
    const [recipeModal, setRecipeModal] = useState(null);
    const [filterType, setFilterType] = useState("ALL");
    const [form, setForm] = useState(EMPTY_FORM);
    const [locations, setLocations] = useState([]);
    const [qtyLocationId, setQtyLocationId] = useState('');
    const [priceHistoryProduct, setPriceHistoryProduct] = useState(null);
    const [priceHistory, setPriceHistory] = useState([]);

    // 🔥 FUNÇÃO FORA (CORRETO)
    const loadProducts = async () => {
        try {
            console.log("📡 [FRONT-DEBUG] Iniciando busca de produtos...");

            const res = await api.get("/products");

            // 🚨 O LOG MAIS IMPORTANTE:
            console.log("📦 [FRONT-DEBUG] Dados recebidos da API:", {
                totalRecebido: res.data?.length || res.length,
                dados: res.data || res
            });

            if (!res || (Array.isArray(res) && res.length === 0)) {
                console.warn("⚠️ [FRONT-DEBUG] Atenção: A API retornou uma lista VAZIA!");
            }

            dispatch({
                type: ACTIONS.SET_PRODUCTS,
                payload: res
            });

        } catch (error) {
            console.error("❌ [FRONT-DEBUG] Erro crítico na requisição:", error);
        }
    };

    const loadCategories = async () => {
        try {
            const res = await api.get("/categories");

            console.log("CATEGORIAS API:", res.data);

            dispatch({
                type: ACTIONS.SET_CATEGORIES,
                payload: res
            });

        } catch (error) {
            console.error("ERRO AO BUSCAR CATEGORIAS:", error);
        }
    };

    const loadLocations = async () => {
        try {
            const data = await getStockLocations();
            setLocations(data || []);
        } catch (err) {
            console.error(err);
        }
    };

    // 🔥 USE EFFECT PRODUTOS
    useEffect(() => {
        loadProducts();
        loadCategories();
        loadLocations();
    }, []);


    // Derived
    const totalProducts = state.products.length;




    const lowStockProducts = state.products.filter(
        p => Number(p.quantity) < Number(p.minQuantity)
    ).length;

    const productsWithoutSupplier = state.products.filter(
        p => !p.productSuppliers || p.productSuppliers.length === 0
    ).length;

    const totalStockValue = state.products.reduce((sum, p) => {
        const bestPriceOfProduct = p.productSuppliers && p.productSuppliers.length > 0
            ? Math.min(...p.productSuppliers.map(s => Number(s.price)))
            : Number(p.unitPrice || 0);

        return sum + ((bestPriceOfProduct / (Number(p.packQuantity) || 1)) * Number(p.quantity));
    }, 0);
    const categories = state.categories || [];
    console.log("CATEGORIES:", state.categories);

    // Novo KPI: Estoque por Categoria
    const stockByCategory = categories.map(cat => {
        const productsInCat = state.products.filter(p => p.categoryId === cat.id);
        const totalValue = productsInCat.reduce((sum, p) => {
            const bestPriceOfProduct = p.productSuppliers && p.productSuppliers.length > 0
                ? Math.min(...p.productSuppliers.map(s => Number(s.price)))
                : Number(p.unitPrice || 0);
    
            return sum + ((bestPriceOfProduct / (Number(p.packQuantity) || 1)) * Number(p.quantity));
        }, 0);
        return { name: cat.name, value: totalValue, count: productsInCat.length };
    }).filter(cat => cat.count > 0).sort((a, b) => b.value - a.value);

    const availableSuppliers = state.suppliers.filter((supplier) => {

        return !productSuppliers.some(
            (ps) => ps.id === supplier.id || ps.supplierId === supplier.id
        );

    });



    const filtered = state.products.filter((p) => {

        const matchSearch =
            p.name?.toLowerCase().includes(search.toLowerCase()) ||
            p.category?.name?.toLowerCase().includes(search.toLowerCase());

        const matchType =
            filterType === "ALL"
                ? p.type !== "ASSET"
                : p.type === filterType;

        const matchCat =
            !filterCategory || p.categoryId === filterCategory;

        const matchStock =
            filterStock === 'all'
                ? true
                : filterStock === 'low'
                    ? Number(p.quantity) < Number(p.minQuantity)
                    : Number(p.quantity) >= Number(p.minQuantity);

        return matchSearch && matchCat && matchStock && matchType;

    });

    const validate = () => {

        const e = {};

        if (!form.name.trim()) e.name = 'Campo obrigatório';

        if (!form.categoryId) e.categoryId = 'Campo obrigatório';
        if (form.salePrice !== '' && (!Number.isFinite(Number(form.salePrice)) || Number(form.salePrice) < 0 || Number(form.salePrice) > 99999999.9999)) {
            e.salePrice = 'Informe um preço de venda válido';
        }

        if (form.type !== "PRODUCTION") {

            if (form.quantity === "" || isNaN(form.quantity) || Number(form.quantity) < 0) {
                e.quantity = 'Qtd. inválida';
            }

            if (form.minQuantity === "" || isNaN(form.minQuantity) || Number(form.minQuantity) < 0) {
                e.minQuantity = 'Qtd. mínima inválida';
            }

        }

        setErrors(e);

        return Object.keys(e).length === 0;

    };



    const handleOpenSuppliers = async (product) => {

        try {

            const result = await getProductSuppliers(product.id);

            setProductSuppliers(result || []);
            setSupplierModal(product);

        } catch (err) {

            console.error(err);

        }

    };

    const handleOpenPriceHistory = async (product) => {
        try {
            const history = await getProductPriceHistory(product.id);
            setPriceHistory(Array.isArray(history) ? history : []);
            setPriceHistoryProduct(product);
        } catch (err) {
            console.error(err);
            toast.error("Erro ao carregar histórico de preços");
        }
    };



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
            unit: p.unit,
            purchaseUnit: p.purchaseUnit || '',
            packQuantity: p.packQuantity || 1,
            unitPrice: p.unitPrice,
            salePrice: p.salePrice ?? '',
            quantity: Number(p.quantity || 0) / Number(p.packQuantity || 1),
            minQuantity: Number(p.minQuantity || 0) / Number(p.packQuantity || 1),
            supplierId: p.supplierId || '',
            type: p.type || 'INVENTORY',
            defaultLocationId: p.defaultLocationId || '',
            isActive: p.isActive !== false,
            purchaseClassification: p.purchaseClassification || 'CMV_BEVERAGES',
            restockFrequency: p.restockFrequency || 'ON_DEMAND',
            idealQuantity: Number(p.idealQuantity || 0) / Number(p.packQuantity || 1),
            trackInventory: p.trackInventory !== false,
            responsibleSector: p.responsibleSector || '',
        });
        setErrors({});
        setModalOpen(true);
    };

    const handleAddSupplier = async () => {

        if (!selectedSupplier) return;

        if (!supplierPrice || Number(supplierPrice) <= 0) {
            alert("Informe um preço válido");
            return;
        }

        try {

            await addProductSupplier(
                supplierModal.id,
                selectedSupplier,
                Number(supplierPrice),
                syncNetwork
            );

            const updated = await getProductSuppliers(
                supplierModal.id
            );

            setProductSuppliers(updated || []);
            await loadProducts();

            setSelectedSupplier("");
            setSupplierPrice("");

        } catch (err) {

            console.error(err);

        }

    };



    const handleSubmit = async () => {


        console.log("FORM COMPLETO:", form);

        if (!validate()) return;

        const payload = {
            name: form.name,
            categoryId: form.categoryId,
            unit: form.unit,
            purchaseUnit: form.purchaseUnit || '',
            packQuantity: Number(form.packQuantity || 1),
            type: form.type || 'INVENTORY',
            unitPrice: Number(form.unitPrice || 0),
            salePrice: form.salePrice === '' ? null : Number(form.salePrice),
            quantity: Number(form.quantity || 0) * Number(form.packQuantity || 1),
            minQuantity: Number(form.minQuantity || 0) * Number(form.packQuantity || 1),
            defaultLocationId: form.defaultLocationId || null,
            isActive: form.isActive !== false,
            purchaseClassification: form.purchaseClassification,
            restockFrequency: form.restockFrequency,
            idealQuantity: Number(form.idealQuantity || 0) * Number(form.packQuantity || 1),
            trackInventory: form.trackInventory !== false,
            responsibleSector: form.responsibleSector.trim() || null,
        };

        try {
            if (editTarget) {
                await api.put(`/products/${editTarget.id}`, payload);
            } else {
                await api.post('/products', payload);
            }

            await loadProducts(); // 🔥 ISSO RESOLVE

            setModalOpen(false);

        } catch (error) {

            console.error(error);

        }


    };

    const handleDelete = async () => {

        try {

            await api.delete(`/products/${deleteModal.id}`);

            await loadProducts(); // 🔥 IMPORTANTE

            setDeleteModal(null);

            toast.success("Produto removido com sucesso");

        } catch (err) {

            toast.error(err.message);

        }

    };

    const handleQtyUpdate = async () => {
        if (qtyValue === '' || isNaN(qtyValue) || Number(qtyValue) < 0) return;

        const newRealQuantity = Number(qtyValue) * (Number(qtyModal.packQuantity) || 1);

        try {
            await api.patch(`/products/${qtyModal.id}/quantity`, {
                quantity: newRealQuantity,
                locationId: qtyLocationId || null
            });

            await dispatch({
                type: ACTIONS.UPDATE_PRODUCT_QUANTITY,
                payload: { id: qtyModal.id, quantity: newRealQuantity },
            });

            toast.success("Estoque atualizado");
            setQtyModal(null);
            setQtyValue('');
        } catch (error) {
            console.error(error);
            toast.error("Erro ao atualizar estoque");
        }
    };
    const handleRemoveSupplier = async (supplierId) => {

        try {

            await removeProductSupplier(
                supplierModal.id,
                supplierId
            );

            const updated = await getProductSuppliers(
                supplierModal.id
            );

            setProductSuppliers(updated || []);
            await loadProducts();

        } catch (err) {

            console.error(err);

        }

    };

    const exportQuotationPDF = () => {
        if (filtered.length === 0) {
            toast.error("Nenhum produto filtrado para exportar.");
            return;
        }
        
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text("Lista de Cotação de Preços", 14, 22);
        
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Categoria/Filtro atual | Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);
        
        const tableColumn = ["Produto", "Unidade", "Cotação Fornecedor (Preencher)"];
        const tableRows = [];

        filtered.forEach(p => {
            if (p.isActive) {
                const productData = [
                    p.name,
                    p.purchaseUnit || p.unit,
                    "" // empty for supplier to fill
                ];
                tableRows.push(productData);
            }
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 35,
            styles: { fontSize: 10 },
            headStyles: { fillColor: [41, 128, 185] },
            columnStyles: {
                0: { cellWidth: 90 },
                1: { cellWidth: 40 },
                2: { cellWidth: 60 }
            }
        });

        doc.save(`cotacao_${new Date().getTime()}.pdf`);
        toast.success("PDF de cotação gerado com sucesso!");
    };

    const field = (key) => ({
        value: form[key],
        onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
        error: errors[key],
    });

    return (
        <>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>Produtos</PageTitle>
                    <PageSubtitle>{state.products.length} produto(s) cadastrado(s)</PageSubtitle>
                </TitleBlock>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <Button variant="secondary" onClick={exportQuotationPDF}>
                        <MdPictureAsPdf /> Exportar Cotação
                    </Button>
                    <Button onClick={openAdd}>
                        <MdAdd /> Novo Produto
                    </Button>
                </div>
            </PageHeader>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "16px",
                    marginBottom: "24px"
                }}
            >

                <Card>
                    <div style={{ fontSize: 12, color: "#64748B" }}>
                        Produtos cadastrados
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 600 }}>
                        {totalProducts}
                    </div>
                </Card>

                <Card>
                    <div style={{ fontSize: 12, color: "#64748B" }}>
                        Estoque baixo
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 600 }}>
                        {lowStockProducts}
                    </div>
                </Card>

                <Card>
                    <div style={{ fontSize: 12, color: "#64748B" }}>
                        Sem fornecedor
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 600 }}>
                        {productsWithoutSupplier}
                    </div>
                </Card>

                <Card>
                    <div style={{ fontSize: 12, color: "#64748B" }}>
                        Valor do estoque
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 600 }}>
                        {formatCurrency(totalStockValue)}
                    </div>
                </Card>

            </div>

            <div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: "16px", marginBottom: "12px", color: "#334155" }}>Valor de Estoque por Categoria</h3>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                        gap: "16px",
                    }}
                >
                    {stockByCategory.map(cat => (
                        <Card key={cat.name} padding="16px">
                            <div style={{ fontSize: 12, color: "#64748B" }}>{cat.name} ({cat.count} itens)</div>
                            <div style={{ fontSize: 18, fontWeight: 600, color: "#1e293b", marginTop: 4 }}>
                                {formatCurrency(cat.value)}
                            </div>
                        </Card>
                    ))}
                    {stockByCategory.length === 0 && (
                        <div style={{ color: "#64748B", fontSize: "14px" }}>Nenhum estoque categorizado.</div>
                    )}
                </div>
            </div>
            {/* Filters */}


            {/* FILTRO POR TIPO */}

            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>

                <Button
                    variant={filterType === "ALL" ? "primary" : "secondary"}
                    onClick={() => setFilterType("ALL")}
                >
                    Todos
                </Button>

                <Button
                    variant={filterType === "INVENTORY" ? "primary" : "secondary"}
                    onClick={() => setFilterType("INVENTORY")}
                >
                    Insumos
                </Button>

                <Button
                    variant={filterType === "PRODUCTION" ? "primary" : "secondary"}
                    onClick={() => setFilterType("PRODUCTION")}
                >
                    Produção
                </Button>



            </div>

            {/* Filters */}
            <SearchRow>
                <SearchBox>
                    <MdSearch />
                    <SearchInput
                        placeholder="Buscar por nome ou categoria..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </SearchBox>
                <Select 
                    value={filterCategory} 
                    onChange={setFilterCategory}
                    options={[
                        { value: "", label: "Todas as categorias" },
                        ...categories.map((c) => ({ value: c.id, label: c.name }))
                    ]}
                />

                <Select 
                    value={filterStock} 
                    onChange={setFilterStock}
                    options={[
                        { value: "all", label: "Todos os estoques" },
                        { value: "low", label: "Abaixo do mínimo" },
                        { value: "ok", label: "Estoque adequado" }
                    ]}
                />
            </SearchRow>

            {/* Table */}
            <Card padding="0">
                {filtered.length === 0 ? (
                    <EmptyState
                        title="Nenhum produto encontrado"
                        subtitle="Adicione produtos ou ajuste os filtros acima."
                    />
                ) : (
                    <TableOverflow>
                        <Table>
                            <thead>
                                <tr>
                                    <Th>Nome</Th>
                                    <Th>Categoria</Th>
                                    <Th>Estoque</Th>
                                    <Th>Fornecedor</Th>
                                    <Th>Custo Un.</Th>
                                    <Th>Valor Total</Th>
                                    <Th>Ações</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((p) => {
                                    const isLow = Number(p.quantity) < Number(p.minQuantity);
                                    const bestPrice =
                                        p.productSuppliers && p.productSuppliers.length > 0
                                            ? Math.min(...p.productSuppliers.map(s => Number(s.price)))
                                            : 0;

                                    return (
                                        <Tr key={p.id} lowStock={isLow}>
                                            <Td data-label="Nome">
                                                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ textDecoration: p.isActive === false ? 'line-through' : 'none', color: p.isActive === false ? '#94a3b8' : 'inherit' }}>
                                                        {p.name}
                                                    </span>
                                                    {p.isActive === false && <Badge variant="danger" style={{ padding: '2px 4px', fontSize: '10px' }}>INATIVO</Badge>}
                                                </div>
                                                <DateMeta>
                                                    Cadastrado em {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                                                </DateMeta>
                                            </Td>
                                            <Td data-label="Categoria">{p.category?.name || '-'}</Td>
                                            <Td data-label="Estoque" style={{ color: isLow ? '#dc2626' : 'inherit' }}>
                                                <div style={{ fontWeight: isLow ? 700 : 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    {p.quantity} {p.unit} 
                                                    <span style={{ fontSize: '11px', color: isLow ? '#ef4444' : '#64748b', fontWeight: 400 }}>
                                                        ({(Number(p.quantity) / (Number(p.packQuantity) || 1)).toFixed(2)} {p.purchaseUnit || 'un'})
                                                    </span>
                                                    {isLow && <Badge variant="danger" style={{ padding: '2px 4px', fontSize: '10px' }}>BAIXO</Badge>}
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                                    Mínimo: {p.minQuantity} {p.unit}
                                                </div>
                                                
                                                {/* 🔥 Breakdown de estoque por local */}
                                                {p.productStocks && p.productStocks.length > 0 && (
                                                    <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(0,0,0,0.02)', padding: '4px', borderRadius: '4px' }}>
                                                        {p.productStocks.filter(ps => ps.quantity > 0).map(ps => (
                                                            <div key={ps.id} style={{ fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                                                                <span>{ps.location?.name || 'Desconhecido'}:</span>
                                                                <span style={{ fontWeight: 600 }}>{ps.quantity} {p.unit}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </Td>
                                            <Td data-label="Fornecedor">
                                                {p.suppliers?.length ? (
                                                    <div style={{ fontSize: '12px', fontWeight: 500 }}>
                                                        {p.suppliers[0]?.name}
                                                        {p.suppliers.length > 1 && (
                                                            <span style={{ fontSize: '11px', color: '#64748B', marginLeft: '4px' }}>
                                                                (+{p.suppliers.length - 1})
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <Badge variant="warning" style={{ fontSize: '10px', padding: '2px 4px' }}>
                                                        Sem fornec
                                                    </Badge>
                                                )}
                                            </Td>
                                            <Td data-label="Custo Un.">
                                                {bestPrice || p.unitPrice ? formatCurrency(bestPrice || Number(p.unitPrice)) : "-"}
                                            </Td>
                                            <Td data-label="Valor Total" style={{ fontWeight: 600 }}>
                                                {formatCurrency(
                                                    ((bestPrice || Number(p.unitPrice) || 0) / (Number(p.packQuantity) || 1)) * Number(p.quantity)
                                                )}
                                            </Td>
                                            <Td data-label="Ações">
                                                <ActionRow>
                                                    <IconBtn
                                                        title="Ficha Técnica"
                                                        onClick={() => setRecipeModal(p)}
                                                    >
                                                        <MdMenuBook />
                                                    </IconBtn>

                                                    <IconBtn
                                                        title="Fornecedores"
                                                        onClick={() => handleOpenSuppliers(p)}
                                                    >
                                                        <MdStore />
                                                    </IconBtn>
                                                    <IconBtn
                                                        title="Histórico de preços"
                                                        onClick={() => handleOpenPriceHistory(p)}
                                                    >
                                                        <MdTimeline />
                                                    </IconBtn>
                                                    <IconBtn
                                                        title="Editar quantidade"
                                                        color="warning"
                                                        onClick={() => { 
                                                            setQtyModal(p); 
                                                            const locId = p.defaultLocationId || (locations.find(l => l.isDefault)?.id) || (locations[0]?.id) || '';
                                                            setQtyLocationId(locId);
                                                            const stock = p.productStocks?.find(s => s.locationId === locId);
                                                            const currentQty = stock ? Number(stock.quantity) : 0;
                                                            setQtyValue(String(currentQty / (Number(p.packQuantity) || 1)));
                                                        }}
                                                    >
                                                        <MdQty />
                                                    </IconBtn>
                                                    <IconBtn title="Editar produto" onClick={() => openEdit(p)}>
                                                        <MdEdit />
                                                    </IconBtn>
                                                    <IconBtn color="danger" title="Deletar produto" onClick={() => setDeleteModal(p)}>
                                                        <MdDelete />
                                                    </IconBtn>
                                                </ActionRow>
                                            </Td>
                                        </Tr>
                                    );
                                })}
                            </tbody>
                        </Table>
                    </TableOverflow>
                )}
            </Card>

            {/* Add/Edit Modal */}
            <Modal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editTarget ? 'Editar Produto' : 'Novo Produto'}
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => setModalOpen(false)}
                        >
                            Cancelar
                        </Button>

                        <Button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSubmit();
                            }}
                        >
                            {editTarget ? 'Salvar' : 'Criar Produto'}
                        </Button>
                    </>
                }
            >
                <FormGrid>

                    <FormFull>
                        <CurrencyInput
                            label="Preço de venda padrão (opcional)"
                            placeholder="R$ 0,00"
                            value={form.salePrice == null ? '' : String(form.salePrice)}
                            onChange={(value) => setForm(prev => ({ ...prev, salePrice: value }))}
                            error={errors.salePrice}
                        />
                        <small>Valor por unidade lançada na venda manual. Alterações no lançamento valem apenas para aquela venda. Deixe vazio para remover o padrão.</small>
                    </FormFull>
                    <FormFull>
                        <Input
                            label="Nome do Produto *"
                            placeholder="Ex: Farinha de Trigo"
                            {...field('name')}
                        />
                    </FormFull>


                    {/* TIPO DE PRODUTO */}
                        <Select
                            label="Tipo de Produto"
                            value={form.type || 'INVENTORY'}
                            onChange={(val) => setForm(f => ({ ...f, type: val }))}
                            options={[
                                { value: 'INVENTORY', label: 'Insumo / Matéria-prima' },
                                { value: 'PRODUCTION', label: 'Produção Própria' }
                            ]}
                        />

                    <Select 
                        label="Categoria *" 
                        value={form.categoryId}
                        onChange={(val) => setForm((f) => ({ ...f, categoryId: val }))}
                        options={[
                            { value: "", label: "-- Selecione uma categoria --" },
                            ...categories.map((c) => ({ value: c.id, label: c.name }))
                        ]}
                    />

                    <Select
                        label="Classificação da Compra"
                        value={form.purchaseClassification}
                        onChange={(val) => setForm((f) => ({ ...f, purchaseClassification: val }))}
                        options={[
                            { value: 'CMV_BEVERAGES', label: 'CMV — Bebidas e insumos' },
                            { value: 'CLEANING', label: 'Material de limpeza' },
                            { value: 'DISPOSABLES', label: 'Descartáveis' },
                            { value: 'OPERATING', label: 'Outros custos operacionais' },
                            { value: 'EXCLUDED', label: 'Não contabilizar no CMV' }
                        ]}
                    />

                    <Select
                        label="Frequência de Reposição"
                        value={form.restockFrequency}
                        onChange={(val) => setForm((f) => ({ ...f, restockFrequency: val }))}
                        options={[
                            { value: 'WEEKLY', label: 'Semanal' },
                            { value: 'BIWEEKLY', label: 'Quinzenal' },
                            { value: 'MONTHLY', label: 'Mensal' },
                            { value: 'ON_DEMAND', label: 'Sob demanda' }
                        ]}
                    />

                    <FormFull>
                        <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                            gap: '16px',
                            padding: '16px',
                            background: 'rgba(0,0,0,0.02)',
                            borderRadius: '8px',
                            border: '1px dashed #cbd5e1'
                        }}>
                            <Select 
                                label="Unidade Base (Consumo/Ficha) *" 
                                value={form.unit}
                                onChange={(val) => setForm((f) => ({ ...f, unit: val }))}
                                options={UNITS.map((u) => ({ value: u, label: u }))}
                            />

                            <Input
                                label="Unidade de Compra"
                                placeholder="Ex: Garrafa, Caixa, Unidade"
                                {...field('purchaseUnit')}
                            />

                            {form.type !== 'PRODUCTION' && (
  <div>
    <Input
      label="Quantidade na Embalagem"
      type="number"
      min="0"
      step="any"
      placeholder="Ex: 750"
      {...field('packQuantity')}
    />
    <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
      Quantos ml/g/un vêm dentro da unidade de compra?
    </span>
  </div>
)}
</div>
                    </FormFull>

                    {form.type !== 'PRODUCTION' && (
                        <>
                            <Input
                                label="Qtd. em Estoque"
                                type="number"
                                min="0"
                                placeholder="0"
                                {...field('quantity')}
                            />

                            <Input
                                label="Qtd. Mínima"
                                type="number"
                                min="0"
                                placeholder="0"
                                {...field('minQuantity')}
                            />

                            <Input
                                label="Qtd. Ideal"
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                                {...field('idealQuantity')}
                            />

                            <Input
                                label="Setor Responsável"
                                placeholder="Ex: Limpeza, Bar, Operação"
                                {...field('responsibleSector')}
                            />

                            <FormFull>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <CheckboxControl
                                        checked={form.trackInventory}
                                        onChange={(e) => setForm((f) => ({ ...f, trackInventory: e.target.checked }))}
                                    />
                                    <span>Controlar quantidade deste produto em estoque</span>
                                </label>
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                                    Desmarque apenas para despesas diretas que não precisam de saldo físico.
                                </span>
                            </FormFull>

                            <FormFull>
                                <Select 
                                    label="Fornecedor Vinculado" 
                                    value={form.supplierId}
                                    onChange={(val) => setForm((f) => ({ ...f, supplierId: val }))}
                                    options={[
                                        { value: "", label: "-- Selecione um fornecedor --" },
                                        ...state.suppliers.map((s) => ({ value: s.id, label: s.name }))
                                    ]}
                                />
                            </FormFull>
                        </>
                    )}

                    <FormFull>
                        <Select 
                            label="Local Padrão de Baixa (Opcional)" 
                            value={form.defaultLocationId}
                            onChange={(val) => setForm((f) => ({ ...f, defaultLocationId: val }))}
                            options={[
                                { value: "", label: "-- Automático (Principal/Estoque Fechado) --" },
                                ...locations.map((loc) => ({ value: loc.id, label: loc.name }))
                            ]}
                        />
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                          Ao vender ou produzir, o estoque será descontado automaticamente deste local (ou sobrescrito pelo local da venda).
                        </span>
                    </FormFull>

                    {editTarget && (
                        <FormFull>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px' }}>
                                <CheckboxControl
                                    checked={form.isActive} 
                                    onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} 
                                    style={{ width: '16px', height: '16px', accentColor: form.isActive ? '#10b981' : '#ef4444' }}
                                />
                                <span style={{ fontSize: '14px', fontWeight: '500', color: form.isActive ? '#10b981' : '#ef4444' }}>
                                    {form.isActive ? 'Produto Ativo' : 'Produto Inativo'}
                                </span>
                            </label>
                            <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                                Desmarque para inativar o produto. Ele não aparecerá mais em listas de compras e produções.
                            </span>
                        </FormFull>
                    )}

                </FormGrid>
            </Modal>

            {/* Update Quantity Modal */}
            <Modal
                isOpen={!!qtyModal}
                onClose={() => setQtyModal(null)}
                title={`Atualizar Quantidade — ${qtyModal?.name}`}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setQtyModal(null)}>Cancelar</Button>
                        <Button onClick={handleQtyUpdate}>Atualizar</Button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <Select 
                        label="Local de Estoque (De onde o saldo será ajustado?)" 
                        value={qtyLocationId}
                        onChange={(val) => {
                            setQtyLocationId(val);
                            const stock = qtyModal?.productStocks?.find(s => s.locationId === val);
                            const currentQty = stock ? Number(stock.quantity) : 0;
                            setQtyValue(String(currentQty / (Number(qtyModal?.packQuantity) || 1)));
                        }}
                        options={locations.map((loc) => {
                            const stock = qtyModal?.productStocks?.find(s => s.locationId === loc.id);
                            const currentQty = stock ? Number(stock.quantity) : 0;
                            const pack = Number(qtyModal?.packQuantity) || 1;
                            const inUnits = currentQty / pack;
                            return { 
                                value: loc.id, 
                                label: `${loc.name} (Atual: ${inUnits.toFixed(2)} ${qtyModal?.purchaseUnit || 'un'})` 
                            };
                        })}
                    />

                    <Input
                        label={`Nova Quantidade (${qtyModal?.purchaseUnit || qtyModal?.unit})`}
                        type="number"
                        min="0"
                        step="any"
                        value={qtyValue}
                        onChange={(e) => setQtyValue(e.target.value)}
                        placeholder="Digite a nova quantidade"
                    />
                </div>
            </Modal>

            {/* Delete Confirm Modal */}
            <Modal
                isOpen={!!deleteModal}
                onClose={() => setDeleteModal(null)}
                title="Confirmar Exclusão"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteModal(null)}>Cancelar</Button>
                        <Button variant="danger" onClick={handleDelete}>Deletar</Button>
                    </>
                }
            >
                <p style={{ color: '#4B5563', lineHeight: 1.7 }}>
                    Tem certeza que deseja deletar o produto <strong style={{ color: '#111827' }}>{deleteModal?.name}</strong>?
                    Essa ação não pode ser desfeita.
                </p>
            </Modal>
            {/* Suppliers Modal */}

            <Modal
                isOpen={!!supplierModal}
                onClose={() => setSupplierModal(null)}
                title={`Fornecedores — ${supplierModal?.name}`}
                footer={
                    <Button onClick={() => setSupplierModal(null)}>
                        Fechar
                    </Button>
                }
            >

                {productSuppliers.length === 0 ?

                    <p>Nenhum fornecedor vinculado</p>

                    :

                    <ul style={{ listStyle: "none", padding: 0 }}>

                        {productSuppliers.map((s) => (

                            <li
                                key={s.id}
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: 10
                                }}
                            >

                                <span style={{ fontWeight: 500 }}>
                                    {s.name} — {formatCurrency(s.price)}
                                </span>

                                <Button
                                    variant="danger"
                                    onClick={() => handleRemoveSupplier(s.id)}
                                >
                                    Remover
                                </Button>

                            </li>

                        ))}
                    </ul>
                }

                <hr style={{ margin: "20px 0" }} />

                <Select
                    label="Adicionar fornecedor"
                    value={selectedSupplier}
                    onChange={(val) => setSelectedSupplier(val)}
                    options={[
                        { value: "", label: "Selecionar fornecedor" },
                        ...availableSuppliers.map((s) => ({ value: s.id, label: s.name }))
                    ]}
                />

                <Input
                    label="Preço do fornecedor"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={supplierPrice}
                    onChange={(e) => setSupplierPrice(e.target.value)}
                />

                <div style={{ marginTop: 15, display: "flex", alignItems: "center", gap: 8 }}>
                    <CheckboxControl
                        checked={syncNetwork}
                        onChange={(e) => setSyncNetwork(e.target.checked)}
                        style={{ cursor: "pointer", width: 16, height: 16, accentColor: '#10b981' }}
                    />
                    <label style={{ fontSize: 14, color: "#4B5563", cursor: "pointer" }} onClick={() => setSyncNetwork(!syncNetwork)}>
                        Sincronizar preço em toda a rede (outras lojas)
                    </label>
                </div>

                <Button
                    style={{ marginTop: 15 }}
                    onClick={handleAddSupplier}
                    disabled={!selectedSupplier || !supplierPrice}
                >

                    Adicionar fornecedor

                </Button>

            </Modal>
            <Modal
                isOpen={!!priceHistoryProduct}
                onClose={() => setPriceHistoryProduct(null)}
                title={`Histórico de preços — ${priceHistoryProduct?.name || ''}`}
                footer={<Button onClick={() => setPriceHistoryProduct(null)}>Fechar</Button>}
            >
                {!priceHistory.length ? (
                    <EmptyState title="Sem histórico de compras" />
                ) : (
                    <TableOverflow>
                        <Table>
                            <thead>
                                <tr>
                                    <Th>Data</Th>
                                    <Th>Fornecedor</Th>
                                    <Th>Preço</Th>
                                    <Th>Preço anterior</Th>
                                    <Th>Variação</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {priceHistory.map((entry) => {
                                    const variation = entry.percentageVariation;
                                    const variationColor = variation > 0
                                        ? '#dc2626'
                                        : variation < 0
                                            ? '#16a34a'
                                            : '#64748B';

                                    return (
                                        <Tr key={entry.id}>
                                            <Td data-label="Data">
                                                {new Date(entry.createdAt).toLocaleDateString('pt-BR')}
                                            </Td>
                                            <Td data-label="Fornecedor">{entry.supplierName || '-'}</Td>
                                            <Td data-label="Preço">{formatCurrency(Number(entry.price))}</Td>
                                            <Td data-label="Preço anterior">
                                                {entry.previousPrice === null
                                                    ? '-'
                                                    : formatCurrency(Number(entry.previousPrice))}
                                            </Td>
                                            <Td data-label="Variação" style={{ color: variationColor, fontWeight: 700 }}>
                                                {variation === null
                                                    ? '-'
                                                    : `${variation > 0 ? '+' : ''}${Number(variation).toFixed(2)}%`}
                                            </Td>
                                        </Tr>
                                    );
                                })}
                            </tbody>
                        </Table>
                    </TableOverflow>
                )}
            </Modal>
            <RecipeModal
                product={recipeModal}
                isOpen={!!recipeModal}
                onClose={() => setRecipeModal(null)}
                products={state.products || []}
            />
        </>
    );
};

export default Products;
