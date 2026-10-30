import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import api from '../services/api';

// ─── Initial State ───────────────────────────────────────────────────────────
const initialState = {
    user: null,
    organization: null,
    establishment: null,
    establishments: [],

    categories: [],
    products: [],
    suppliers: [],
    purchaseOrders: [],
    stockMovements: [],
    auditLogs: [],

    loading: true,
    error: null,
    isSaving: false,
};

// ─── Action Types ────────────────────────────────────────────────────────────
export const ACTIONS = {
    // 🛡️ Adicionados para garantir sincronia
    SET_PRODUCTS: 'SET_PRODUCTS',
    SET_CATEGORIES: 'SET_CATEGORIES',

    ADD_PRODUCT: 'ADD_PRODUCT',
    UPDATE_PRODUCT: 'UPDATE_PRODUCT',
    DELETE_PRODUCT: 'DELETE_PRODUCT',
    UPDATE_PRODUCT_QUANTITY: 'UPDATE_PRODUCT_QUANTITY',
    ADD_SUPPLIER: 'ADD_SUPPLIER',
    UPDATE_SUPPLIER: 'UPDATE_SUPPLIER',
    DELETE_SUPPLIER: 'DELETE_SUPPLIER',
    ADD_PURCHASE_ORDER: 'ADD_PURCHASE_ORDER',
    UPDATE_PURCHASE_ORDER: 'UPDATE_PURCHASE_ORDER',
    COMPLETE_PURCHASE_ORDER: 'COMPLETE_PURCHASE_ORDER',
    DELETE_PURCHASE_ORDER: 'DELETE_PURCHASE_ORDER',
    SET_PURCHASE_ORDERS: 'SET_PURCHASE_ORDERS',
    SET_SAVING: 'SET_SAVING',
};

// ─── Reducer ────────────────────────────────────────────────────────────────
const appReducer = (state, action) => {
    switch (action.type) {

        case ACTIONS.SET_SAVING:
            return { ...state, isSaving: action.payload };

        case 'SET_LOADING':
            return { ...state, loading: action.payload };

        case 'SET_ERROR':
            return { ...state, error: action.payload, loading: false };

        case 'RESET_ESTABLISHMENT_DATA':
            return {
                ...state,
                categories: [],
                products: [],
                suppliers: [],
                purchaseOrders: [],
                stockMovements: [],
                auditLogs: [],
                loading: true,
                error: null,
            };

        case 'SET_ALL_DATA':
            return { ...state, ...action.payload, loading: false, error: null };

        case 'UPDATE_LOGS_MOVEMENTS':
            return { ...state, ...action.payload };

        case 'SET_CONTEXT':
            return {
                ...state,
                user: action.payload.user,
                organization: action.payload.organization,
                establishment: action.payload.establishment,
                establishments: action.payload.establishments
            };

        case ACTIONS.SET_PURCHASE_ORDERS:
            return {
                ...state,
                purchaseOrders: Array.isArray(action.payload) ? action.payload : []
            };

        // 🛡️ Produtos - Agora com proteção contra o wrapper {success, data}
        case ACTIONS.SET_PRODUCTS: {
            const productsData = action.payload?.data || (Array.isArray(action.payload) ? action.payload : []);
            return {
                ...state,
                products: [...productsData],
                loading: false
            };
        }

        // 🛡️ Categorias - Adicionado para evitar que caiam no estado de produtos
        case ACTIONS.SET_CATEGORIES: {
            const categoriesData = action.payload?.data || (Array.isArray(action.payload) ? action.payload : []);
            return {
                ...state,
                categories: [...categoriesData],
                loading: false
            };
        }

        case ACTIONS.UPDATE_PRODUCT:
        case ACTIONS.UPDATE_PRODUCT_QUANTITY:
            return {
                ...state,
                products: state.products.map((x) =>
                    x.id !== action.payload.id ? x : { ...x, ...action.payload }
                ),
            };

        // Suppliers
        case ACTIONS.ADD_SUPPLIER:
            if (!action.payload || !action.payload.id) return state;
            return {
                ...state,
                suppliers: [...state.suppliers, action.payload]
            };

        case ACTIONS.UPDATE_SUPPLIER:
            return {
                ...state,
                suppliers: state.suppliers.map((x) =>
                    x.id === action.payload.id ? action.payload : x
                ),
            };

        case ACTIONS.DELETE_SUPPLIER:
            return {
                ...state,
                suppliers: state.suppliers.filter((x) => x.id !== action.payload),
            };

        // Purchase Orders
        case ACTIONS.ADD_PURCHASE_ORDER:
            return { ...state, purchaseOrders: [...state.purchaseOrders, action.payload] };

        case ACTIONS.UPDATE_PURCHASE_ORDER:
            return {
                ...state,
                purchaseOrders: state.purchaseOrders.map((x) =>
                    x.id === action.payload.id ? action.payload : x
                ),
            };

        case ACTIONS.DELETE_PURCHASE_ORDER:
            return {
                ...state,
                purchaseOrders: state.purchaseOrders.filter((x) => x.id !== action.payload),
            };

        default:
            return state;
    }
};

