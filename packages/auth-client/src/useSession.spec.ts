import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clienteAuth } from './cliente'
import { crearAuthSimulado, sesion, type AuthSimulado } from './test/authSimulado'
import { useSession } from './useSession'

vi.mock('./cliente', () => ({ clienteAuth: vi.fn() }))

let auth: AuthSimulado

beforeEach(() => {
  auth = crearAuthSimulado()
  vi.mocked(clienteAuth).mockReturnValue({ auth } as never)
})

describe('useSession', () => {
  it('arranca cargando y queda sin sesión si no hay', async () => {
    const { result } = renderHook(() => useSession())
    expect(result.current).toEqual({ tipo: 'cargando' })
    await waitFor(() => expect(result.current).toEqual({ tipo: 'sin-sesion' }))
  })

  it('con sesión la devuelve', async () => {
    auth.sesion = sesion('uid-1')
    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current).toEqual({ tipo: 'con-sesion', session: auth.sesion }))
  })

  it('se actualiza con los cambios de esta app', async () => {
    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current.tipo).toBe('sin-sesion'))

    act(() => auth.emitir('SIGNED_IN', sesion('uid-1')))

    expect(result.current.tipo).toBe('con-sesion')
  })

  it('al volver a la pestaña relee la cookie (logout en otra app)', async () => {
    auth.sesion = sesion('uid-1')
    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current.tipo).toBe('con-sesion'))

    auth.sesion = null
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => expect(result.current).toEqual({ tipo: 'sin-sesion' }))
  })

  it('si no se puede leer la sesión, queda sin sesión', async () => {
    auth.getSession.mockRejectedValueOnce(new Error('cookie ilegible'))
    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current).toEqual({ tipo: 'sin-sesion' }))
  })

  it('al desmontarse deja de escuchar', async () => {
    const { unmount } = renderHook(() => useSession())
    await waitFor(() => expect(auth.getSession).toHaveBeenCalled())
    unmount()
    expect(auth.oyentes()).toBe(0)
  })
})
