import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ClienteMenuPage } from './pages/menu/ClienteMenuPage'
import { ItemDetailPage } from './pages/menu/ItemDetailPage'
import { CarritoPage } from './pages/carrito/CarritoPage'
import { MisPedidosPage } from './pages/pedidos/MisPedidosPage'
import { PagarPage } from './pages/pago/PagarPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/menu" element={<ClienteMenuPage />} />
        <Route path="/menu/:itemId" element={<ItemDetailPage />} />
        <Route path="/carrito" element={<CarritoPage />} />
        <Route path="/pedidos" element={<MisPedidosPage />} />
        <Route path="/pagar" element={<PagarPage />} />
        <Route path="*" element={<Navigate to="/menu" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
