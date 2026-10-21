import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clienteAuth } from './cliente'
import { alVolverALaPestana, INTERVALO_DE_REVALIDACION_MS, useRevalidarSesion } from './revalidacion'
import { crearAuthSimulado, sesion, type AuthSimulado } from './test/authSimulado'

vi.mock('./cliente', () => ({ clienteAuth: vi.fn() }))

let auth: AuthSimulado

function visibilidad(estado: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: estado, configurable: true })
}

function volverALaPestana() {
  visibilidad('visible')
  document.dispatchEvent(new Event('visibilitychange'))
}

/** Deja correr las promesas pendientes (getSession, getUser) sin avanzar los timers. */
async function esperar() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  auth = crearAuthSimulado(sesion('uid-1'))
  vi.mocked(clienteAuth).mockReturnValue({ auth } as never)
  visibilidad('visible')
})

describe('alVolverALaPestana', () => {
  it('avisa al recuperar el foco o volver a estar visible, no al ocultarse', () => {
    const revisar = vi.fn()
    const dejar = alVolverALaPestana(revisar)

    window.dispatchEvent(new Event('focus'))
    expect(revisar).toHaveBeenCalledTimes(1)

    visibilidad('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(revisar).toHaveBeenCalledTimes(1)

    volverALaPestana()
    expect(revisar).toHaveBeenCalledTimes(2)

    dejar()
    window.dispatchEvent(new Event('focus'))
    expect(revisar).toHaveBeenCalledTimes(2)
  })
})

describe('useRevalidarSesion', () => {
  const acciones = () => ({ alPerderla: vi.fn(), alCambiarDeUsuario: vi.fn() })

  afterEach(() => vi.useRealTimers())

  it('sin usuario no escucha nada', () => {
    renderHook(() => useRevalidarSesion(null, acciones()))
    expect(auth.onAuthStateChange).not.toHaveBeenCalled()
  })

  it('si al volver a la pestaña ya no hay sesión (logout en otra app), avisa una sola vez', async () => {
    const a = acciones()
    renderHook(() => useRevalidarSesion('uid-1', a))

    auth.sesion = null
    volverALaPestana()
    window.dispatchEvent(new Event('focus'))
    await esperar()

    expect(a.alPerderla).toHaveBeenCalledTimes(1)
    expect(auth.getUser).not.toHaveBeenCalled()
  })

  it('con la misma sesión no hace nada', async () => {
    const a = acciones()
    renderHook(() => useRevalidarSesion('uid-1', a))

    volverALaPestana()
    await esperar()

    expect(a.alPerderla).not.toHaveBeenCalled()
    expect(a.alCambiarDeUsuario).not.toHaveBeenCalled()
  })

  it('si en otra pestaña entró otra cuenta, avisa el cambio de usuario', async () => {
    const a = acciones()
    renderHook(() => useRevalidarSesion('uid-1', a))

    auth.sesion = sesion('uid-2')
    volverALaPestana()
    await esperar()

    expect(a.alCambiarDeUsuario).toHaveBeenCalledTimes(1)
    expect(a.alPerderla).not.toHaveBeenCalled()
  })

  it('cada intervalo le pregunta a Supabase; si rechaza la sesión, la cierra y avisa', async () => {
    vi.useFakeTimers()
    const a = acciones()
    renderHook(() => useRevalidarSesion('uid-1', a))
    auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthApiError('Session not found', 403, 'session_not_found'),
    } as never)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_DE_REVALIDACION_MS)
    })

    expect(auth.getUser).toHaveBeenCalledTimes(1)
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(a.alPerderla).toHaveBeenCalledTimes(1)
  })

  it('si Supabase no responde (sin red), no cierra la sesión', async () => {
    vi.useFakeTimers()
    const a = acciones()
    renderHook(() => useRevalidarSesion('uid-1', a, 1000))
    auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    } as never)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(auth.signOut).not.toHaveBeenCalled()
    expect(a.alPerderla).not.toHaveBeenCalled()
  })

  it('si getSession falla, no avisa nada (se reintenta la próxima vez)', async () => {
    const a = acciones()
    renderHook(() => useRevalidarSesion('uid-1', a))
    auth.getSession.mockRejectedValueOnce(new Error('cookie ilegible'))

    volverALaPestana()
    await esperar()

    expect(a.alPerderla).not.toHaveBeenCalled()
  })

  it('un SIGNED_OUT de esta app avisa enseguida', () => {
    const a = acciones()
    renderHook(() => useRevalidarSesion('uid-1', a))

    act(() => auth.emitir('SIGNED_OUT', null))

    expect(a.alPerderla).toHaveBeenCalledTimes(1)
  })

  it('al desmontarse deja de escuchar y de revisar', async () => {
    vi.useFakeTimers()
    const a = acciones()
    const { unmount } = renderHook(() => useRevalidarSesion('uid-1', a, 1000))
    unmount()

    expect(auth.oyentes()).toBe(0)
    auth.sesion = null
    volverALaPestana()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(auth.getSession).not.toHaveBeenCalled()
    expect(a.alPerderla).not.toHaveBeenCalled()
  })

  it('usa las acciones de la última renderización', async () => {
    const primera = acciones()
    const segunda = acciones()
    const { rerender } = renderHook(({ a }) => useRevalidarSesion('uid-1', a), { initialProps: { a: primera } })
    rerender({ a: segunda })

    auth.sesion = null
    volverALaPestana()
    await esperar()

    expect(primera.alPerderla).not.toHaveBeenCalled()
    expect(segunda.alPerderla).toHaveBeenCalledTimes(1)
  })
})
