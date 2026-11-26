import { ComandaParaListo, decidirListo, esComandaDeCocina, ItemParaListo, nadaPendiente } from './decidir-listo'

const COCINA: ComandaParaListo = { id: 'c-cocina', nombre: 'Cocina', activa: true }
const BARRA: ComandaParaListo = { id: 'c-barra', nombre: 'Barra', activa: true }
const POSTRES: ComandaParaListo = { id: 'c-postres', nombre: 'Postres', activa: true }
const VIEJA: ComandaParaListo = { id: 'c-vieja', nombre: 'Vieja', activa: false }
const TODAS = [COCINA, BARRA, POSTRES, VIEJA]
const AHORA = new Date('2026-11-26T15:00:00Z')

const item = (
  id: string,
  comandaId: string | null,
  extra: Partial<Pick<ItemParaListo, 'cantidad' | 'cantidadEditada' | 'listoEn'>> = {},
): ItemParaListo => ({ id, comandaId, cantidad: 1, cantidadEditada: null, listoEn: null, ...extra })

describe('esComandaDeCocina', () => {
  it.each(['cocina', 'Cocina', 'COCINA', '  Cocina  ', '\tcocina\n'])('"%s" es la de cocina', (nombre) => {
    expect(esComandaDeCocina(nombre)).toBe(true)
  })

  it.each(['Cocina Central', 'Cocina fría', 'Co cina', 'Barra', ''])('"%s" no lo es', (nombre) => {
    expect(esComandaDeCocina(nombre)).toBe(false)
  })
})

