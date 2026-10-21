import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DefinirContrasenaPage } from './pages/DefinirContrasenaPage'
import { ElegirPage } from './pages/ElegirPage'
import { IngresarPage } from './pages/IngresarPage'
import { OlvideContrasenaPage } from './pages/OlvideContrasenaPage'
import { SinAccesoPage } from './pages/SinAccesoPage'

// El login central de MenYU (docs/auth/specs/auth.md, Fase 3). Las rutas /invitacion y /restablecer-contrasena son
// las que arman las plantillas de mail de Supabase: si cambian, cambiar también las plantillas.
export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<IngresarPage />} />
        <Route path="/olvide-contrasena" element={<OlvideContrasenaPage />} />
        <Route path="/invitacion" element={<DefinirContrasenaPage modo="invitacion" />} />
        <Route path="/restablecer-contrasena" element={<DefinirContrasenaPage modo="recuperacion" />} />
        <Route path="/elegir" element={<ElegirPage />} />
        <Route path="/sin-acceso" element={<SinAccesoPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
