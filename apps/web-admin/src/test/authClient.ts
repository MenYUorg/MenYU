import { vi } from 'vitest'
import type { ReactNode } from 'react'
import type { MembresiaPerfil, PerfilUsuario, Rol } from '@menyu/types'

/**
 * Simula `@menyu/auth-client` en los specs de web-admin (docs/auth/specs/auth.md, entrega 4.5). Se usa así, que deja
 * lo real (`tieneAcceso`, `appsDelPerfil`) y reemplaza la sesión, la navegación y `RequireAuth`:
 *
 * ```ts
 * vi.mock('@menyu/auth-client', async () => (await import('../test/authClient')).moduloSimulado())
 * ```
 *
 * Después, en cada test, `sesionDePrueba.perfil = perfilDePrueba(...)` o `sesionDePrueba.token = …`.
 */
export const sesionDePrueba: {
  token: string | null
  tokenRenovado: string | null
  perfil: PerfilUsuario | null
} = { token: 'token-de-prueba', tokenRenovado: null, perfil: null }

export const irAlLoginSimulado = vi.fn()
export const logoutSimulado = vi.fn()

export function reiniciarSesionDePrueba(): void {
  sesionDePrueba.token = 'token-de-prueba'
  sesionDePrueba.tokenRenovado = null
  sesionDePrueba.perfil = null
  irAlLoginSimulado.mockReset()
  logoutSimulado.mockReset()
}

export async function moduloSimulado(): Promise<typeof import('@menyu/auth-client')> {
  const real = await import('@menyu/auth-client')
  return {
    ...real,
    // Sin VITE_API_URL en los tests: las rutas quedan tal cual y los specs comparan solo el camino.
    urlDeLaApi: () => '',
    tokenDeAcceso: () => Promise.resolve(sesionDePrueba.token),
    renovarSesion: () => Promise.resolve(sesionDePrueba.tokenRenovado),
    irAlLogin: irAlLoginSimulado,
    logout: logoutSimulado,
    usePerfil: () => {
      if (!sesionDePrueba.perfil) throw new Error('El test no definió sesionDePrueba.perfil')
      return sesionDePrueba.perfil
    },
    // `RequireAuth` ya tiene sus propios tests en el paquete: acá solo deja pasar a los hijos.
    RequireAuth: ({ children }: { children: ReactNode }) => children,
  } as typeof import('@menyu/auth-client')
}

/** Una membresía OWNER de una marca, con sus restaurantes. */
export function membresiaDeMarca(
  marcaId: string,
  restaurantes: { id: string; nombre: string }[] = [],
  nombre = `Marca ${marcaId}`,
): MembresiaPerfil {
  return {
    id: `mem-${marcaId}`,
    rol: 'OWNER',
    marca: { id: marcaId, nombre, restaurantes },
    restaurante: null,
  }
}

/** Una membresía de un restaurante (GERENTE, JEFE_SALON, MOZO o COCINA). */
export function membresiaDeRestaurante(
  rol: Exclude<Rol, 'OWNER'>,
  restauranteId: string,
  marcaId = 'marca-1',
  nombre = `Restaurante ${restauranteId}`,
): MembresiaPerfil {
  return {
    id: `mem-${rol}-${restauranteId}`,
    rol,
    marca: null,
    restaurante: { id: restauranteId, nombre, marcaId, marca: { id: marcaId, nombre: `Marca ${marcaId}` } },
  }
}

export function perfilDePrueba(parcial: Partial<PerfilUsuario> = {}): PerfilUsuario {
  return {
    id: 'usuario-1',
    email: 'persona@menyu.com',
    nombre: 'Persona de Prueba',
    esRoot: false,
    membresias: [],
    ...parcial,
  }
}

/** El perfil que usa la mayoría de los specs: OWNER de una marca con un restaurante. */
export function perfilDeOwner(
  restauranteId = 'rest-1',
  marcaId = 'marca-1',
): PerfilUsuario {
  return perfilDePrueba({
    email: 'owner@menyu.com',
    membresias: [membresiaDeMarca(marcaId, [{ id: restauranteId, nombre: `Restaurante ${restauranteId}` }])],
  })
}

export function perfilDeGerente(restauranteId = 'rest-1', marcaId = 'marca-1'): PerfilUsuario {
  return perfilDePrueba({
    email: 'gerente@menyu.com',
    membresias: [membresiaDeRestaurante('GERENTE', restauranteId, marcaId)],
  })
}

export function perfilDeRoot(): PerfilUsuario {
  return perfilDePrueba({ email: 'root@menyu.com', esRoot: true, membresias: [] })
}
