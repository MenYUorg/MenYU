import { Navigate, Route, Routes } from 'react-router-dom'
import './root.css'
import { RootLayout } from './RootLayout'
import { MarcasPage } from './marcas/MarcasPage'
import { MarcaDetallePage } from './marcas/MarcaDetallePage'
import { DuenosPage } from './duenos/DuenosPage'
import { HistorialPage } from './historial/HistorialPage'
import { CuentasRootPage } from './roots/CuentasRootPage'

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
        <Route path="duenos" element={<DuenosPage />} />
        <Route path="roots" element={<CuentasRootPage />} />
        <Route path="historial" element={<HistorialPage />} />
        <Route path="*" element={<Navigate to="/root/marcas" replace />} />
      </Route>
    </Routes>
  )
}
