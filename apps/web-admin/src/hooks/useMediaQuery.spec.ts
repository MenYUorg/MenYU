import { act, renderHook } from '@testing-library/react'
import { useMediaQuery } from './useMediaQuery'
import { restaurarPantalla, simularPantalla } from '../test/pantalla'

const ESCRITORIO = '(min-width: 768px)'

describe('useMediaQuery', () => {
  afterEach(restaurarPantalla)

  it('devuelve true si la pantalla cumple la consulta', () => {
    simularPantalla(1280)

    const { result } = renderHook(() => useMediaQuery(ESCRITORIO))

    expect(result.current).toBe(true)
  })

  it('devuelve false si la pantalla no la cumple', () => {
    simularPantalla(360)

    const { result } = renderHook(() => useMediaQuery(ESCRITORIO))

    expect(result.current).toBe(false)
  })

  it('se actualiza cuando cambia el ancho de la pantalla', () => {
    const pantalla = simularPantalla(360)
    const { result } = renderHook(() => useMediaQuery(ESCRITORIO))
    expect(result.current).toBe(false)

    act(() => pantalla.cambiarAncho(1024))
    expect(result.current).toBe(true)

    act(() => pantalla.cambiarAncho(500))
    expect(result.current).toBe(false)
  })

  it('devuelve false si el navegador no soporta matchMedia', () => {
    const { result } = renderHook(() => useMediaQuery(ESCRITORIO))

    expect(result.current).toBe(false)
  })

  it('deja de escuchar al desmontar', () => {
    const pantalla = simularPantalla(360)
    const { unmount } = renderHook(() => useMediaQuery(ESCRITORIO))
    expect(pantalla.escuchadoresActivos()).toBe(1)

    unmount()

    expect(pantalla.escuchadoresActivos()).toBe(0)
  })
})
