import { appDeUrl, puedeIrA, type App } from '@menyu/auth-client'
import type { MembresiaPerfil, PerfilUsuario, Rol } from '@menyu/types'

// A qué app va cada usuario después de iniciar sesión (docs/auth/specs/auth.md, Roles y Fases 3 y 4b).

export interface UrlsDeApps {
  admin: string
  staff: string
  /** web-cliente (`mesa.<ambiente>`), adonde vuelven las cuentas de cliente (Fase 4b). */
  cliente: string
}

// auth.<sufijo> → admin.<sufijo>, staff.<sufijo> y mesa.<sufijo>.
const DOMINIO_PROPIO = /^auth\.((staging\.)?menyu-app\.com|menyu\.local)$/

export function urlsDeApps(
  hostname: string = window.location.hostname,
  protocolo: string = window.location.protocol,
): UrlsDeApps {
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return { admin: 'http://localhost:5174', staff: 'http://localhost:5175', cliente: 'http://localhost:5176' }
  }
  // Cualquier otro host (por ejemplo, un preview de Vercel) manda a producción.
  const sufijo = DOMINIO_PROPIO.exec(hostname)?.[1] ?? 'menyu-app.com'
  if (sufijo === 'menyu.local') {
    // En desarrollo cada app tiene su puerto (vite.config.ts de cada una).
    return {
      admin: `${protocolo}//admin.menyu.local:5174`,
      staff: `${protocolo}//staff.menyu.local:5175`,
      cliente: `${protocolo}//mesa.menyu.local:5176`,
    }
  }
  return { admin: `https://admin.${sufijo}`, staff: `https://staff.${sufijo}`, cliente: `https://mesa.${sufijo}` }
}

/** Si el `redirect` (ya validado) lleva a web-cliente, que no pide cuenta: ahí puede volver cualquier sesión. */
export function vaAWebCliente(redirect: string | null): redirect is string {
  return redirect !== null && appDeUrl(redirect) === 'cliente'
}

/**
 * A dónde vuelve quien crea una cuenta de cliente: al `redirect` si es de web-cliente (la pantalla desde la que vino) y,
 * si no, al inicio de web-cliente. Una cuenta nueva no tiene `Usuario`: admin y staff la mandarían a /sin-acceso.
 */
export function destinoDelCliente(redirect: string | null, urls: UrlsDeApps): string {
  return vaAWebCliente(redirect) ? redirect : `${urls.cliente}/`
}

const DESTINO_POR_ROL: Record<Rol, { app: App; ruta: string }> = {
  OWNER: { app: 'admin', ruta: '/admin' },
  GERENTE: { app: 'admin', ruta: '/admin' },
  JEFE_SALON: { app: 'staff', ruta: '/mozo' },
  MOZO: { app: 'staff', ruta: '/mozo' },
  COCINA: { app: 'staff', ruta: '/cocina' },
}

export const NOMBRE_DEL_ROL: Record<Rol, string> = {
  OWNER: 'Dueño de la marca',
  GERENTE: 'Gerente',
  JEFE_SALON: 'Jefe de salón',
  MOZO: 'Mozo',
  COCINA: 'Cocina',
}

/** Un lugar al que el usuario puede entrar: la administración de MenYU (ROOT) o una de sus membresías. */
export interface OpcionIngreso {
  clave: string
  app: App
  ruta: string
  lugar: string
  rol: string
  /** Qué eligió, para la app de destino. Desde la Fase 4 cada app lo lee de la URL. */
  parametro?: { nombre: 'marcaId' | 'restauranteId'; valor: string }
}

function opcionDeMembresia(membresia: MembresiaPerfil): OpcionIngreso | null {
  const { app, ruta } = DESTINO_POR_ROL[membresia.rol]
  const rol = NOMBRE_DEL_ROL[membresia.rol]
  if (membresia.marca) {
    const parametro = { nombre: 'marcaId' as const, valor: membresia.marca.id }
    return { clave: membresia.id, app, ruta, lugar: membresia.marca.nombre, rol, parametro }
  }
  if (membresia.restaurante) {
    const parametro = { nombre: 'restauranteId' as const, valor: membresia.restaurante.id }
    return { clave: membresia.id, app, ruta, lugar: membresia.restaurante.nombre, rol, parametro }
  }
  return null
}

export function opcionesDeIngreso(perfil: PerfilUsuario): OpcionIngreso[] {
  const opciones: OpcionIngreso[] = []
  if (perfil.esRoot) {
    opciones.push({ clave: 'root', app: 'admin', ruta: '/admin', lugar: 'Administración de MenYU', rol: 'Root' })
  }
  for (const membresia of perfil.membresias) {
    const opcion = opcionDeMembresia(membresia)
    if (opcion) opciones.push(opcion)
  }
  return opciones
}

export function urlDeOpcion(opcion: OpcionIngreso, urls: UrlsDeApps): string {
  const url = new URL(opcion.ruta, urls[opcion.app])
  if (opcion.parametro) url.searchParams.set(opcion.parametro.nombre, opcion.parametro.valor)
  return url.toString()
}

export type Destino =
  | { tipo: 'sin-acceso' }
  | { tipo: 'ir'; url: string }
  | { tipo: 'elegir'; opciones: OpcionIngreso[] }

/**
 * Con un redirect válido a una app que le toca → ahí (la app de destino decide qué ve). web-cliente le toca a cualquiera,
 * también a quien no tiene ningún lugar (Fase 4b). Un redirect a una app que no le toca (un MOZO a web-admin) se ignora:
 * RequireAuth lo devolvería y no terminaría nunca. Si no, sin lugares a los que entrar → sin acceso; con uno, ese; con
 * varios, el selector.
 */
export function decidirDestino(perfil: PerfilUsuario, redirect: string | null, urls: UrlsDeApps): Destino {
  if (redirect && puedeIrA(perfil, redirect)) return { tipo: 'ir', url: redirect }
  const opciones = opcionesDeIngreso(perfil)
  if (opciones.length === 0) return { tipo: 'sin-acceso' }
  if (opciones.length === 1) return { tipo: 'ir', url: urlDeOpcion(opciones[0], urls) }
  return { tipo: 'elegir', opciones }
}
