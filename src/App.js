import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import StockAuditHistory from "./pages/StockAuditHistory";

import Register from "./pages/Register";
import Login from "./pages/login";
import Dashboard from "./pages/Dashboard";
import StockMovement from "./pages/StockMovement";
import Products from "./pages/Products";
import Suppliers from "./pages/Suppliers";
import PurchaseOrders from "./pages/PurchaseOrders";
import StockHistory from "./pages/StockHistory";
import ActivityLog from "./pages/ActivityLog";
import PurchaseSuggestions from "./pages/PurchaseSuggestions";
import SelectEstablishment from "./pages/SelectEstablishment";
import StockTransfers from "./pages/StockTransfers";
import StockAudits from "./pages/StockAudits";
import StockAuditDetail from "./pages/StockAuditDetail";
import Reports from "./pages/Reports";
import FinancialReport from "./pages/FinancialReport";
import MarketingEvents from "./pages/MarketingEvents";
import Production from "./pages/Production";
import Portioning from "./pages/Portioning";
import Patrimony from "./pages/Patrimony";
import Entries from "./pages/Entries";
import StockLocations from "./pages/StockLocations";
import MaterialConsumption from "./pages/MaterialConsumption";
import CommercialAgreements from "./pages/CommercialAgreements";
import OrganizationProducts from "./pages/OrganizationProducts";
import OrganizationSuppliers from "./pages/OrganizationSuppliers";
import SupplierPriceUpdates from "./pages/SupplierPriceUpdates";
import SupplierPortalLogin from "./pages/SupplierPortalLogin";
import SupplierPortalRecovery from "./pages/SupplierPortalRecovery";
import SupplierPortalDashboard from "./pages/SupplierPortalDashboard";
import SupplierPortalUsers from "./pages/SupplierPortalUsers";
import Events from "./pages/Events";
import NewEvent from "./pages/NewEvent";
import EventDetail from "./pages/EventDetail";
import EventBudgetEditor from "./pages/EventBudgetEditor";
import EventProposal from "./pages/EventProposal";
import TableReservations from "./pages/TableReservations";

import SidebarLayout from "./components/SidebarLayout";
import PrivateRoute from "./components/PrivateRoute";
import Users from "./pages/Users";

import { AppProvider } from "./context/AppContext";
import { ThemeModeProvider } from "./context/ThemeModeProvider";
import { LoadingProvider } from "./context/LoadingContext";

import GlobalStyles from "./styles/GlobalStyles";

import { Toaster } from "react-hot-toast";

function App() {
  useEffect(() => {
    const handleWheel = (e) => {
      if (document.activeElement && document.activeElement.type === "number") {
        e.preventDefault();
        document.activeElement.blur();
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, []);

  return (
    <ThemeModeProvider>
      <LoadingProvider>
        <GlobalStyles />
        <AppProvider>
          <BrowserRouter>
            <Toaster position="top-right" />

          <Routes>

            {/* ROTAS PUBLICAS */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/supplier-portal/login" element={<SupplierPortalLogin />} />
            <Route path="/supplier-portal/recovery" element={<SupplierPortalRecovery />} />
            <Route path="/supplier-portal" element={<SupplierPortalDashboard />} />
            <Route path="/select-establishment" element={<SelectEstablishment />} />

            {/* ROTAS PROTEGIDAS */}
            <Route
              element={
                <PrivateRoute>
                  <SidebarLayout />
                </PrivateRoute>
              }
            >

              <Route path="/" element={<Dashboard />} />

              <Route path="users" element={<Users />} />

              <Route path="/products" element={<Products />} />
              <Route path="/organization-products" element={<OrganizationProducts />} />
              <Route path="/organization-suppliers" element={<OrganizationSuppliers />} />
              <Route path="/supplier-price-updates" element={<SupplierPriceUpdates />} />
              <Route path="/supplier-portal-users" element={<SupplierPortalUsers />} />

              <Route path="/suppliers" element={<Suppliers />} />

              <Route path="/purchase-orders" element={<PurchaseOrders />} />
              <Route path="/commercial-agreements" element={<CommercialAgreements />} />

              <Route path="/stock-history" element={<StockHistory />} />

              <Route path="/stock-movement" element={<StockMovement />} />

              <Route path="/activity-log" element={<ActivityLog />} />

              <Route path="/stock-audits" element={<StockAudits />} />

              <Route path="reports" element={<Reports />} />
              
              <Route path="/financial-report" element={<FinancialReport />} />

              <Route
                path="/stock-audits/history"
                element={<StockAuditHistory />}
              />

              <Route path="/stock-audits/:id" element={<StockAuditDetail />} />

              <Route path="/stock-transfers" element={<StockTransfers />} />
              <Route path="/stock-locations" element={<StockLocations />} />
              <Route path="/marketing-events" element={<MarketingEvents />} />
              <Route path="/events" element={<Events />} />
              <Route path="/events/new" element={<NewEvent />} />
              <Route path="/events/:id" element={<EventDetail />} />
              <Route path="/events/:eventId/budgets/:budgetId/edit" element={<EventBudgetEditor />} />
              <Route path="/events/:eventId/budgets/:budgetId/proposal" element={<EventProposal />} />
              <Route path="/table-reservations" element={<TableReservations />} />
              <Route path="/production" element={<Production />} />
              <Route path="/portioning" element={<Portioning />} />
              <Route path="/patrimony" element={<Patrimony />} />
              <Route path="/entries" element={<Entries />} />
              <Route path="/material-consumption" element={<MaterialConsumption />} />

              <Route
                path="/purchase-suggestions"
                element={<PurchaseSuggestions />}
              />

            </Route>

          </Routes>
        </BrowserRouter>
      </AppProvider>
    </LoadingProvider>
  </ThemeModeProvider>
);
}

export default App;
