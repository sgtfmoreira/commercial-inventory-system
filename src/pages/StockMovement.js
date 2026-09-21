import React, { useState } from "react";
import styled from "styled-components";
import { useApp } from "../context/AppContext";
import Card from "../components/Card";
import Button from "../components/Button";
import api from "../services/api";
import toast from "react-hot-toast";
import { Input } from "../components/FormFields";
import Select from "../components/Select";
import SupplierReturnForm from "../components/SupplierReturnForm";
import { MdAddCircle, MdRemoveCircle, MdUploadFile, MdShoppingCart, MdLocalBar } from "react-icons/md";

const SearchInput = styled.input`
  width: 100%;
  padding: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  margin-bottom: 20px;
  font-size: 14px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 20px;

  th, td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  }

  th {
    color: ${({ theme }) => theme.colors.textMuted};
    font-size: 12px;
    text-transform: uppercase;
  }
`;

const SmallInput = styled.input`
  width: 80px;
  padding: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  text-align: center;
`;

/* -------------------------------------------------------------------------- */
/* Styled UI                                   */
/* -------------------------------------------------------------------------- */

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
  
  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
`;

const PageTitle = styled.h1`
  font-size: ${({ theme }) => theme.fontSizes["3xl"]};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
`;

const PageSubtitle = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-top: 4px;
`;

const FormContainer = styled.div`
  max-width: ${({ $mode }) => $mode === 'MANUAL_SALE' ? '800px' : '600px'};
  width: 100%;
`;

const ButtonGroup = styled.div`
  display: flex; 
  gap: 10px; 
  margin-bottom: 24px;
  flex-wrap: wrap;

  @media (max-width: 480px) {
    button { width: 100%; }
  }
`;

const ResultBox = styled.div`
  margin-top: 16px;
  padding: 12px;
  background: ${({ theme }) => theme.colors.bgHover};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 14px;
  border: 1px dashed ${({ theme }) => theme.colors.border};
`;

/* -------------------------------------------------------------------------- */
/* Component                                   */
/* -------------------------------------------------------------------------- */

