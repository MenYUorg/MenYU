import { afterEach, describe, expect, it, vi } from 'vitest'
import { credencialesDeSupabase, dominioDeLaCookie, urlDeAuth, urlDeLaApi } from './config'

describe('config', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('sin la URL o la clave de Supabase avisa qué falta', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proyecto.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    expect(() => credencialesDeSupabase()).toThrow('VITE_SUPABASE_PUBLISHABLE_KEY')
  })

  it('con las dos devuelve las credenciales', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proyecto.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_x')
    expect(credencialesDeSupabase()).toEqual({ url: 'https://proyecto.supabase.co', clave: 'sb_publishable_x' })
  })

  it('el dominio de la cookie vacío es "solo este host"', () => {
    vi.stubEnv('VITE_AUTH_COOKIE_DOMAIN', '')
    expect(dominioDeLaCookie()).toBeUndefined()
    vi.stubEnv('VITE_AUTH_COOKIE_DOMAIN', '.menyu-app.com')
    expect(dominioDeLaCookie()).toBe('.menyu-app.com')
  })

  it('la URL de web-auth va sin barra final y es obligatoria', () => {
    vi.stubEnv('VITE_AUTH_URL', 'https://auth.menyu-app.com//')
    expect(urlDeAuth()).toBe('https://auth.menyu-app.com')
    vi.stubEnv('VITE_AUTH_URL', '')
    expect(() => urlDeAuth()).toThrow('VITE_AUTH_URL')
  })

  it('la API es /api salvo que se configure otra', () => {
    expect(urlDeLaApi()).toBe('/api')
    vi.stubEnv('VITE_API_URL', 'https://api.menyu-app.com/api')
    expect(urlDeLaApi()).toBe('https://api.menyu-app.com/api')
  })
})
