import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ClienteMenuPage } from './pages/menu/ClienteMenuPage'
import { ItemDetailPage } from './pages/menu/ItemDetailPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/menu" element={<ClienteMenuPage />} />
        <Route path="/menu/:itemId" element={<ItemDetailPage />} />
        <Route path="*" element={<Navigate to="/menu" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