describe('decidirListo', () => {
  describe('sin comanda (pestaña "Todas" o el mozo)', () => {
    it('marca todo lo pendiente y cierra el pedido', () => {
      const items = [item('plato', 'c-cocina'), item('bebida', 'c-barra'), item('pan', null)]

      expect(decidirListo(items, TODAS, null)).toEqual({ marcar: ['plato', 'bebida', 'pan'], cerrar: true })
    })

    it('no vuelve a marcar lo que ya estaba listo ni las líneas eliminadas', () => {
      const items = [
        item('listo', 'c-barra', { listoEn: AHORA }),
        item('eliminado', 'c-cocina', { cantidad: 2, cantidadEditada: 0 }),
        item('pendiente', 'c-cocina'),
      ]

      expect(decidirListo(items, TODAS, null)).toEqual({ marcar: ['pendiente'], cerrar: true })
    })

    it('un pedido sin nada pendiente igual se cierra', () => {
      expect(decidirListo([item('a', 'c-barra', { listoEn: AHORA })], TODAS, null)).toEqual({ marcar: [], cerrar: true })
    })
  })

  describe('en la comanda de cocina', () => {
    it('cierra el pedido entero aunque las otras comandas no hayan marcado', () => {
      const items = [item('plato', 'c-cocina'), item('bebida', 'c-barra'), item('postre', 'c-postres')]

      expect(decidirListo(items, TODAS, 'c-cocina')).toEqual({ marcar: ['plato', 'bebida', 'postre'], cerrar: true })
    })

    it('los ítems sin comanda y los de una comanda inactiva son suyos', () => {
      const soloSinComanda = [item('pan', null), item('bebida', 'c-barra')]
      expect(decidirListo(soloSinComanda, TODAS, 'c-cocina')).toEqual({ marcar: ['pan', 'bebida'], cerrar: true })

      const soloInactiva = [item('viejo', 'c-vieja'), item('bebida', 'c-barra')]
      expect(decidirListo(soloInactiva, TODAS, 'c-cocina')).toEqual({ marcar: ['viejo', 'bebida'], cerrar: true })
    })

    it('si lo suyo ya estaba listo o eliminado no hace nada (aunque queden pendientes de otras comandas)', () => {
      const items = [
        item('plato', 'c-cocina', { listoEn: AHORA }),
        item('quitado', 'c-cocina', { cantidadEditada: 0 }),
        item('bebida', 'c-barra'),
      ]

      expect(decidirListo(items, TODAS, 'c-cocina')).toEqual({ marcar: [], cerrar: false })
    })

    it('el nombre se compara sin mayúsculas ni espacios, también si la comanda está inactiva', () => {
      const comandas = [{ id: 'k', nombre: '  COCINA ', activa: false }, BARRA]

      expect(decidirListo([item('plato', 'k'), item('bebida', 'c-barra')], comandas, 'k')).toEqual({
        marcar: ['plato', 'bebida'],
        cerrar: true,
      })
    })
  })

  describe('en otra comanda, con ítems de cocina en el pedido', () => {
    it('marca solo lo suyo y el pedido sigue en preparación', () => {
      const items = [item('plato', 'c-cocina'), item('cerveza', 'c-barra'), item('gin', 'c-barra'), item('flan', 'c-postres')]

      expect(decidirListo(items, TODAS, 'c-barra')).toEqual({ marcar: ['cerveza', 'gin'], cerrar: false })
    })

    it.each([
      ['un ítem sin comanda', item('pan', null)],
      ['un ítem de la comanda de cocina', item('plato', 'c-cocina')],
      ['un ítem de una comanda inactiva', item('viejo', 'c-vieja')],
    ])('%s cuenta como de cocina: nadie más que la cocina lo cierra', (_caso, deCocina) => {
      expect(decidirListo([deCocina, item('cerveza', 'c-barra')], TODAS, 'c-barra')).toEqual({
        marcar: ['cerveza'],
        cerrar: false,
      })
    })

    it('lo de cocina que ya estaba listo sigue contando: la cocina ya cerró el pedido o lo cerrará ella', () => {
      const items = [item('plato', 'c-cocina', { listoEn: AHORA }), item('cerveza', 'c-barra')]

      expect(decidirListo(items, TODAS, 'c-barra')).toEqual({ marcar: ['cerveza'], cerrar: false })
    })

    it('no marca los ítems de otras comandas, ni los de cocina', () => {
      const { marcar } = decidirListo([item('plato', 'c-cocina'), item('flan', 'c-postres'), item('gin', 'c-barra')], TODAS, 'c-barra')

      expect(marcar).toEqual(['gin'])
    })
  })

  describe('en otra comanda, sin ítems de cocina', () => {
    it('la primera comanda que marca cierra el pedido entero y marca también lo de las demás', () => {
      const items = [item('cerveza', 'c-barra'), item('flan', 'c-postres')]

      expect(decidirListo(items, TODAS, 'c-barra')).toEqual({ marcar: ['cerveza', 'flan'], cerrar: true })
    })

    it('un pedido de solo bebidas lo cierra la barra', () => {
      expect(decidirListo([item('cerveza', 'c-barra'), item('gin', 'c-barra')], TODAS, 'c-barra')).toEqual({
        marcar: ['cerveza', 'gin'],
        cerrar: true,
      })
    })

    it('las líneas de cocina eliminadas no cuentan: sin cocina vigente, cierra', () => {
      const items = [item('plato', 'c-cocina', { cantidad: 2, cantidadEditada: 0 }), item('cerveza', 'c-barra')]

      expect(decidirListo(items, TODAS, 'c-barra')).toEqual({ marcar: ['cerveza'], cerrar: true })
    })

    it('si no hay una comanda llamada cocina, solo cuentan como de cocina los ítems sin comanda o de comandas inactivas', () => {
      const sinCocina = [{ id: 'c-central', nombre: 'Cocina Central', activa: true }, BARRA]

      expect(decidirListo([item('plato', 'c-central'), item('cerveza', 'c-barra')], sinCocina, 'c-barra')).toEqual({
        marcar: ['plato', 'cerveza'],
        cerrar: true,
      })
      expect(decidirListo([item('pan', null), item('cerveza', 'c-barra')], sinCocina, 'c-barra')).toEqual({
        marcar: ['cerveza'],
        cerrar: false,
      })
    })
  })

  describe('lo que ya estaba hecho', () => {
    it('una comanda sin nada pendiente (un segundo clic) no hace nada', () => {
      const items = [item('plato', 'c-cocina'), item('cerveza', 'c-barra', { listoEn: AHORA })]

      expect(decidirListo(items, TODAS, 'c-barra')).toEqual({ marcar: [], cerrar: false })
    })

    it('una comanda sin ítems en el pedido no hace nada', () => {
      expect(decidirListo([item('plato', 'c-cocina')], TODAS, 'c-postres')).toEqual({ marcar: [], cerrar: false })
    })

    it('una línea eliminada (cantidad vigente 0) no es pendiente ni se marca', () => {
      const items = [item('plato', 'c-cocina'), item('quitada', 'c-barra', { cantidad: 3, cantidadEditada: 0 })]

      expect(decidirListo(items, TODAS, 'c-barra')).toEqual({ marcar: [], cerrar: false })
    })

    it('una línea editada a otra cantidad sigue siendo pendiente', () => {
      const items = [item('plato', 'c-cocina'), item('cerveza', 'c-barra', { cantidad: 3, cantidadEditada: 1 })]

      expect(decidirListo(items, TODAS, 'c-barra')).toEqual({ marcar: ['cerveza'], cerrar: false })
    })
  })

  it('no muta los ítems ni las comandas', () => {
    const items = [item('plato', 'c-cocina'), item('cerveza', 'c-barra')]
    const copiaItems = structuredClone(items)
    const copiaComandas = structuredClone(TODAS)

    decidirListo(items, TODAS, 'c-barra')

    expect(items).toEqual(copiaItems)
    expect(TODAS).toEqual(copiaComandas)
  })
})

describe('nadaPendiente', () => {
  it('es verdadero si todas las líneas vigentes están listas', () => {
    expect(nadaPendiente([item('a', 'c-barra', { listoEn: AHORA }), item('b', null, { listoEn: AHORA })])).toBe(true)
  })

  it('es falso si alguna línea vigente sigue pendiente', () => {
    expect(nadaPendiente([item('a', 'c-barra', { listoEn: AHORA }), item('b', 'c-cocina')])).toBe(false)
  })

  it('las líneas eliminadas no cuentan, tengan o no la marca', () => {
    const items = [
      item('a', 'c-barra', { listoEn: AHORA }),
      item('quitada', 'c-cocina', { cantidad: 2, cantidadEditada: 0 }),
      item('cero', 'c-cocina', { cantidad: 0 }),
    ]

    expect(nadaPendiente(items)).toBe(true)
  })

  it('una línea editada a otra cantidad, sin marca, sigue pendiente', () => {
    expect(nadaPendiente([item('a', 'c-barra', { cantidad: 3, cantidadEditada: 1 })])).toBe(false)
  })

  it('sin líneas no hay nada pendiente', () => {
    expect(nadaPendiente([])).toBe(true)
  })
})
