import type { PerfilUsuario, Rol } from '@menyu/types'

// A qué apps puede entrar cada usuario (docs/auth/specs/auth.md, Roles). Es la única regla: la usan RequireAuth en cada
// app y web-auth para decidir el destino. Si las dos no coincidieran, una mandaría a la otra y se armaría un loop.

export type App = 'admin' | 'staff'

const ROLES_DE_ADMIN: readonly Rol[] = ['OWNER', 'GERENTE']

/** web-admin: ROOT (su consola) y OWNER o GERENTE. web-staff: cualquier membresía (OWNER y GERENTE también operan). */
export function appsDelPerfil(perfil: PerfilUsuario): App[] {
  const apps: App[] = []
  if (perfil.esRoot || perfil.membresias.some((m) => ROLES_DE_ADMIN.includes(m.rol))) apps.push('admin')
  if (perfil.membresias.length > 0) apps.push('staff')
  return apps
}

export function tieneAcceso(perfil: PerfilUsuario, app: App): boolean {
  return appsDelPerfil(perfil).includes(app)
}

/**
 * La app de una URL de MenYU, por el primer nombre del host: `admin.menyu-app.com` → admin, `staff.…` → staff, `mesa.…`
 * → cliente (web-cliente). Cualquier otra cosa → null.
 */
export function appDeUrl(url: string): App | 'cliente' | null {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return null
  }
  const primero = hostname.split('.')[0]
  if (primero === 'admin' || primero === 'staff') return primero
  if (primero === 'mesa') return 'cliente'
  return null
}

/** Si el usuario puede abrir esa URL. web-cliente no pide cuenta: siempre se puede. */
export function puedeIrA(perfil: PerfilUsuario, url: string): boolean {
  const app = appDeUrl(url)
  if (app === 'cliente') return true
  return app !== null && tieneAcceso(perfil, app)
}
