import DSButton from '../components/Button';
import { InputControl } from '../components/FormFields';
import DataTable from '../components/Table';
import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { getStockLocations, createStockLocation, updateStockLocation, deleteStockLocation, internalTransfer } from "../services/stockLocationService";
import { FaTrash, FaEdit, FaPlus, FaCheckCircle } from "react-hot-toast"
import toast from "react-hot-toast";
import Modal from "../components/Modal";
import Select from "../components/Select";
import Button from "../components/Button";
import api from "../services/api";
import { useApp } from "../context/AppContext";
import { formatCurrency } from "../utils/formatCurrency";

const Container = styled.div`
  padding: 30px;
  animation: fadeIn 0.4s ease-in-out;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;

  h1 {
    font-size: 24px;
    color: var(--color-text);
  }
`;



const Table = styled(DataTable)`
  width: 100%;
  border-collapse: collapse;
  background: var(--color-surface);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0,0,0,0.05);

  th, td {
    padding: 15px 20px;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
  }

  th {
    background: var(--color-primary-surface);
    font-weight: 600;
    color: var(--color-text-muted);
  }

  tr:last-child td {
    border-bottom: none;
  }
`;

const ActionBtn = ({ danger, ...props }) => (
  <DSButton size="sm" variant={danger ? 'danger' : 'text'} {...props} />
);

const Badge = styled.span`
  background: var(--color-primary);
  color: white;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
`;

const Input = styled(InputControl)`
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  width: 100%;
`;

