import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clienteAuth } from './cliente'
import { renovarSesion, tokenDeAcceso } from './sesion'
import { crearAuthSimulado, sesion, type AuthSimulado } from './test/authSimulado'

vi.mock('./cliente', () => ({ clienteAuth: vi.fn() }))

let auth: AuthSimulado

beforeEach(() => {
  auth = crearAuthSimulado()
  vi.mocked(clienteAuth).mockReturnValue({ auth } as never)
})

describe('tokenDeAcceso', () => {
  it('sin sesión es null', async () => {
    expect(await tokenDeAcceso()).toBeNull()
  })

  it('con sesión es su access token, leído en cada llamada', async () => {
    auth.sesion = sesion('uid-1', 'token-1')
    expect(await tokenDeAcceso()).toBe('token-1')
    auth.sesion = sesion('uid-1', 'token-2')
    expect(await tokenDeAcceso()).toBe('token-2')
  })
})

describe('renovarSesion', () => {
  it('devuelve el token nuevo', async () => {
    auth.refreshSession.mockResolvedValueOnce({ data: { session: sesion('uid-1', 'nuevo') }, error: null })
    expect(await renovarSesion()).toBe('nuevo')
  })

  it('si Supabase no la renueva, null', async () => {
    auth.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: new Error('refresh token vencido') } as never)
    expect(await renovarSesion()).toBeNull()
  })

  it('sin error pero sin sesión, null', async () => {
    expect(await renovarSesion()).toBeNull()
  })
})
