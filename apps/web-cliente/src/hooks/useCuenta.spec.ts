import { act, renderHook } from '@testing-library/react'
import { cuentaDePrueba, sesionDeSupabase } from '../test/authClient'
import { useCuenta } from './useCuenta'

describe('useCuenta', () => {
  it('sin cuenta: no carga y no hay cuenta', () => {
    const { result } = renderHook(() => useCuenta())

    expect(result.current.cargando).toBe(false)
    expect(result.current.cuenta).toBeNull()
  })

  it('con la sesión de Supabase, esa cuenta', () => {
    cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Ana', email: 'ana@gmail.com' })

    const { result } = renderHook(() => useCuenta())

    expect(result.current.cuenta).toEqual({ nombre: 'Ana', email: 'ana@gmail.com' })
  })

  it('mientras se lee la sesión, carga', () => {
    cuentaDePrueba.cargando = true

    const { result } = renderHook(() => useCuenta())

    expect(result.current.cargando).toBe(true)
    expect(result.current.cuenta).toBeNull()
  })

  it('cerrarSesion cierra la cuenta y vuelve a pintar sin ella', async () => {
    cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Ana' })
    const { result } = renderHook(() => useCuenta())
    expect(result.current.cuenta?.nombre).toBe('Ana')

    await act(async () => {
      await result.current.cerrarSesion()
    })

    expect(result.current.cuenta).toBeNull()
  })

  // La cookie es de dominio compartido: si cierran sesión en web-admin, esta pantalla también se queda sin cuenta.
  it('una sesión que aparece o se va en otra app también repinta', () => {
    const { result } = renderHook(() => useCuenta())
    expect(result.current.cuenta).toBeNull()

    act(() => {
      cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Marina' })
    })

    expect(result.current.cuenta?.nombre).toBe('Marina')
  })
})
