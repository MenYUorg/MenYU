import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { reiniciarCuentaDePrueba } from './authClient'

// La cuenta de Supabase del cliente (Fase 4b): ningún spec habla con Supabase. Ver src/test/authClient.ts.
vi.mock('@menyu/auth-client', async () => (await import('./authClient')).moduloSimulado())

beforeEach(() => {
  reiniciarCuentaDePrueba()
})

// Las variables simuladas (`vi.stubEnv`, por ejemplo `compartirLaSesionDeWebAuth()`) no pasan de un test al siguiente.
afterEach(() => {
  vi.unstubAllEnvs()
})
