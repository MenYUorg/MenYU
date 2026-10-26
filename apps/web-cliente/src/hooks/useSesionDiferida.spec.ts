import { act, renderHook, waitFor } from '@testing-library/react'
import { clienteAuthSimulado, cookieDeSesionRancia, cuentaDePrueba, sesionDeSupabase } from '../test/authClient'
import { useSesionDiferida } from './useSesionDiferida'

// supabase-js pesa unos 64 kB con gzip y se carga con un `import()`, así que acá se comprueba lo que decide si se
// carga o no, y que la sesión llegue igual que con el `useSession` del paquete.
describe('useSesionDiferida', () => {
  it('con cookie de sesión la lee: pasa de cargando a con-sesion', async () => {
    cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Ana' })

    const { result } = renderHook(() => useSesionDiferida())

    expect(result.current.tipo).toBe('cargando')
    await waitFor(() => expect(result.current.tipo).toBe('con-sesion'))
  })

  it('sin cookie no carga el paquete ni pregunta nada: sin-sesion desde el primer render', () => {
    const { result } = renderHook(() => useSesionDiferida())

    expect(result.current.tipo).toBe('sin-sesion')
    expect(clienteAuthSimulado).not.toHaveBeenCalled()
  })

  it('donde la app no comparte la sesión de web-auth tampoco carga nada, aunque haya cookie', () => {
    cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Ana' })
    vi.stubEnv('VITE_SUPABASE_URL', '')

    const { result } = renderHook(() => useSesionDiferida())

    expect(result.current.tipo).toBe('sin-sesion')
    expect(clienteAuthSimulado).not.toHaveBeenCalled()
  })

  // El token venció, o es de otro proyecto: la cookie está pero no hay sesión. Es el único caso en que se paga el
  // chunk para nada, y tiene que terminar en `sin-sesion`, no quedarse cargando.
  it('con una cookie que ya no sirve carga el paquete y queda sin sesión', async () => {
    cookieDeSesionRancia()

    const { result } = renderHook(() => useSesionDiferida())

    expect(result.current.tipo).toBe('cargando')
    await waitFor(() => expect(result.current.tipo).toBe('sin-sesion'))
    expect(clienteAuthSimulado).toHaveBeenCalled()
  })

  it('si no se puede abrir el cliente de Supabase, queda sin sesión y la app sigue andando', async () => {
    cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Ana' })
    clienteAuthSimulado.mockImplementationOnce(() => {
      throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY')
    })

    const { result } = renderHook(() => useSesionDiferida())

    await waitFor(() => expect(result.current.tipo).toBe('sin-sesion'))
  })

  it('un cambio de sesión en otra app de MenYU llega (la cookie es compartida)', async () => {
    cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Ana' })
    const { result } = renderHook(() => useSesionDiferida())
    await waitFor(() => expect(result.current.tipo).toBe('con-sesion'))

    act(() => {
      cuentaDePrueba.session = null
    })

    await waitFor(() => expect(result.current.tipo).toBe('sin-sesion'))
  })

  it('desmontarlo mientras carga no deja nada escuchando ni avisa de más', async () => {
    cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Ana' })

    const { unmount } = renderHook(() => useSesionDiferida())
    unmount()

    // Si la suscripción quedara viva, este cambio intentaría pintar un componente desmontado.
    await act(async () => {
      cuentaDePrueba.session = null
    })
  })
})
