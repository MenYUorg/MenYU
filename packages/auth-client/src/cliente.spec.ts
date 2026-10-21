import { createBrowserClient } from '@supabase/ssr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@supabase/ssr', () => ({ createBrowserClient: vi.fn(() => ({ auth: {} })) }))

// El cliente es un singleton del módulo: cada test lo importa de nuevo.
async function importar() {
  vi.resetModules()
  return import('./cliente')
}

describe('opcionesDeCookie', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('con https la cookie es secure y lleva el dominio compartido', async () => {
    vi.stubEnv('VITE_AUTH_COOKIE_DOMAIN', '.menyu-app.com')
    const { opcionesDeCookie } = await importar()
    expect(opcionesDeCookie('https:')).toEqual({ domain: '.menyu-app.com', path: '/', sameSite: 'lax', secure: true })
  })

  it('con http (*.menyu.local) no es secure: si no, el navegador la descarta', async () => {
    vi.stubEnv('VITE_AUTH_COOKIE_DOMAIN', '.menyu.local')
    const { opcionesDeCookie } = await importar()
    expect(opcionesDeCookie('http:')).toMatchObject({ domain: '.menyu.local', secure: false })
  })

  it('sin dominio configurado queda solo para el host actual', async () => {
    vi.stubEnv('VITE_AUTH_COOKIE_DOMAIN', '')
    const { opcionesDeCookie } = await importar()
    expect(opcionesDeCookie('https:').domain).toBeUndefined()
  })
})

describe('clienteAuth', () => {
  beforeEach(() => {
    vi.mocked(createBrowserClient).mockClear()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proyecto.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_x')
    vi.stubEnv('VITE_AUTH_COOKIE_DOMAIN', '.staging.menyu-app.com')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('crea un solo cliente, con la cookie de dominio compartido', async () => {
    const { clienteAuth } = await importar()

    expect(clienteAuth()).toBe(clienteAuth())
    expect(createBrowserClient).toHaveBeenCalledTimes(1)
    expect(createBrowserClient).toHaveBeenCalledWith('https://proyecto.supabase.co', 'sb_publishable_x', {
      cookieOptions: { domain: '.staging.menyu-app.com', path: '/', sameSite: 'lax', secure: false },
      isSingleton: false,
    })
  })

  it('sin credenciales falla al usarlo, no al importar', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    const { clienteAuth } = await importar()
    expect(() => clienteAuth()).toThrow('VITE_SUPABASE_URL')
    expect(createBrowserClient).not.toHaveBeenCalled()
  })
})
