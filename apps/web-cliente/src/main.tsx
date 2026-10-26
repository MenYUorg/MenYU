import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { olvidarElLoginAnterior } from './utils/cuenta'

// Los tokens del login de `/auth` quedaron en el navegador de quien lo usó antes de la Fase 5 de auth. Ya no sirven
// para nada: se borran al arrancar para no dejar basura (ni un token de más) en el localStorage.
olvidarElLoginAnterior()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
