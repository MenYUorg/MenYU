import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'
import { reiniciarCuentaDePrueba } from './authClient'

// La cuenta de Supabase del cliente (Fase 4b): ningún spec habla con Supabase. Ver src/test/authClient.ts.
vi.mock('@menyu/auth-client', async () => (await import('./authClient')).moduloSimulado())

beforeEach(() => {
  reiniciarCuentaDePrueba()
})