export default function StockMovement() {
    const { state, fetchAllData } = useApp();

    const [mode, setMode] = useState("BONUS");
    const [productId, setProductId] = useState("");
    const [quantity, setQuantity] = useState("");
    const [loading, setLoading] = useState(false);
    const [file, setFile] = useState(null);
    const [loadingImport, setLoadingImport] = useState(false);
    const [manualSales, setManualSales] = useState({});
    const [manualPrices, setManualPrices] = useState({});
    const [manualDiscounts, setManualDiscounts] = useState({});
    const manualRequestIdRef = React.useRef(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [locationId, setLocationId] = useState("");
    const [locations, setLocations] = useState([]);
    const [saleDate, setSaleDate] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    });

    React.useEffect(() => {
        const loadLocations = async () => {
            try {
                const data = await api.get('/stock-locations');
                setLocations(data);
            } catch (err) {
                console.error(err);
            }
        };
        loadLocations();
    }, []);

    const selectedProduct = state.products.find((p) => p.id === productId);

    const handleManualSaleSubmit = async () => {
        const items = Object.entries(manualSales)
            .filter(([_, qty]) => Number(qty) > 0)
            .map(([productId, quantity]) => ({
                productId,
                quantity: Number(quantity),
                unitSalePrice: manualPrices[productId] ?? state.products.find(p => p.id === productId)?.salePrice ?? '',
                discountTotal: manualDiscounts[productId] || 0
            }));

        if (items.length === 0) {
            toast.error("Informe pelo menos um produto com quantidade maior que zero");
            return;
        }
        if (items.some(item => item.unitSalePrice === '' || !Number.isFinite(Number(item.unitSalePrice)) || Number(item.unitSalePrice) < 0)) {
            toast.error("Informe o preço unitário de todos os produtos vendidos");
            return;
        }

        setLoading(true);
        try {
            if (!manualRequestIdRef.current) manualRequestIdRef.current = crypto.randomUUID();
            await api.post("/sales/manual", {
                items,
                locationId: locationId || undefined,
                soldAt: `${saleDate}T12:00:00-03:00`,
                externalId: manualRequestIdRef.current
            });
            toast.success("Vendas lançadas com sucesso");
            setManualSales({});
            setManualPrices({});
            setManualDiscounts({});
            manualRequestIdRef.current = null;
            setLocationId("");
            await fetchAllData();
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.message || "Erro ao lançar vendas manuais");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!productId) {
            toast.error("Selecione um produto");
            return;
        }

        if (!quantity || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
            toast.error("Informe uma quantidade válida");
            return;
        }

        const pack = selectedProduct?.type === 'PRODUCTION' ? 1 : Number(selectedProduct?.packQuantity || 1);
        const moveQty = Number(quantity) * pack;

        if (mode === "INTERNAL_USE" || mode === "OPERATIONAL_USE") {
            if (selectedProduct?.type === "INVENTORY") {
                if (moveQty > Number(selectedProduct.quantity)) {
                    toast.error("Estoque insuficiente no sistema");
                    return;
                }
            }
        }

        setLoading(true);
        try {
            if (mode === "BONUS") {
                await api.post("/stock-movements/bonus", {
                    productId: String(productId),
                    quantity: moveQty,
                    reason: "BONUS",
                    locationId: locationId || undefined
                });
            } else if (mode === "INTERNAL_USE") {
                await api.post("/stock-movements/internal-use", {
                    productId: String(productId),
                    quantity: moveQty,
                    locationId: locationId || undefined
                });
            } else if (mode === "OPERATIONAL_USE") {
                await api.post("/stock-movements/beverage-operational-use", {
                    productId: String(productId),
                    quantity: moveQty,
                    locationId: locationId || undefined
                });
            }

            toast.success("Movimentação realizada com sucesso");
            setQuantity("");
            await fetchAllData();

        } catch (error) {
            console.error(error);
            toast.error(error.message || "Erro ao movimentar estoque");
        } finally {
            setLoading(false);
        }
    };

    const handleImportCSV = async () => {
        if (!file) {
            toast.error("Selecione um arquivo .csv");
            return;
        }

        const formData = new FormData();
        formData.append("file", file);
        if (locationId) formData.append("locationId", locationId);
        formData.append("soldAt", `${saleDate}T12:00:00-03:00`);

        setLoadingImport(true);
        try {
            await api.post("/sales/import", formData, {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 120000, // 2 minutos — importações grandes podem demorar
            });
            toast.success("CSV importado com sucesso");
            setFile(null);
            await new Promise((resolve) => setTimeout(resolve, 500));
            await fetchAllData();
        } catch (error) {
            console.error(error);
            const msg = error.response?.data?.message || "Erro ao importar CSV";
            toast.error(msg);
        } finally {
            setLoadingImport(false);
        }
    };

    return (
        <FormContainer $mode={mode}>
            <PageHeader>
                <div>
                    <PageTitle>Movimentação</PageTitle>
                    <PageSubtitle>
                        {mode === "SUPPLIER_RETURN" ? "Devolução vinculada à compra original" : mode === "BONUS" ? "Entrada de bonificação" :
                            mode === "INTERNAL_USE" ? "Saída para uso interno" : 
                            mode === "OPERATIONAL_USE" ? "Saída de produtos consumidos pela equipe" :
                            mode === "MANUAL_SALE" ? "Lançamento manual múltiplo" : "Importação de vendas"}
                    </PageSubtitle>
                </div>
            </PageHeader>

            <ButtonGroup>
                <Button variant={mode === "SUPPLIER_RETURN" ? "primary" : "secondary"} onClick={() => setMode("SUPPLIER_RETURN")}>
                    <MdRemoveCircle /> Devolução ao fornecedor
                </Button>
                <Button
                    variant={mode === "BONUS" ? "primary" : "secondary"}
                    onClick={() => { setMode("BONUS"); setProductId(""); setSearchTerm(""); setLocationId(""); }}
                >
                    <MdAddCircle /> Bonificação
                </Button>

                <Button
                    variant={mode === "INTERNAL_USE" ? "primary" : "secondary"}
                    onClick={() => { setMode("INTERNAL_USE"); setProductId(""); setSearchTerm(""); setLocationId(""); }}
                >
                    <MdRemoveCircle /> Consumo Interno
                </Button>

                <Button
                    variant={mode === "OPERATIONAL_USE" ? "primary" : "secondary"}
                    onClick={() => { setMode("OPERATIONAL_USE"); setProductId(""); setSearchTerm(""); setLocationId(""); setQuantity(""); }}
                >
                    <MdLocalBar /> Consumo Operacional
                </Button>

                <Button
                    variant={mode === "CSV_IMPORT" ? "primary" : "secondary"}
                    onClick={() => { setMode("CSV_IMPORT"); setSearchTerm(""); }}
                >
                    <MdUploadFile /> Importar CSV
                </Button>

                <Button
                    variant={mode === "MANUAL_SALE" ? "primary" : "secondary"}
                    onClick={() => { setMode("MANUAL_SALE"); setSearchTerm(""); }}
                >
                    <MdShoppingCart /> Venda Manual
                </Button>
            </ButtonGroup>

            {mode === "SUPPLIER_RETURN" ? <SupplierReturnForm products={state.products || []} locations={locations} onSaved={fetchAllData} /> : mode === "MANUAL_SALE" ? (
                <Card>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <Select
                            label="Local de Origem (Opcional)"
                            value={locationId}
                            onChange={(val) => setLocationId(val)}
                            options={[
                                { value: "", label: "Usar local padrão de cada produto" },
                                ...locations.map(l => ({ value: l.id, label: l.name }))
                            ]}
                        />
                        <Input
                            label="Data das vendas"
                            type="date"
                            value={saleDate}
                            onChange={(e) => setSaleDate(e.target.value)}
                        />
                        <SearchInput 
                            placeholder="Buscar produto por nome..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ marginBottom: 0 }}
                        />
                        <div style={{ overflowX: 'auto' }}>
                            <Table>
                                <thead>
                                    <tr>
                                        <th>Produto</th>
                                        <th>Categoria</th>
                                        <th style={{ textAlign: 'center' }}>Vendas</th>
                                        <th style={{ textAlign: 'center' }}>Preço unitário</th>
                                        <th style={{ textAlign: 'center' }}>Desconto total</th>
                                        <th style={{ textAlign: 'right' }}>Valor líquido</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {state.products
                                        .filter(p => p.isActive !== false)
                                        .filter(p => !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map(p => {
                                            const category = state.categories?.find(c => c.id === p.categoryId)?.name || "Sem Categoria";
                                            return (
                                                <tr key={p.id}>
                                                    <td>{p.name}</td>
                                                    <td>{category}</td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <SmallInput 
                                                            type="number"
                                                            min="0"
                                                            inputMode="numeric"
                                                            placeholder="0"
                                                            value={manualSales[p.id] || ""}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setManualSales(prev => ({ ...prev, [p.id]: val }));
                                                            }}
                                                        />
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <SmallInput
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            inputMode="decimal"
                                                            placeholder="0,00"
                                                            value={manualPrices[p.id] ?? p.salePrice ?? ""}
                                                            onChange={(e) => setManualPrices(prev => ({ ...prev, [p.id]: e.target.value }))}
                                                        />
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <SmallInput
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            inputMode="decimal"
                                                            placeholder="0,00"
                                                            value={manualDiscounts[p.id] || ""}
                                                            onChange={(e) => setManualDiscounts(prev => ({ ...prev, [p.id]: e.target.value }))}
                                                        />
                                                    </td>
                                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                                            Math.max(
                                                                Number(manualSales[p.id] || 0) * Number(manualPrices[p.id] ?? p.salePrice ?? 0)
                                                                - Number(manualDiscounts[p.id] || 0),
                                                                0
                                                            )
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </Table>
                        </div>
                        <Button
                            fullWidth
                            onClick={handleManualSaleSubmit}
                            disabled={loading || Object.values(manualSales).filter(v => Number(v) > 0).length === 0}
                            size="lg"
                        >
                            {loading ? "Processando..." : "Lançar Vendas Manuais"}
                        </Button>
                    </div>
                </Card>
            ) : mode !== "CSV_IMPORT" ? (
                <Card>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <Select
                            label="Produto para Movimentar"
                            value={productId}
                            onChange={(val) => {
                                setProductId(val);
                                const prod = state.products?.find(p => p.id === val);
                                if (prod) {
                                    const defaultLocId = prod.defaultLocationId || (locations.find(l => l.isDefault)?.id) || '';
                                    setLocationId(defaultLocId);
                                }
                            }}
                            options={[
                                ...(state.products || [])
                                    .filter((p) => mode === "BONUS" ? p.type === "INVENTORY" : true)
                                    .filter((p) => mode !== "OPERATIONAL_USE" || (p.purchaseClassification === "CMV_BEVERAGES" && p.isActive !== false && p.trackInventory !== false))
                                    .map((p) => {
                                        const pack = Number(p.packQuantity || 1);
                                        const inUnits = (Number(p.quantity || 0) / pack).toFixed(2);
                                        return {
                                            value: p.id,
                                            label: `${p.name} (Global: ${inUnits} ${p.purchaseUnit || 'un'})`,
                                        };
                                    })
                            ]}
                        />

                        <Select
                            label="Local de Estoque (Opcional)"
                            value={locationId}
                            onChange={(val) => setLocationId(val)}
                            options={[
                                { value: "", label: "Usar local padrão de cada produto" },
                                ...locations.map(l => ({ value: l.id, label: l.name }))
                            ]}
                        />

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <Input
                                label="Quantidade"
                                type="number"
                                inputMode="decimal"
                                placeholder="0"
                                value={quantity ?? ""}
                                onChange={(e) => setQuantity(e.target.value)}
                            />
                            {selectedProduct && quantity !== "" && (
                                <span style={{ fontSize: '12px', color: '#64748B', marginLeft: '4px' }}>
                                    Total a sugerir: <strong>{(Number(quantity) * (selectedProduct.packQuantity || 1)).toFixed(0)} {selectedProduct.unit || 'ml'}</strong>
                                </span>
                            )}
                        </div>

                        {selectedProduct && quantity !== "" && (() => {
                            const pack = Number(selectedProduct.packQuantity || 1);
                            const moveAmount = Number(quantity) * pack;
                            
                            const targetLocId = locationId || selectedProduct.defaultLocationId || (locations.find(l => l.isDefault)?.id);
                            const stockObj = selectedProduct.productStocks?.find(s => s.locationId === targetLocId);
                            const prevQty = stockObj ? Number(stockObj.quantity) : 0;
                            
                            const newQty = mode === "BONUS" ? prevQty + moveAmount : prevQty - moveAmount;

                            const inUnits = (newQty / pack).toFixed(2);

                            return (
                                <ResultBox>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span>Estoque atual:</span>
                                        <strong>{(prevQty / pack).toFixed(2)} {selectedProduct.purchaseUnit}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Após movimentação:</span>
                                        <strong style={{
                                            color: newQty < 0 ? "#DC2626" : "#059669",
                                            fontSize: '16px'
                                        }}>
                                            {inUnits} {selectedProduct.purchaseUnit}
                                        </strong>
                                    </div>
                                </ResultBox>
                            );
                        })()}

                        <Button
                            fullWidth
                            onClick={handleSubmit}
                            disabled={loading || !productId}
                            size="lg"
                        >
                            {loading ? "Processando..." : "Confirmar Movimentação"}
                        </Button>
                    </div>
                </Card>
            ) : (
                <Card title="Importação de Vendas">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <Select
                            label="Local de Origem (Opcional)"
                            value={locationId}
                            onChange={(val) => setLocationId(val)}
                            options={[
                                { value: "", label: "Usar local padrão de cada produto" },
                                ...locations.map(l => ({ value: l.id, label: l.name }))
                            ]}
                        />
                        <Input
                            label="Data das vendas"
                            type="date"
                            value={saleDate}
                            onChange={(e) => setSaleDate(e.target.value)}
                        />
                        <Input
                            label="Arquivo CSV"
                            type="file"
                            accept=".csv"
                            onChange={(e) => setFile(e.target.files[0])}
                        />

                        <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                            Para calcular o CMV em porcentagem, o CSV pode conter as colunas Produto, Quantidade,
                            Preço Unitário, Desconto e Valor Líquido. Importações apenas com produto e quantidade
                            continuam aceitas, mas não geram percentual financeiro.
                        </p>

                        {file && (
                            <p style={{ fontSize: '13px', color: '#64748B' }}>
                                📄 Selecionado: <strong>{file.name}</strong>
                            </p>
                        )}

                        <Button
                            fullWidth
                            variant="primary"
                            onClick={handleImportCSV}
                            disabled={loadingImport || !file}
                            size="lg"
                        >
                            {loadingImport ? "Importando..." : "Iniciar Importação"}
                        </Button>
                    </div>
                </Card>
            )}
        </FormContainer>
    );
}
