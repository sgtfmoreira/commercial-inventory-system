import DataTable from './Table';
import React, { useEffect, useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { Input } from "./FormFields";
import Select from "./Select";
import { formatCurrency } from "../utils/formatCurrency";
import api from "../services/api";

const RecipeModal = ({ product, isOpen, onClose, products }) => {

    const [recipe, setRecipe] = useState(null);
    const [ingredients, setIngredients] = useState([]);
    const [ingredientId, setIngredientId] = useState("");
    const [quantity, setQuantity] = useState("");
    const [cost, setCost] = useState(0);
    const [unitCost, setUnitCost] = useState(0);
    const [yieldQuantity, setYieldQuantity] = useState(1);
    const [selectedIngUnit, setSelectedIngUnit] = useState('');

    useEffect(() => {

        if (!product?.id || !isOpen) return;

        loadRecipe(product.id);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product?.id, isOpen]);

    const loadRecipe = async (productId) => {

        try {

            const recipeData = await api.get(`/recipes/product/${productId}`);

            setRecipe(recipeData);
            setYieldQuantity(recipeData.yieldQuantity || 1);

            await loadCost(recipeData.id);

        } catch (err) {

            // receita ainda não existe
            if (err.message === "Receita não encontrada") {

                setRecipe(null);
                setIngredients([]);
                setCost(0);
                setUnitCost(0);
                setYieldQuantity(1);

            } else {

                console.error(err);
                alert(err.message || "Erro ao carregar ficha técnica.");

            }

        }

    };

    const loadCost = async (recipeId) => {

        try {

            const costData = await api.get(`/recipes/${recipeId}/cost`);

            setIngredients(costData.ingredients || []);
            setCost(costData.totalCost || 0);
            setUnitCost(costData.unitCost || 0);

        } catch (err) {

            console.error(err);

        }

    };

    const handleUpdateYield = async (newYield) => {
        setYieldQuantity(newYield);
        if (recipe) {
            try {
                await api.patch(`/recipes/${recipe.id}`, { yieldQuantity: Number(newYield) });
                await loadCost(recipe.id);
            } catch (err) {
                console.error(err);
            }
        }
    };

    const handleAddIngredient = async () => {
        if (!ingredientId || !quantity) return;

        try {
            // ✅ Agora a quantidade é salva sempre no valor real (ml/g/un)
            const finalQty = Number(quantity);

            let currentRecipe = recipe;
            if (!currentRecipe) {
                const newRecipe = await api.post("/recipes", {
                    productId: product.id
                });
                currentRecipe = newRecipe;
                setRecipe(newRecipe);
            } else {
                const freshRecipe = await api.get(`/recipes/product/${product.id}`);
                currentRecipe = freshRecipe;
                setRecipe(freshRecipe);
            }

            const existingIngredient = ingredients.find(
                (i) => i.productId === ingredientId
            );

            if (existingIngredient) {
                const newQuantity = Number(existingIngredient.quantity) + finalQty;

                await api.put(`/recipes/items/${existingIngredient.id}`, {
                    quantity: newQuantity
                });
            } else {
                await api.post("/recipes/items", {
                    recipeId: currentRecipe.id,
                    productId: ingredientId,
                    quantity: finalQty
                });
            }

            setIngredientId("");
            setQuantity("");
            await loadCost(currentRecipe.id);
        } catch (err) {
            console.error(err);
            alert(err.message || "Erro ao adicionar ingrediente.");
        }
    }

    const handleRemove = async (id) => {
        if (!recipe) return;
        try {
            await api.delete(`/recipes/items/${id}`);
            await loadRecipe(product.id);
        } catch (err) {
            console.error(err);
            alert(err.message || "Erro ao remover ingrediente.");
        }
    };

    const getBaseUnit = (unit) => {
        const u = unit?.toLowerCase() || "";
        if (u === 'litro') return 'ml';
        if (u === 'kg') return 'g';
        return unit;
    };

    return (

        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Ficha Técnica — ${product?.name}`}
            footer={<Button onClick={onClose}>Fechar</Button>}
        >

            <div style={{ marginBottom: 20, padding: 15, backgroundColor: 'var(--color-background)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                <h4 style={{ margin: '0 0 10px 0', color: 'var(--color-text)', fontSize: 14 }}>Configuração de Rendimento</h4>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Input
                            label={`Rendimento da Receita (em ${getBaseUnit(product?.unit)})`}
                            type="number"
                            min="0.001"
                            step="any"
                            value={yieldQuantity}
                            onChange={(e) => handleUpdateYield(e.target.value)}
                            onBlur={(e) => {
                                if(!e.target.value || Number(e.target.value) <= 0) {
                                    handleUpdateYield(1);
                                }
                            }}
                        />
                    </div>
                </div>
                <p style={{ margin: '8px 0 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    Defina quanto a receita abaixo rende. Ex: Se a receita inteira rende 1 litro, coloque 1000 se a unidade do produto for ml.
                </p>
            </div>

            <div style={{ marginBottom: 20 }}>

                <Select
                    label="Ingrediente"
                    value={ingredientId}
                    onChange={(val) => {
                        setIngredientId(val);
                        const found = products.find(p => p.id === val);
                        setSelectedIngUnit(found?.unit || "");
                    }}
                    options={[
                        { value: "", label: "Selecionar produto" },
                        ...products
                            .filter(p => p.id !== product?.id)
                            .map(p => ({ value: p.id, label: p.name }))
                    ]}
                />

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 15 }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ position: 'relative' }}>
                            <Input
                                label="Quantidade"
                                type="number"
                                min="0"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                            />
                            {ingredientId && (
                                <span style={{
                                    position: 'absolute',
                                    right: 12,
                                    bottom: 12,
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: 'var(--color-text-secondary)'
                                }}>
                                    {getBaseUnit(selectedIngUnit)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <Button
                    style={{ marginTop: 10 }}
                    onClick={handleAddIngredient}
                    disabled={!ingredientId || !quantity}
                >
                    Adicionar Ingrediente
                </Button>

            </div>

            <DataTable style={{ width: "100%" }}>
                <thead>
                    <tr>
                        <th>Ingrediente</th>
                        <th>Qtd</th>
                        <th>Un</th>
                        <th>Custo</th>
                        <th></th>
                    </tr>
                </thead>

                <tbody>

                    {ingredients.map((i) => (
                        <tr key={i.id}>
                            <td>{i.name}</td>
                            <td>{i.quantity}</td>
                            <td>{getBaseUnit(i.unit)}</td>
                            <td>{formatCurrency(i.cost)}</td>
                            <td>
                                <Button
                                    variant="danger"
                                    onClick={() => handleRemove(i.id)}
                                >
                                    Remover
                                </Button>
                            </td>
                        </tr>
                    ))}

                </tbody>

            </DataTable>

            <div
                style={{
                    marginTop: 20,
                    padding: 15,
                    backgroundColor: 'var(--color-primary-surface)',
                    borderRadius: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 500, color: '#4b5563' }}>
                    <span>Custo total da panela (receita completa):</span>
                    <span>{formatCurrency(cost)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 18, color: 'var(--color-text)' }}>
                    <span>Custo por 1 {getBaseUnit(product?.unit)}:</span>
                    <span>{formatCurrency(unitCost)}</span>
                </div>
            </div>

        </Modal>

    );

};

export default RecipeModal;
