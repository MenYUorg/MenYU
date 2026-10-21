import { Navigate, Route, Routes } from 'react-router-dom'
import './root.css'
import { RootLayout } from './RootLayout'
import { MarcasPage } from './marcas/MarcasPage'
import { MarcaDetallePage } from './marcas/MarcaDetallePage'
import { HistorialPage } from './historial/HistorialPage'

/**
 * Las pantallas de la consola de ROOT (`/root/*`). Este módulo se carga con `React.lazy` desde `App.tsx`, dentro de la guarda de
 * ROOT: OWNER y GERENTE no descargan ni este código ni `root.css`.
 */
export default function RootRoutes() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<Navigate to="marcas" replace />} />
        <Route path="marcas" element={<MarcasPage />} />
        <Route path="marcas/:id" element={<MarcaDetallePage />} />
        <Route path="historial" element={<HistorialPage />} />
        <Route path="*" element={<Navigate to="/root/marcas" replace />} />
      </Route>
    </Routes>
  )
}
