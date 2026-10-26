import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ConfirmarEmailPage } from './pages/ConfirmarEmailPage'
import { CrearCuentaPage } from './pages/CrearCuentaPage'
import { DefinirContrasenaPage } from './pages/DefinirContrasenaPage'
import { ElegirPage } from './pages/ElegirPage'
import { IngresarPage } from './pages/IngresarPage'
import { OlvideContrasenaPage } from './pages/OlvideContrasenaPage'
import { PrivacidadPage } from './pages/PrivacidadPage'
import { SinAccesoPage } from './pages/SinAccesoPage'
import { VolverDeGooglePage } from './pages/VolverDeGooglePage'

// El login central de MenYU (docs/auth/specs/auth.md, Fases 3, 3b y 4b). Las rutas /invitacion,
// /restablecer-contrasena y /confirmar-email son las que arman las plantillas de mail de Supabase, y /google está en
// las Redirect URLs de cada proyecto de Supabase: si cambian, cambiar también las plantillas o las Redirect URLs.
// /privacidad es la política de privacidad pública que figura en la pantalla de consentimiento de Google Cloud: no
// cambiarla de ruta. web-cliente enlaza /crear-cuenta.
export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<IngresarPage />} />
        <Route path="/crear-cuenta" element={<CrearCuentaPage />} />
        <Route path="/confirmar-email" element={<ConfirmarEmailPage />} />
        <Route path="/olvide-contrasena" element={<OlvideContrasenaPage />} />
        <Route path="/invitacion" element={<DefinirContrasenaPage modo="invitacion" />} />
        <Route path="/restablecer-contrasena" element={<DefinirContrasenaPage modo="recuperacion" />} />
        <Route path="/google" element={<VolverDeGooglePage />} />
        <Route path="/elegir" element={<ElegirPage />} />
        <Route path="/sin-acceso" element={<SinAccesoPage />} />
        <Route path="/privacidad" element={<PrivacidadPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
