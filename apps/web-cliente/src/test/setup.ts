import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { compartirLaSesionDeWebAuth, reiniciarCuentaDePrueba } from './authClient'

// La cuenta de Supabase del cliente (Fase 4b): ningún spec habla con Supabase. Ver src/test/authClient.ts.
vi.mock('@menyu/auth-client', async () => (await import('./authClient')).moduloSimulado())

beforeEach(() => {
  reiniciarCuentaDePrueba()
  // Por defecto, un deploy que puede tener cuentas (con las variables de Supabase y bajo el dominio de la cookie): es
  // lo normal, y sin ellas `useSesionDiferida` ni siquiera carga el paquete, así que ninguna sesión simulada se vería.
  // Un spec que quiera el caso contrario lo pisa con su propio `vi.stubEnv` (por ejemplo `VITE_SUPABASE_URL: ''`).
  compartirLaSesionDeWebAuth()
})

// Las variables simuladas (`vi.stubEnv`) no pasan de un test al siguiente.
afterEach(() => {
  vi.unstubAllEnvs()
})
