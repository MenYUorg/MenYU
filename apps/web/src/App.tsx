import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './router/ProtectedRoute'
import { LoginPage } from './pages/login/LoginPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminMenuPage } from './pages/admin/menu/AdminMenuPage'
import { TablesPage } from './pages/admin/tables/TablesPage'
import { MozoPanel } from './pages/mozo/MozoPanel'
import { ClienteMenuPage } from './pages/menu/ClienteMenuPage'
import { ItemDetailPage } from './pages/menu/ItemDetailPage'
import { CocinaPage } from './pages/cocina/CocinaPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Admin */}
        <Route element={<ProtectedRoute tipo="admin" />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<Navigate to="/admin/menu" replace />} />
            <Route path="/admin/menu" element={<AdminMenuPage />} />
            <Route path="/admin/tables" element={<TablesPage />} />
          </Route>
        </Route>

        {/* Mozo */}
        <Route element={<ProtectedRoute tipo="mozo" />}>
          <Route path="/mozo" element={<MozoPanel />} />
        </Route>

        {/* Cliente */}
        <Route element={<ProtectedRoute tipo="cliente" />}>
          <Route path="/menu" element={<ClienteMenuPage />} />
          <Route path="/menu/:itemId" element={<ItemDetailPage />} />
        </Route>

        {/* Cocina */}
        <Route element={<ProtectedRoute tipo="cocina" />}>
          <Route path="/cocina" element={<CocinaPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
