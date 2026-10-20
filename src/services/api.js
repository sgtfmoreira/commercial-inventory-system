import axios from "axios";
import toast from "react-hot-toast";
import { getLoadingRef } from "../context/loadingRef";

const api = axios.create({
    baseURL: (process.env.REACT_APP_API_URL || "http://localhost:3333") + "/api",
    timeout: 10000,
    headers: {
        "Content-Type": "application/json"
    }
});

// Helper para disparar o loading se o ref estiver pronto
const toggleLoading = (show) => {
    const loading = getLoadingRef();
    if (loading) {
        show ? loading.showLoading() : loading.hideLoading();
    }
};

// 🔐 Adiciona token automaticamente
api.interceptors.request.use((config) => {
    if (!config.skipGlobalLoading) toggleLoading(true); // Ativa o overlay

    const token = localStorage.getItem("token");

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;

}, (error) => {
    toggleLoading(false);
    return Promise.reject(error);
});

// 📡 Interceptador de respostas
api.interceptors.response.use(

    (response) => {
        if (!response.config?.skipGlobalLoading) toggleLoading(false); // Desativa o overlay no sucesso

        // Smart Unwrap
        if (response.data && response.data.data !== undefined) {
            return response.data.data;
        }
        return response.data;
    },

    (error) => {
        if (!error.config?.skipGlobalLoading) toggleLoading(false); // Desativa o overlay no erro

        const status = error.response?.status;

        if (status === 401) {
            localStorage.removeItem("token");
            window.location.href = "/login";
        }

        const message =
            error.response?.data?.message ||
            error.response?.data?.error ||
            "Erro de comunicação com o servidor.";

        // 🔥 TOAST AUTOMÁTICO
        if (status === 403) {
            toast.error("Você não tem permissão para essa ação");
        } else if (status !== 401) {
            toast.error(message);
        }

        return Promise.reject(new Error(message));

    }

);

export default api;
