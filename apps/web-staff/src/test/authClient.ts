import { vi } from 'vitest'
import type { ReactNode } from 'react'
import type { MembresiaPerfil, PerfilUsuario, Rol } from '@menyu/types'

/**
 * Simula `@menyu/auth-client` en los specs de web-staff (docs/auth/specs/auth.md, entrega 4.6). Se usa así, que deja
 * lo real (`tieneAcceso`, `appsDelPerfil`) y reemplaza la sesión, la navegación y `RequireAuth`:
 *
 * ```ts
 * vi.mock('@menyu/auth-client', async () => (await import('../test/authClient')).moduloSimulado())
 * ```
 *
 * Después, en cada test, `sesionDePrueba.perfil = perfilDeMozo()` o `sesionDePrueba.token = …`.
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

export function perfilDeMozo(restauranteId = 'rest-1', marcaId = 'marca-1'): PerfilUsuario {
  return perfilDePrueba({
    nombre: 'Mozo de Prueba',
    email: 'mozo@menyu.com',
    membresias: [membresiaDeRestaurante('MOZO', restauranteId, marcaId)],
  })
}

export function perfilDeJefeSalon(restauranteId = 'rest-1', marcaId = 'marca-1'): PerfilUsuario {
  return perfilDePrueba({
    nombre: 'Jefe de Salón de Prueba',
    email: 'jefe-salon@menyu.com',
    membresias: [membresiaDeRestaurante('JEFE_SALON', restauranteId, marcaId)],
  })
}

export function perfilDeCocina(restauranteId = 'rest-1', marcaId = 'marca-1'): PerfilUsuario {
  return perfilDePrueba({
    nombre: 'Cocina de Prueba',
    email: 'cocina@menyu.com',
    membresias: [membresiaDeRestaurante('COCINA', restauranteId, marcaId)],
  })
}

export function perfilDeGerente(restauranteId = 'rest-1', marcaId = 'marca-1'): PerfilUsuario {
  return perfilDePrueba({
    nombre: 'Gerente de Prueba',
    email: 'gerente@menyu.com',
    membresias: [membresiaDeRestaurante('GERENTE', restauranteId, marcaId)],
  })
}

export function perfilDeOwner(restauranteId = 'rest-1', marcaId = 'marca-1'): PerfilUsuario {
  return perfilDePrueba({
    nombre: 'Owner de Prueba',
    email: 'owner@menyu.com',
    membresias: [membresiaDeMarca(marcaId, [{ id: restauranteId, nombre: `Restaurante ${restauranteId}` }])],
  })
}

/**
 * La cuenta mixta de las pruebas (`varias.pruebas-auth@menyu-app.com`): OWNER de la marca y MOZO del restaurante. Sus
 * permisos salen de los dos roles juntos, así que ve las dos vistas y además atiende llamados.
 */
export function perfilMixto(restauranteId = 'rest-1', marcaId = 'marca-1'): PerfilUsuario {
  return perfilDePrueba({
    nombre: 'Varias de Prueba',
    email: 'varias@menyu.com',
    membresias: [
      membresiaDeMarca(marcaId, [{ id: restauranteId, nombre: `Restaurante ${restauranteId}` }]),
      membresiaDeRestaurante('MOZO', restauranteId, marcaId),
    ],
  })
}

export function perfilDeRoot(): PerfilUsuario {
  return perfilDePrueba({ nombre: 'Root de Prueba', email: 'root@menyu.com', esRoot: true, membresias: [] })
}
