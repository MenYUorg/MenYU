import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
  assertPrecioBaseCompatible,
  derivarDescuento,
  formatearPesos,
  porcentajeDesdePrecio,
  precioDesdePorcentaje,
  precioVigente,
} from './descuento.util'

// Los casos de las tablas de precio y porcentaje se repiten en web-admin (utils/descuento.spec.ts):
// la vista previa del formulario tiene que dar exactamente lo mismo que el backend.

describe('precioDesdePorcentaje', () => {
  it.each([
    // [precio base, %, precio con descuento]
    [1500, 10, 1350],
    [1500, 20, 1200],
    [1500, 50, 750],
    [999, 15, 849], // 849,15 -> baja
    [1005, 50, 503], // 502,5 -> el .5 sube
    [3, 50, 2], // 1,5 -> sube
    [2, 50, 1],
    [100, 1, 99],
    [100, 99, 1],
    [1000, 99, 10],
    [1234.56, 15, 1049], // base con centavos: 1049,376
    [1234.56, 85, 185], // 185,184
    [1234.5, 50, 617], // 617,25
    [800, 25, 600],
  ])('base %d con %d%% queda en %d', (base, porcentaje, esperado) => {
    expect(precioDesdePorcentaje(base, porcentaje)).toBe(esperado)
  })

  it.each([0, 100, -5, 10.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rechaza el porcentaje %p (tiene que ser entero de 1 a 99)',
    (porcentaje) => {
      expect(() => precioDesdePorcentaje(1500, porcentaje)).toThrow(BadRequestException)
      expect(() => precioDesdePorcentaje(1500, porcentaje)).toThrow(
        'El porcentaje tiene que ser un número entero entre 1 y 99',
      )
    },
  )

  it('si el redondeo deja el precio igual al base, falla y lo explica', () => {
    // 10 con 1% = 9,9 -> 10: el precio no cambia
    expect(() => precioDesdePorcentaje(10, 1)).toThrow(BadRequestException)
    expect(() => precioDesdePorcentaje(10, 1)).toThrow('Con 1% el precio no cambia (queda en $10)')
    expect(() => precioDesdePorcentaje(50, 1)).toThrow('el precio no cambia') // 49,5 -> 50
  })

  it('si el redondeo deja el precio en $0, falla y lo explica', () => {
    // 1 con 99% = 0,01 -> 0
    expect(() => precioDesdePorcentaje(1, 99)).toThrow(BadRequestException)
    expect(() => precioDesdePorcentaje(1, 99)).toThrow('Con 99% el precio queda en $0')
    expect(() => precioDesdePorcentaje(40, 99)).toThrow('queda en $0') // 0,4 -> 0
  })

  it('un precio base de 0 no admite ningún descuento', () => {
    expect(() => precioDesdePorcentaje(0, 10)).toThrow(BadRequestException)
    expect(() => precioDesdePorcentaje(0, 99)).toThrow(BadRequestException)
  })

  it('el .5 sube de manera exacta aunque el base tenga centavos', () => {
    // 2000,10 al 50% = 1000,05 -> 1000; 2001 al 50% = 1000,5 -> 1001
    expect(precioDesdePorcentaje(2000.1, 50)).toBe(1000)
    expect(precioDesdePorcentaje(2001, 50)).toBe(1001)
  })
})

describe('porcentajeDesdePrecio', () => {
  it.each([
    // [precio base, precio con descuento, %]
    [1500, 1200, 20],
    [1500, 1350, 10],
    [1500, 750, 50],
    [1000, 995, 1], // 0,5% -> el .5 sube a 1
    [1000, 990, 1],
    [1000, 10, 99],
    [1000, 6, 99], // 99,4%
    [3, 1, 67], // 66,67%
    [999, 849, 15], // 15,02%
    [1234.56, 1049, 15], // base con centavos: 15,03%
    [100, 99, 1],
    [100, 1, 99],
  ])('base %d con precio %d es %d%%', (base, precio, esperado) => {
    expect(porcentajeDesdePrecio(base, precio)).toBe(esperado)
  })

  it('un precio que representa menos del 1% falla', () => {
    expect(() => porcentajeDesdePrecio(1000, 999)).toThrow(BadRequestException)
    expect(() => porcentajeDesdePrecio(1000, 999)).toThrow('El descuento es menor al 1%')
  })

  it('un precio que representa el 100% (redondeado) falla', () => {
    expect(() => porcentajeDesdePrecio(1000, 5)).toThrow('El descuento no puede ser del 100%') // 99,5%
    expect(() => porcentajeDesdePrecio(100000, 1)).toThrow('El descuento no puede ser del 100%')
  })

  it.each([
    ['igual al base', 1000, 1000],
    ['mayor al base', 1000, 1200],
    ['cero', 1000, 0],
    ['negativo', 1000, -50],
    ['con decimales', 1000, 899.5],
    ['no numérico', 1000, Number.NaN],
  ])('rechaza un precio %s', (_caso, base, precio) => {
    expect(() => porcentajeDesdePrecio(base, precio)).toThrow(BadRequestException)
    expect(() => porcentajeDesdePrecio(base, precio)).toThrow(
      'El precio con descuento tiene que ser un número entero mayor a 0 y menor al precio original',
    )
  })

  it('con precio base 0 no hay descuento posible', () => {
    expect(() => porcentajeDesdePrecio(0, 1)).toThrow(BadRequestException)
  })

  it('el mensaje de error incluye el precio original formateado', () => {
    expect(() => porcentajeDesdePrecio(1500, 2000)).toThrow('($1.500)')
  })
})

describe('precio y porcentaje son inversos cuando el redondeo no interviene', () => {
  it.each([
    [1000, 10],
    [1000, 25],
    [2000, 35],
    [4200, 50],
    [8000, 5],
  ])('base %d, %d%%', (base, porcentaje) => {
    const precio = precioDesdePorcentaje(base, porcentaje)

    expect(porcentajeDesdePrecio(base, precio)).toBe(porcentaje)
  })
})

describe('derivarDescuento', () => {
  it('sin descuento: el precio vigente es el base y no hay porcentaje', () => {
    expect(derivarDescuento(1500, null)).toEqual({
      precioDescuento: null,
      porcentajeDescuento: null,
      precioVigente: 1500,
    })
    expect(derivarDescuento(1500, undefined)).toEqual({
      precioDescuento: null,
      porcentajeDescuento: null,
      precioVigente: 1500,
    })
  })

  it('con descuento: devuelve el precio, el porcentaje calculado y el precio vigente', () => {
    expect(derivarDescuento(1500, 1200)).toEqual({
      precioDescuento: 1200,
      porcentajeDescuento: 20,
      precioVigente: 1200,
    })
  })

  it('acepta el precio base como Decimal de Prisma o como texto, y devuelve números', () => {
    const conDecimal = derivarDescuento(new Prisma.Decimal('1500.00'), 1200)
    const conTexto = derivarDescuento('1500.00', 1200)

    expect(conDecimal).toEqual({ precioDescuento: 1200, porcentajeDescuento: 20, precioVigente: 1200 })
    expect(conTexto).toEqual(conDecimal)
    expect(typeof conDecimal.precioVigente).toBe('number')
    expect(typeof derivarDescuento(new Prisma.Decimal('1500.00'), null).precioVigente).toBe('number')
  })

  it.each([
    ['igual al base', 1500, 1500],
    ['mayor al base', 1500, 2000],
    ['cero', 1500, 0],
    ['porcentaje menor a 1%', 1000, 999],
    ['porcentaje de 100%', 1000, 5],
  ])('un descuento guardado que no es válido (%s) se ignora y se cobra el base', (_caso, base, precio) => {
    expect(derivarDescuento(base, precio)).toEqual({
      precioDescuento: null,
      porcentajeDescuento: null,
      precioVigente: base,
    })
  })
})

describe('precioVigente', () => {
  it('devuelve el precio con descuento si el ítem lo tiene', () => {
    expect(precioVigente({ precioBase: new Prisma.Decimal('2000'), precioDescuento: 1500 })).toBe(1500)
  })

  it('devuelve el precio base si no hay descuento (o no se informa)', () => {
    expect(precioVigente({ precioBase: new Prisma.Decimal('2000'), precioDescuento: null })).toBe(2000)
    expect(precioVigente({ precioBase: 2000 })).toBe(2000)
    expect(precioVigente({ precioBase: '1234.50' })).toBe(1234.5)
  })
})

describe('assertPrecioBaseCompatible (cambio de precio base con descuento activo)', () => {
  it('sin descuento activo no valida nada', () => {
    expect(() => assertPrecioBaseCompatible(1, null)).not.toThrow()
    expect(() => assertPrecioBaseCompatible(0, undefined)).not.toThrow()
  })

  it.each([
    [1000, 'sube a un valor normal'],
    [905, 'baja, pero el descuento queda en 1%'],
    [100000, 'sube mucho, pero el descuento queda en 99%'],
  ])('con descuento de 900: un precio base de %d (%s) es válido', (nuevoBase) => {
    expect(() => assertPrecioBaseCompatible(nuevoBase, 900)).not.toThrow()
  })

  it.each([900, 800, 0])('un precio base de %d (menor o igual al precio con descuento) falla', (nuevoBase) => {
    expect(() => assertPrecioBaseCompatible(nuevoBase, 900)).toThrow(BadRequestException)
    expect(() => assertPrecioBaseCompatible(nuevoBase, 900)).toThrow(
      'tiene que ser mayor al precio con descuento ($900)',
    )
  })

  it('si el porcentaje quedaría por debajo de 1% o en 100%, falla', () => {
    expect(() => assertPrecioBaseCompatible(901, 900)).toThrow('dejaría de ser válido') // 0,11%
    expect(() => assertPrecioBaseCompatible(200000, 900)).toThrow('dejaría de ser válido') // 99,55%
  })
})

describe('formatearPesos', () => {
  it.each([
    [1500, '$1.500'],
    [1234.5, '$1.234,5'],
    [1234.56, '$1.234,56'],
    [0, '$0'],
    [800, '$800'],
  ])('%d -> %s', (valor, esperado) => {
    expect(formatearPesos(valor)).toBe(esperado)
  })
})
