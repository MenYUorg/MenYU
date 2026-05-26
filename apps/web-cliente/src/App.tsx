import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ClienteMenuPage } from './pages/menu/ClienteMenuPage'
import { ItemDetailPage } from './pages/menu/ItemDetailPage'
import { CarritoPage } from './pages/carrito/CarritoPage'
import { PagoPage } from './pages/pago/PagoPage'
import { PagoExitosoPage } from './pages/pago/PagoExitosoPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/menu" element={<ClienteMenuPage />} />
        <Route path="/menu/:itemId" element={<ItemDetailPage />} />
        <Route path="/carrito" element={<CarritoPage />} />
        <Route path="/pago" element={<PagoPage />} />
        <Route path="/pago-exitoso" element={<PagoExitosoPage />} />
        <Route path="*" element={<Navigate to="/menu" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
