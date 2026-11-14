import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import * as matchersDeAxe from 'vitest-axe/matchers'
import { compartirLaSesionDeWebAuth, reiniciarCuentaDePrueba } from './authClient'

// `expect(await axe(container)).toHaveNoViolations()`: el helper está en src/test/axe.ts.
expect.extend(matchersDeAxe)

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