// ─── Context ────────────────────────────────────────────────────────────────
const AppContext = createContext(null);

export const AppProvider = ({ children }) => {

    const [state, dispatchRaw] = useReducer(appReducer, initialState);

    // Helper para extrair dados do wrapper da API
    const getData = (res) => res?.data || (Array.isArray(res) ? res : []);

    const loadProducts = async () => {
        try {
            const res = await api.get("/products");
            dispatchRaw({
                type: ACTIONS.SET_PRODUCTS,
                payload: res
            });
        } catch (error) {
            console.error("Erro ao carregar produtos:", error);
        }
    };

    const loadCategories = async () => {
        try {
            const res = await api.get("/categories");
            dispatchRaw({
                type: ACTIONS.SET_CATEGORIES,
                payload: res
            });
        } catch (error) {
            console.error("Erro ao carregar categorias:", error);
        }
    };

    // ─── Fetch Context (Auth) ───────────────────────────────────────────────
    const fetchContext = useCallback(async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;

            const res = await api.get("/auth/context", {
                headers: { Authorization: `Bearer ${token}` }
            });

            const data = res.data || res;

            dispatchRaw({
                type: "SET_CONTEXT",
                payload: {
                    user: data.user,
                    organization: data.organization,
                    establishment: data.establishment,
                    establishments: Array.isArray(data.establishments) ? data.establishments : []
                }
            });
        } catch (err) {
            console.error("Erro ao carregar contexto:", err);
        }
    }, []);

    // ─── Side Effects ────────────────────────────────────────────────────────
    const fetchSideEffects = useCallback(async () => {
        try {
            const [movRes, logsRes] = await Promise.all([
                api.get('/stock-movements'),
                api.get('/audit-logs')
            ]);

            dispatchRaw({
                type: 'UPDATE_LOGS_MOVEMENTS',
                payload: {
                    stockMovements: getData(movRes),
                    auditLogs: getData(logsRes)
                }
            });
        } catch (e) {
            console.error("Erro ao carregar auditorias contínuas:", e);
        }
    }, []);

    // ─── Fetch All Data ─────────────────────────────────────────────────────
    const fetchAllData = useCallback(async (showLoading = true) => {
        if (showLoading) dispatchRaw({ type: 'SET_LOADING', payload: true });

        try {
            const [cRes, pRes, sRes, poRes, mRes, lRes] = await Promise.all([
                api.get('/categories'),
                api.get('/products'),
                api.get('/suppliers'),
                api.get('/purchase-orders'),
                api.get('/stock-movements'),
                api.get('/audit-logs'),
            ]);

            dispatchRaw({
                type: 'SET_ALL_DATA',
                payload: {
                    categories: getData(cRes),
                    products: getData(pRes),
                    suppliers: getData(sRes),
                    purchaseOrders: getData(poRes),
                    stockMovements: getData(mRes),
                    auditLogs: getData(lRes),
                },
            });
        } catch (err) {
            console.error("Dispatch API Error:", err);
            const message = err.response?.data?.message || err.message || "Erro inesperado";
            dispatchRaw({ type: 'SET_ERROR', payload: message });
        }
    }, []);

    const switchEstablishment = async (establishmentId) => {
        try {
            const res = await api.post("/auth/switch-establishment", { establishmentId });
            const token = res.data?.token || res.token;

            if (!token) throw new Error("Token não recebido");

            localStorage.setItem("token", token);
            api.defaults.headers.common["Authorization"] = `Bearer ${token}`;

            dispatchRaw({ type: 'RESET_ESTABLISHMENT_DATA' });
            await fetchContext();
            await fetchAllData();
        } catch (err) {
            console.error("Erro no switch:", err);
            throw err;
        }
    };

    // ─── App Init ───────────────────────────────────────────────────────────
    useEffect(() => {
        const init = async () => {
            const token = localStorage.getItem("token");
            if (!token) {
                dispatchRaw({ type: 'SET_LOADING', payload: false });
                return;
            };
            await fetchContext();
            await fetchAllData();
        };
        init();
    }, [fetchContext, fetchAllData]);

    async function reloadContext() {
        try {
            const res = await api.get("/auth/context");
            const data = res.data || res;
            dispatchRaw({
                type: "SET_CONTEXT",
                payload: {
                    user: data.user,
                    organization: data.organization,
                    establishment: data.establishment,
                    establishments: Array.isArray(data.establishments) ? data.establishments : []
                }
            });
        } catch (err) {
            console.error("Erro ao carregar contexto:", err);
            localStorage.removeItem("token");
            window.location.href = "/login";
        }
    }

    // ─── Dispatch Async ─────────────────────────────────────────────────────
    const dispatch = useCallback(async (action) => {
        dispatchRaw({ type: ACTIONS.SET_SAVING, payload: true });
        try {
            switch (action.type) {
                case ACTIONS.ADD_PRODUCT: {
                    const res = await api.post('/products', action.payload);
                    dispatchRaw({ type: ACTIONS.ADD_PRODUCT, payload: res.data || res });
                    fetchSideEffects();
                    break;
                }
                case ACTIONS.UPDATE_PRODUCT: {
                    await api.put(`/products/${action.payload.id}`, action.payload);
                    const updated = await api.get(`/products/${action.payload.id}`);
                    dispatchRaw({
                        type: ACTIONS.UPDATE_PRODUCT,
                        payload: updated.data || updated
                    });
                    fetchSideEffects();
                    break;
                }
                case ACTIONS.DELETE_PRODUCT: {
                    await api.delete(`/products/${action.payload}`);
                    dispatchRaw({ type: ACTIONS.DELETE_PRODUCT, payload: action.payload });
                    fetchSideEffects();
                    break;
                }
                default:
                    dispatchRaw(action);
            }
        } catch (err) {
            console.error("Dispatch API Error:", err);
            throw err;
        } finally {
            dispatchRaw({ type: ACTIONS.SET_SAVING, payload: false });
        }
    }, [fetchSideEffects]);

    // ─── Selectors ──────────────────────────────────────────────────────────
    const getLowStockProducts = useCallback(
        () => state.products.filter((p) => Number(p.quantity) < Number(p.minQuantity)),
        [state.products]
    );

    const getTotalInventoryValue = useCallback(
        () => state.products.reduce((s, p) => s + Number(p.unitPrice) * Number(p.quantity), 0),
        [state.products]
    );

    const getSupplierById = useCallback(
        (id) => state.suppliers.find((s) => s.id === id),
        [state.suppliers]
    );

    const getProductById = useCallback(
        (id) => state.products.find((p) => p.id === id),
        [state.products]
    );

    return (
        <AppContext.Provider
            value={{
                state,
                dispatch,
                switchEstablishment,
                reloadContext,
                getLowStockProducts,
                getTotalInventoryValue,
                getSupplierById,
                getProductById,
                loadProducts,
                loadCategories,
                fetchAllData
            }}
        >
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
    return ctx;
};
