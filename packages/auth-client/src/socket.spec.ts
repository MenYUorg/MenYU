import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clienteAuth } from './cliente'
import { authDelSocket } from './socket'
import { crearAuthSimulado, sesion, type AuthSimulado } from './test/authSimulado'

vi.mock('./cliente', () => ({ clienteAuth: vi.fn() }))

let auth: AuthSimulado

beforeEach(() => {
  auth = crearAuthSimulado()
  vi.mocked(clienteAuth).mockReturnValue({ auth } as never)
})

describe('authDelSocket', () => {
  it('con sesión entrega su access token', async () => {
    auth.sesion = sesion('uid-1', 'token-1')
    const cb = vi.fn()
    authDelSocket(cb)
    await vi.waitFor(() => expect(cb).toHaveBeenCalledWith({ token: 'token-1' }))
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('lee el token en cada (re)conexión', async () => {
    auth.sesion = sesion('uid-1', 'token-1')
    const primera = vi.fn()
    authDelSocket(primera)
    await vi.waitFor(() => expect(primera).toHaveBeenCalledWith({ token: 'token-1' }))

    auth.sesion = sesion('uid-1', 'token-2')
    const segunda = vi.fn()
    authDelSocket(segunda)
    await vi.waitFor(() => expect(segunda).toHaveBeenCalledWith({ token: 'token-2' }))
  })

  it('sin sesión entrega {} sin token', async () => {
    const cb = vi.fn()
    authDelSocket(cb)
    await vi.waitFor(() => expect(cb).toHaveBeenCalledWith({}))
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('si no se pudo leer la sesión, entrega {} igual', async () => {
    auth.getSession.mockRejectedValueOnce(new Error('cookie ilegible'))
    const cb = vi.fn()
    authDelSocket(cb)
    await vi.waitFor(() => expect(cb).toHaveBeenCalledWith({}))
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
