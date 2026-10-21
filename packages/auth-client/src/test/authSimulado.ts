import type { MembresiaPerfil, PerfilUsuario, Rol } from '@menyu/types'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { vi } from 'vitest'

type Oyente = (evento: AuthChangeEvent, session: Session | null) => void

/** Lo que el paquete usa de `cliente.auth` de Supabase, con la sesión en una variable en vez de la cookie. */
export function crearAuthSimulado(inicial: Session | null = null) {
  const oyentes = new Set<Oyente>()
  const auth = {
    sesion: inicial,
    emitir(evento: AuthChangeEvent, session: Session | null) {
      for (const oyente of oyentes) oyente(evento, session)
    },
    oyentes: () => oyentes.size,
    getSession: vi.fn(async () => ({ data: { session: auth.sesion }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: auth.sesion?.user ?? null }, error: null })),
    refreshSession: vi.fn(async () => ({ data: { session: auth.sesion }, error: null })),
    signOut: vi.fn(async () => {
      auth.sesion = null
      auth.emitir('SIGNED_OUT', null)
      return { error: null }
    }),
    onAuthStateChange: vi.fn((oyente: Oyente) => {
      oyentes.add(oyente)
      return { data: { subscription: { unsubscribe: () => oyentes.delete(oyente) } } }
    }),
  }
  return auth
}

export type AuthSimulado = ReturnType<typeof crearAuthSimulado>

export function sesion(userId = 'uid-1', token = 'token-1'): Session {
  return { access_token: token, user: { id: userId } } as Session
}

const marca = { id: 'marca-1', nombre: 'Marca', restaurantes: [{ id: 'rest-1', nombre: 'Restaurante' }] }
const restaurante = { id: 'rest-1', nombre: 'Restaurante', marcaId: 'marca-1' }

export function membresia(rol: Rol): MembresiaPerfil {
  return rol === 'OWNER'
    ? { id: `m-${rol}`, rol, marca, restaurante: null }
    : { id: `m-${rol}`, rol, marca: null, restaurante }
}

export function perfil(roles: Rol[], esRoot = false): PerfilUsuario {
  return { id: 'usuario-1', email: 'a@menyu.com', nombre: 'A', esRoot, membresias: roles.map(membresia) }
}
