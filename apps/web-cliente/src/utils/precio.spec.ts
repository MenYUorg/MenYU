import { formatearPrecio, precioVigenteDe, tieneDescuento } from './precio'

describe('precio', () => {
  describe('formatearPrecio', () => {
    it('escribe el monto con $ y dos decimales', () => {
      expect(formatearPrecio(1500)).toBe('$1500.00')
      expect(formatearPrecio(1234.5)).toBe('$1234.50')
    })
  })

  describe('precioVigenteDe', () => {
    it('es el precio vigente que manda el backend', () => {
      expect(precioVigenteDe({ precioBase: 1000, precioVigente: 800 })).toBe(800)
    })

    it('si la respuesta no trae precio vigente (backend sin actualizar), usa el precio base', () => {
      expect(precioVigenteDe({ precioBase: 1000 })).toBe(1000)
    })

    it('acepta el precio base como texto (Decimal serializado por Prisma)', () => {
      expect(precioVigenteDe({ precioBase: '1250.00' as unknown as number })).toBe(1250)
    })
  })

  describe('tieneDescuento', () => {
    it('es true cuando vienen el precio con descuento y el porcentaje', () => {
      expect(tieneDescuento({ precioDescuento: 800, porcentajeDescuento: 20 })).toBe(true)
    })

    it('es false cuando el plato no está en descuento', () => {
      expect(tieneDescuento({ precioDescuento: null, porcentajeDescuento: null })).toBe(false)
    })

    it('es false si falta alguno de los dos datos', () => {
      expect(tieneDescuento({ precioDescuento: 800, porcentajeDescuento: null })).toBe(false)
      expect(tieneDescuento({ precioDescuento: null, porcentajeDescuento: 20 })).toBe(false)
    })

    it('es false con una respuesta vieja, sin campos de descuento', () => {
      expect(tieneDescuento({})).toBe(false)
    })
  })
})
