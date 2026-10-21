import { afterEach, describe, expect, it, vi } from 'vitest'
import { obtenerPerfil } from './perfil'

describe('obtenerPerfil', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it.each([
    [401, 'sesion-invalida'],
    [403, 'sin-acceso'],
    [503, 'error'],
  ])('un %i es %s', async (status, tipo) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))
    expect(await obtenerPerfil('token')).toEqual({ tipo })
  })

  it('con 200 devuelve el perfil y manda el token como Bearer a la API configurada', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.menyu-app.com/api')
    const perfil = { id: 'u-1', email: 'a@b.com', nombre: 'A', esRoot: true, membresias: [] }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(perfil), { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    expect(await obtenerPerfil('token-1')).toEqual({ tipo: 'ok', perfil })
    expect(fetch).toHaveBeenCalledWith('https://api.menyu-app.com/api/auth/me', {
      headers: { Authorization: 'Bearer token-1' },
    })
  })

  it('sin red es un error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    expect(await obtenerPerfil('token')).toEqual({ tipo: 'error' })
  })
})