export default function StockLocations() {
  const { state } = useApp();
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [isEditing, setIsEditing] = useState(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  // Transfer state
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferForm, setTransferForm] = useState({ productId: "", fromLocationId: "", toLocationId: "", quantity: "", unitType: "purchase" });

  useEffect(() => {
    fetchLocations();
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const data = await api.get("/products");
      setProducts(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLocations = async () => {
    try {
      const data = await getStockLocations();
      setLocations(data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await createStockLocation({ name: newName });
      toast.success("Local criado com sucesso!");
      setNewName("");
      setShowAdd(false);
      fetchLocations();
    } catch (error) {
      console.error(error);
    }
  };

  const handleUpdate = async (id) => {
    if (!editName.trim()) return;
    try {
      await updateStockLocation(id, { name: editName });
      toast.success("Local atualizado!");
      setIsEditing(null);
      fetchLocations();
    } catch (error) {
      console.error(error);
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await updateStockLocation(id, { isDefault: true });
      toast.success("Local padrão atualizado!");
      fetchLocations();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Deseja realmente excluir este local?")) return;
    try {
      await deleteStockLocation(id);
      toast.success("Local excluído com sucesso!");
      fetchLocations();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.error || "Erro ao excluir local");
    }
  };

  const handleTransfer = async () => {
    try {
      const selectedProduct = state.products.find(p => p.id === transferForm.productId);
      const pack = Number(selectedProduct?.packQuantity || 1);
      
      let moveQty;
      if (transferForm.unitType === "base") {
         moveQty = Number(transferForm.quantity);
      } else {
         moveQty = Number(transferForm.quantity) * pack;
      }

      await internalTransfer({ ...transferForm, quantity: moveQty });
      toast.success("Transferência realizada com sucesso!");
      setShowTransfer(false);
      setTransferForm({ productId: "", fromLocationId: "", toLocationId: "", quantity: "", unitType: "purchase" });
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.error || "Erro ao transferir");
    }
  };

  const locationsWithValues = locations.map(loc => {
    let totalValue = 0;
    state.products.forEach(p => {
      const stock = p.productStocks?.find(s => s.locationId === loc.id);
      if (stock) {
        const qty = Number(stock.quantity);
        if (qty > 0) {
          const bestPriceOfProduct = p.productSuppliers && p.productSuppliers.length > 0
            ? Math.min(...p.productSuppliers.map(s => Number(s.price)))
            : Number(p.unitPrice || 0);
          totalValue += (bestPriceOfProduct / (Number(p.packQuantity) || 1)) * qty;
        }
      }
    });
    return { ...loc, totalValue };
  });

  return (
    <Container>
      <Header>
        <div>
          <h1>Locais de Estoque</h1>
          <p style={{ color: "var(--color-text-muted)", marginTop: "5px" }}>Gerencie os sub-estoques do seu estabelecimento (ex: Bar 1, Cozinha, etc).</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button onClick={() => setShowTransfer(true)} style={{ background: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
            Transferência Interna
          </Button>
          <Button onClick={() => setShowAdd(!showAdd)}>
            + Novo Local
          </Button>
        </div>
      </Header>

      {showAdd && (
        <div style={{ marginBottom: "20px", display: "flex", gap: "10px", alignItems: "center" }}>
          <Input 
            autoFocus
            placeholder="Nome do novo local..." 
            value={newName} 
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <Button onClick={handleAdd}>Salvar</Button>
          <Button onClick={() => setShowAdd(false)} style={{ background: "var(--color-surface)", color: "var(--color-text)" }}>Cancelar</Button>
        </div>
      )}

      <Table>
        <thead>
          <tr>
            <th>Nome do Local</th>
            <th>Valor em Estoque</th>
            <th>Status</th>
            <th style={{ width: "150px" }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {locationsWithValues.map(loc => (
            <tr key={loc.id}>
              <td>
                {isEditing === loc.id ? (
                  <Input 
                    autoFocus
                    value={editName} 
                    onChange={e => setEditName(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && handleUpdate(loc.id)}
                  />
                ) : (
                  <strong>{loc.name}</strong>
                )}
              </td>
              <td>
                <strong style={{ color: "var(--color-primary)" }}>
                  {formatCurrency(loc.totalValue || 0)}
                </strong>
              </td>
              <td>
                {loc.isDefault ? <Badge>Local Padrão</Badge> : (
                  <ActionBtn style={{ fontSize: '13px' }} onClick={() => handleSetDefault(loc.id)}>Definir como Padrão</ActionBtn>
                )}
              </td>
              <td>
                {isEditing === loc.id ? (
                  <>
                    <ActionBtn onClick={() => handleUpdate(loc.id)}>Salvar</ActionBtn>
                    <ActionBtn danger onClick={() => setIsEditing(null)}>Cancelar</ActionBtn>
                  </>
                ) : (
                  <>
                    <ActionBtn onClick={() => { setIsEditing(loc.id); setEditName(loc.name); }}>Editar</ActionBtn>
                    <ActionBtn danger onClick={() => handleDelete(loc.id)}>Excluir</ActionBtn>
                  </>
                )}
              </td>
            </tr>
          ))}
          {locationsWithValues.length === 0 && !showAdd && (
            <tr>
              <td colSpan="4" style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
                Nenhum local cadastrado.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      {/* Transfer Modal */}
      <Modal 
        isOpen={showTransfer} 
        onClose={() => setShowTransfer(false)}
        title="Transferência Interna de Estoque"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowTransfer(false)}>Cancelar</Button>
            <Button onClick={handleTransfer} disabled={!transferForm.productId || !transferForm.fromLocationId || !transferForm.toLocationId || !transferForm.quantity}>Transferir</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Select 
            label="Produto" 
            value={transferForm.productId}
            onChange={(val) => setTransferForm({ ...transferForm, productId: val })}
            options={[
              { value: "", label: "-- Selecione um produto --" },
              ...products.map(p => ({ value: p.id, label: p.name }))
            ]}
          />
          <Select 
            label="Origem (De)" 
            value={transferForm.fromLocationId}
            onChange={(val) => setTransferForm({ ...transferForm, fromLocationId: val })}
            options={[
              { value: "", label: "-- Selecione o local de origem --" },
              ...locations.map(l => ({ value: l.id, label: l.name }))
            ]}
          />
          <Select 
            label="Destino (Para)" 
            value={transferForm.toLocationId}
            onChange={(val) => setTransferForm({ ...transferForm, toLocationId: val })}
            options={[
              { value: "", label: "-- Selecione o local de destino --" },
              ...locations.map(l => ({ value: l.id, label: l.name }))
            ]}
          />
          
          {transferForm.productId && transferForm.fromLocationId && (() => {
            const prod = state.products?.find(p => p.id === transferForm.productId);
            if (!prod) return null;
            const prodStock = prod.productStocks?.find(s => s.locationId === transferForm.fromLocationId);
            const stockQty = Number(prodStock?.quantity || 0);
            const pack = Number(prod?.packQuantity || 1);
            const pUnit = prod.purchaseUnit || 'un';
            const bUnit = prod.unit || 'ml';
            const inUnits = (stockQty / pack).toFixed(2);
            
            return (
              <div style={{ padding: '10px', background: 'var(--color-primary-surface)', borderRadius: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Saldo neste local: <strong style={{ color: 'var(--color-primary)' }}>{inUnits} {pUnit}</strong> ({stockQty.toFixed(2)} {bUnit})</span>
                  <DSButton
                    type="button" 
                    onClick={() => setTransferForm({ ...transferForm, quantity: stockQty, unitType: 'base' })}
                    style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}
                  >
                    Mover tudo
                  </DSButton>
                </div>
              </div>
            );
          })()}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Quantidade a transferir:</span>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <Input 
                type="number" 
                min="0.0001" 
                step="any"
                value={transferForm.quantity}
                onChange={e => setTransferForm({ ...transferForm, quantity: e.target.value })}
                placeholder="Ex: 5"
                style={{ flex: 1 }}
              />
              <Select 
                value={transferForm.unitType}
                onChange={val => setTransferForm({ ...transferForm, unitType: val })}
                options={[
                  { value: 'purchase', label: (() => {
                    const p = state.products?.find(p => p.id === transferForm.productId);
                    return p?.purchaseUnit || 'un';
                  })() },
                  { value: 'base', label: (() => {
                    const p = state.products?.find(p => p.id === transferForm.productId);
                    return p?.unit || 'ml';
                  })() }
                ]}
                style={{ width: '120px' }}
              />
            </div>

            {transferForm.productId && transferForm.quantity !== "" && (() => {
               const p = state.products?.find(p => p.id === transferForm.productId);
               if(!p) return null;
               const pack = Number(p.packQuantity || 1);
               const bUnit = p.unit || 'ml';
               const pUnit = p.purchaseUnit || 'un';
               
               let totalBase = 0;
               let totalPurchase = 0;
               
               if (transferForm.unitType === 'base') {
                 totalBase = Number(transferForm.quantity);
                 totalPurchase = totalBase / pack;
               } else {
                 totalBase = Number(transferForm.quantity) * pack;
                 totalPurchase = Number(transferForm.quantity);
               }

               return (
                 <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                   Equivale a: <strong>{totalPurchase.toFixed(2)} {pUnit}</strong> ({totalBase.toFixed(2)} {bUnit})
                 </span>
               );
            })()}
          </div>
        </div>
      </Modal>

    </Container>
  );
}
