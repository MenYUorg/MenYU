import {
  formatearPesos,
  motivoPrecioBaseIncompatible,
  parsearEntero,
  porcentajeDesdePrecio,
  precioDesdePorcentaje,
  seRedondea,
} from './descuento'

// Las tablas de precio y porcentaje son las mismas que las de apps/backend/src/items/descuento.util.spec.ts:
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
    expect(precioDesdePorcentaje(base, porcentaje)).toEqual({ ok: true, valor: esperado })
  })

  it.each([0, 100, -5, 10.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rechaza el porcentaje %p (tiene que ser entero de 1 a 99)',
    (porcentaje) => {
      const r = precioDesdePorcentaje(1500, porcentaje)

      expect(r).toEqual({ ok: false, motivo: 'El porcentaje tiene que ser un número entero entre 1 y 99' })
    },
  )

  it('si el redondeo deja el precio igual al base, falla y lo explica', () => {
    expect(precioDesdePorcentaje(10, 1)).toEqual({
      ok: false,
      motivo: 'Con 1% el precio no cambia (queda en $10). Probá con un porcentaje mayor.',
    })
    expect(precioDesdePorcentaje(50, 1)).toMatchObject({ ok: false }) // 49,5 -> 50
  })

  it('si el redondeo deja el precio en $0, falla y lo explica', () => {
    expect(precioDesdePorcentaje(1, 99)).toEqual({
      ok: false,
      motivo: 'Con 99% el precio queda en $0. Probá con un porcentaje menor.',
    })
    expect(precioDesdePorcentaje(40, 99)).toMatchObject({ ok: false }) // 0,4 -> 0
  })

  it('un precio base de 0 no admite ningún descuento', () => {
    expect(precioDesdePorcentaje(0, 10)).toMatchObject({ ok: false })
    expect(precioDesdePorcentaje(0, 99)).toMatchObject({ ok: false })
  })

  it('el .5 sube de manera exacta aunque el base tenga centavos', () => {
    expect(precioDesdePorcentaje(2000.1, 50)).toEqual({ ok: true, valor: 1000 })
    expect(precioDesdePorcentaje(2001, 50)).toEqual({ ok: true, valor: 1001 })
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
    expect(porcentajeDesdePrecio(base, precio)).toEqual({ ok: true, valor: esperado })
  })

  it('un precio que representa menos del 1% falla', () => {
    expect(porcentajeDesdePrecio(1000, 999)).toEqual({
      ok: false,
      motivo: 'El descuento es menor al 1%. Cargá un precio más bajo.',
    })
  })

  it('un precio que representa el 100% (redondeado) falla', () => {
    expect(porcentajeDesdePrecio(1000, 5)).toEqual({
      ok: false,
      motivo: 'El descuento no puede ser del 100%. Cargá un precio más alto.',
    }) // 99,5%
    expect(porcentajeDesdePrecio(100000, 1)).toMatchObject({ ok: false })
  })

  it.each([
    ['igual al base', 1000, 1000],
    ['mayor al base', 1000, 1200],
    ['cero', 1000, 0],
    ['negativo', 1000, -50],
    ['con decimales', 1000, 899.5],
    ['no numérico', 1000, Number.NaN],
  ])('rechaza un precio %s', (_caso, base, precio) => {
    const r = porcentajeDesdePrecio(base, precio)

    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.motivo).toContain(
      'El precio con descuento tiene que ser un número entero mayor a 0 y menor al precio original',
    )
  })

  it('con precio base 0 no hay descuento posible', () => {
    expect(porcentajeDesdePrecio(0, 1)).toMatchObject({ ok: false })
  })

  it('el mensaje de error incluye el precio original formateado', () => {
    const r = porcentajeDesdePrecio(1500, 2000)

    expect(r.ok ? '' : r.motivo).toContain('($1.500)')
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

    expect(precio.ok && porcentajeDesdePrecio(base, precio.valor)).toEqual({ ok: true, valor: porcentaje })
  })
})

describe('seRedondea', () => {
  it.each([
    [1500, 10, false], // 1350 justo
    [999, 15, true], // 849,15
    [1005, 50, true], // 502,5
    [800, 25, false], // 600 justo
    [1234.56, 15, true],
  ])('base %d con %d%% -> %s', (base, porcentaje, esperado) => {
    expect(seRedondea(base, porcentaje)).toBe(esperado)
  })
})

describe('motivoPrecioBaseIncompatible (cambio de precio base con descuento activo)', () => {
  it('sin descuento activo no hay motivo para rechazar', () => {
    expect(motivoPrecioBaseIncompatible(1, null)).toBeNull()
    expect(motivoPrecioBaseIncompatible(0, undefined)).toBeNull()
  })

  it.each([1000, 905, 100000])('con descuento de 900: un precio base de %d es válido', (nuevoBase) => {
    expect(motivoPrecioBaseIncompatible(nuevoBase, 900)).toBeNull()
  })

  it.each([900, 800, 0])('un precio base de %d (menor o igual al precio con descuento) se rechaza', (nuevoBase) => {
    expect(motivoPrecioBaseIncompatible(nuevoBase, 900)).toContain('tiene que ser mayor al precio con descuento ($900)')
  })

  it('si el porcentaje quedaría por debajo de 1% o en 100%, se rechaza', () => {
    expect(motivoPrecioBaseIncompatible(901, 900)).toContain('dejaría de ser válido')
    expect(motivoPrecioBaseIncompatible(200000, 900)).toContain('dejaría de ser válido')
  })
})

describe('parsearEntero', () => {
  it.each([
    ['1200', 1200],
    ['  35 ', 35],
    ['0', 0],
    ['007', 7],
  ])('"%s" -> %d', (texto, esperado) => {
    expect(parsearEntero(texto)).toBe(esperado)
  })

  it.each(['', '   ', '12.5', '-3', 'abc', '1e3', '1,5', '+4'])('"%s" no es un entero', (texto) => {
    expect(parsearEntero(texto)).toBeNull()
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
