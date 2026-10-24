import { act, renderHook } from '@testing-library/react'
import { cuentaDePrueba, sesionDeSupabase } from '../test/authClient'
import { crearTokenJwt } from '../test/fixtures'
import { useCuenta } from './useCuenta'

const iniciarSesionAnterior = (nombre: string) =>
  localStorage.setItem('menyu_access_token', crearTokenJwt({ sub: 'cli-1', tipo: 'cliente', nombre }))

describe('useCuenta', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('sin ninguna cuenta: no carga y no hay cuenta', () => {
    const { result } = renderHook(() => useCuenta())

    expect(result.current.cargando).toBe(false)
    expect(result.current.cuenta).toBeNull()
  })

  it('con la sesión de Supabase, esa cuenta', () => {
    cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Ana', email: 'ana@gmail.com' })

    const { result } = renderHook(() => useCuenta())

    expect(result.current.cuenta).toEqual({ nombre: 'Ana', email: 'ana@gmail.com', origen: 'supabase' })
  })

  it('sin sesión de Supabase, la del login anterior', () => {
    iniciarSesionAnterior('Marina')

    const { result } = renderHook(() => useCuenta())

    expect(result.current.cuenta?.origen).toBe('anterior')
  })

  it('mientras se lee la sesión de Supabase carga, salvo que ya haya una cuenta del login anterior', () => {
    cuentaDePrueba.cargando = true
    const sinCuenta = renderHook(() => useCuenta())
    expect(sinCuenta.result.current.cargando).toBe(true)
    sinCuenta.unmount()

    iniciarSesionAnterior('Marina')
    const conAnterior = renderHook(() => useCuenta())
    expect(conAnterior.result.current.cargando).toBe(false)
    expect(conAnterior.result.current.cuenta?.nombre).toBe('Marina')
  })

  it('cerrarSesion cierra la cuenta y vuelve a pintar sin ella', async () => {
    iniciarSesionAnterior('Marina')
    cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Ana' })
    const { result } = renderHook(() => useCuenta())

    await act(async () => {
      await result.current.cerrarSesion()
    })

    expect(result.current.cuenta).toBeNull()
  })
})
