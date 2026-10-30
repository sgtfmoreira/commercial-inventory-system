import React, { createContext, useCallback, useContext, useState, useEffect } from "react";
import { setLoadingRef } from "./loadingRef";
import LoadingOverlay from "../components/LoadingOverlay";

const LoadingContext = createContext();

export const LoadingProvider = ({ children }) => {
    const [pendingRequests, setPendingRequests] = useState(0);

    const showLoading = useCallback(() => {
        setPendingRequests(current => current + 1);
    }, []);

    const hideLoading = useCallback(() => {
        setPendingRequests(current => Math.max(0, current - 1));
    }, []);

    const isLoading = pendingRequests > 0;

    // Registra as funções de loading no ref para serem acessíveis fora de componentes (ex: api.js)
    useEffect(() => {
        setLoadingRef({ showLoading, hideLoading });
    }, [showLoading, hideLoading]);

    return (
        <LoadingContext.Provider value={{ isLoading, showLoading, hideLoading }}>
            <LoadingOverlay />
            {children}
        </LoadingContext.Provider>
    );
};

export const useLoading = () => {
    const context = useContext(LoadingContext);
    if (!context) {
        throw new Error("useLoading deve ser usado dentro de um LoadingProvider");
    }
    return context;
};
