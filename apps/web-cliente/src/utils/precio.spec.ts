import { formatearPrecio, precioVigenteDe, tieneDescuento } from './precio'

describe('precio', () => {
  // Formato argentino de `Intl.NumberFormat('es-AR')`: punto para los miles, coma para los centavos y un espacio no
  // separable (U+00A0, escrito \u00a0 acá para que se vea) entre el "$" y el número.
  describe('formatearPrecio', () => {
    describe('un número entero se escribe sin decimales', () => {
      it.each([
        [150, '$\u00a0150'],
        [800, '$\u00a0800'],
        [9000, '$\u00a09.000'],
        [19600, '$\u00a019.600'],
      ])('%s es "%s"', (valor, esperado) => {
        expect(formatearPrecio(valor)).toBe(esperado)
      })

      it('el cero es "$ 0"', () => {
        expect(formatearPrecio(0)).toBe('$\u00a00')
      })

      it('los montos grandes llevan un punto cada tres cifras', () => {
        expect(formatearPrecio(1000)).toBe('$\u00a01.000')
        expect(formatearPrecio(1234567)).toBe('$\u00a01.234.567')
        expect(formatearPrecio(1000000000)).toBe('$\u00a01.000.000.000')
      })
    })

    describe('un número con centavos se escribe con dos decimales', () => {
      it.each([
        [1234.5, '$\u00a01.234,50'],
        [1500.75, '$\u00a01.500,75'],
        [0.5, '$\u00a00,50'],
        [0.05, '$\u00a00,05'],
      ])('%s es "%s"', (valor, esperado) => {
        expect(formatearPrecio(valor)).toBe(esperado)
      })

      it('no se corta a 0 decimales: $1.234,50 no pasa a "$ 1.235"', () => {
        expect(formatearPrecio(1234.5)).not.toBe(formatearPrecio(1235))
      })

      it('la parte de una cuenta dividida se redondea a centavos (6500 entre 3)', () => {
        expect(formatearPrecio(6500 / 3)).toBe('$\u00a02.166,67')
      })
    })

    describe('el redondeo a centavos decide si el número es entero', () => {
      it('el ruido de la coma flotante no agrega ",00" (2999,7 + 0,1 + 0,2 no da exactamente 3000)', () => {
        expect(formatearPrecio(3000.0000000004)).toBe('$\u00a03.000')
        expect(formatearPrecio(2999.7 + 0.1 + 0.2)).toBe('$\u00a03.000')
      })

      it('menos de medio centavo de diferencia es un entero', () => {
        expect(formatearPrecio(2999.999)).toBe('$\u00a03.000')
        expect(formatearPrecio(1000.004)).toBe('$\u00a01.000')
      })

      it('más de medio centavo ya es un monto con centavos', () => {
        expect(formatearPrecio(1000.006)).toBe('$\u00a01.000,01')
      })
    })

    describe('montos negativos', () => {
      it('llevan el signo antes del "$": "-$ 1.500" y "-$ 1.234,50"', () => {
        expect(formatearPrecio(-1500)).toBe('-$\u00a01.500')
        expect(formatearPrecio(-1234.5)).toBe('-$\u00a01.234,50')
      })

      it('lo que se redondea a cero no queda como "-$ 0"', () => {
        expect(formatearPrecio(-0.001)).toBe('$\u00a00')
        expect(formatearPrecio(-0)).toBe('$\u00a00')
      })
    })

    it('separa el "$" del número con un espacio no separable: no se corta entre dos líneas', () => {
      const precio = formatearPrecio(9000)

      expect(precio.charCodeAt(1)).toBe(0xa0)
      expect(precio).not.toContain(' ')
    })

    it('escribe lo mismo cuando se lo llama varias veces (los formateadores se reusan)', () => {
      expect(formatearPrecio(9000)).toBe(formatearPrecio(9000))
      expect(formatearPrecio(1234.5)).toBe(formatearPrecio(1234.5))
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
