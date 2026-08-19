import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/authStore'
import LoginPage from './pages/LoginPage'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import OrdersPage from './pages/OrdersPage'
import NewOrderPage from './pages/NewOrderPage'
import OrderDetailPage from './pages/OrderDetailPage'
import CustomersPage from './pages/CustomersPage'
import GlassCatalogPage from './pages/GlassCatalogPage'
import PricingPage from './pages/PricingPage'
import PaymentVerificationPage from './pages/PaymentVerificationPage'
import WalkInPage from './pages/WalkInPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <Routes>
        {/* Public walk-in order page — no auth required */}
        <Route path="/" element={<WalkInPage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Staff portal — auth required */}
        <Route path="/staff" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/staff/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/new" element={<NewOrderPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="catalog" element={<GlassCatalogPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="payments" element={<PaymentVerificationPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
