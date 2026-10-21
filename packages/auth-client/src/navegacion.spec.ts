import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clienteAuth } from './cliente'
import { irA } from './ir'
import { irAlLogin, irASinAcceso, irASuApp, logout, urlDeLogin } from './navegacion'
import { crearAuthSimulado, sesion, type AuthSimulado } from './test/authSimulado'

vi.mock('./ir', () => ({ irA: vi.fn(), recargar: vi.fn() }))
vi.mock('./cliente', () => ({ clienteAuth: vi.fn() }))

let auth: AuthSimulado

beforeEach(() => {
  vi.mocked(irA).mockClear()
  vi.stubEnv('VITE_AUTH_URL', 'https://auth.menyu-app.com')
  auth = crearAuthSimulado(sesion())
  vi.mocked(clienteAuth).mockReturnValue({ auth } as never)
})
afterEach(() => vi.unstubAllEnvs())

describe('urlDeLogin', () => {
  it('lleva la pantalla actual como redirect', () => {
    expect(urlDeLogin('https://admin.menyu-app.com/admin/menu?x=1')).toBe(
      'https://auth.menyu-app.com/?redirect=https%3A%2F%2Fadmin.menyu-app.com%2Fadmin%2Fmenu%3Fx%3D1',
    )
  })

  it('sin argumento usa la URL de la pestaña', () => {
    expect(new URL(urlDeLogin()).searchParams.get('redirect')).toBe(window.location.href)
  })
})

describe('salidas a web-auth', () => {
  it('irAlLogin va al login con el redirect', () => {
    irAlLogin('https://staff.menyu-app.com/mozo')
    expect(irA).toHaveBeenCalledWith('https://auth.menyu-app.com/?redirect=https%3A%2F%2Fstaff.menyu-app.com%2Fmozo')
  })

  it('irASinAcceso va a la pantalla de sin acceso', () => {
    irASinAcceso()
    expect(irA).toHaveBeenCalledWith('https://auth.menyu-app.com/sin-acceso')
  })

  it('irASuApp va a web-auth sin redirect, para no volver acá', () => {
    irASuApp()
    expect(irA).toHaveBeenCalledWith('https://auth.menyu-app.com/')
  })
})

describe('logout', () => {
  it('cierra solo esta sesión y vuelve a web-auth', async () => {
    await logout()
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(irA).toHaveBeenCalledWith('https://auth.menyu-app.com/')
  })

  it('si Supabase falla, igual sale a web-auth', async () => {
    auth.signOut.mockRejectedValueOnce(new Error('sin red'))
    await expect(logout()).rejects.toThrow('sin red')
    expect(irA).toHaveBeenCalledWith('https://auth.menyu-app.com/')
  })
})
