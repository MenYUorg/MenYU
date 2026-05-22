import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@menyu/auth'
import { LoginPage } from './pages/login/LoginPage'
import { MozoPanel } from './pages/mozo/MozoPanel'
import { CocinaPage } from './pages/cocina/CocinaPage'
import { SelectorPage } from './pages/selector/SelectorPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute roles={['mozo', 'cocina', 'admin']} />}>
          <Route path="/selector" element={<SelectorPage />} />
          <Route path="/mozo" element={<MozoPanel />} />
          <Route path="/cocina" element={<CocinaPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
