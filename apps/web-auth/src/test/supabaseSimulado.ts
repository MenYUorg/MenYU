import type { PerfilUsuario } from '@menyu/types'
import { vi } from 'vitest'

/** Lo que los tests de pantallas usan del cliente de Supabase (`clienteAuth()` de @menyu/auth-client). */
export function crearSupabaseSimulado() {
  return {
    auth: {
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn(),
      updateUser: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      signInWithOAuth: vi
        .fn()
        .mockResolvedValue({ data: { provider: 'google', url: 'https://supabase/authorize' }, error: null }),
      initialize: vi.fn().mockResolvedValue({ error: null }),
    },
  }
}

export function sesion(email = 'mozo@menyu.com') {
  return { access_token: 'token-de-prueba', user: { id: 'uid-1', email } }
}

export const PERFIL_MOZO: PerfilUsuario = {
  id: 'usuario-1',
  email: 'mozo@menyu.com',
  nombre: 'Mozo',
  esRoot: false,
  membresias: [
    {
      id: 'm-1',
      rol: 'MOZO',
      marca: null,
      restaurante: { id: 'rest-1', nombre: 'Restaurante', marcaId: 'marca-1', marca: { id: 'marca-1', nombre: 'Marca' } },
    },
  ],
}
