import { describe, expect, it } from 'vitest'
import { precioVigenteDe, tieneDescuento } from './precio'

describe('precioVigenteDe', () => {
  it('usa el precio vigente que manda el backend', () => {
    expect(precioVigenteDe({ precioBase: 1000, precioVigente: 800 })).toBe(800)
  })

  it('sin precio vigente (backend sin actualizar) usa el precio base, aunque llegue como texto', () => {
    expect(precioVigenteDe({ precioBase: 1000 })).toBe(1000)
    expect(precioVigenteDe({ precioBase: '1500' as unknown as number })).toBe(1500)
  })
})

describe('tieneDescuento', () => {
  it('con precio y porcentaje está en descuento', () => {
    expect(tieneDescuento({ precioDescuento: 800, porcentajeDescuento: 20 })).toBe(true)
  })

  it('si falta cualquiera de los dos, o vienen en null, no lo está', () => {
    expect(tieneDescuento({})).toBe(false)
    expect(tieneDescuento({ precioDescuento: 800 })).toBe(false)
    expect(tieneDescuento({ porcentajeDescuento: 20 })).toBe(false)
    expect(tieneDescuento({ precioDescuento: null, porcentajeDescuento: null })).toBe(false)
  })
})
