import {
  columnaDelPedido,
  comandasListas,
  esComandaDeCocina,
  idsActivos,
  itemsParaImprimir,
  itemsPropios,
  itemVisible,
  ocultosVigentes,
  partirItems,
  pedidoParaImprimir,
  pestaniaVigente,
  puedeMarcarListo,
  tieneAlgoVisible,
  type ComandaDeCocina,
  type ItemConComanda,
} from './comandasDeCocina'

const COCINA: ComandaDeCocina = { id: 'c-cocina', nombre: 'Cocina', activa: true }
const BARRA: ComandaDeCocina = { id: 'c-barra', nombre: 'Barra', activa: true }
const POSTRES: ComandaDeCocina = { id: 'c-postres', nombre: 'Postres', activa: true }
const VIEJA: ComandaDeCocina = { id: 'c-vieja', nombre: 'Vieja', activa: false }
const COMANDAS = [COCINA, BARRA, POSTRES, VIEJA]
const ACTIVAS = idsActivos(COMANDAS)

const item = (comandaId: string | null, cantidad = 1, cantidadEditada: number | null = null): ItemConComanda => ({
  comandaId,
  cantidad,
  cantidadEditada,
})

describe('idsActivos', () => {
  it('devuelve solo las comandas activas', () => {
    expect(idsActivos(COMANDAS)).toEqual(['c-cocina', 'c-barra', 'c-postres'])
    expect(idsActivos([])).toEqual([])
    expect(idsActivos(undefined)).toEqual([])
  })
})

describe('pestaniaVigente', () => {
  it('vale una comanda activa de la lista', () => {
    expect(pestaniaVigente('c-barra', COMANDAS)).toBe('c-barra')
  })

  it('vuelve a "Todas" si está desactivada, no existe, la lista está vacía o no hay elegida', () => {
    expect(pestaniaVigente('c-vieja', COMANDAS)).toBeNull()
    expect(pestaniaVigente('c-borrada', COMANDAS)).toBeNull()
    expect(pestaniaVigente('c-barra', [])).toBeNull()
    expect(pestaniaVigente('c-barra', undefined)).toBeNull()
    expect(pestaniaVigente(null, COMANDAS)).toBeNull()
  })
})

describe('itemVisible', () => {
  it.each([
    ['"Todas" muestra todo', item('c-barra'), null, true],
    ['coincide con la pestania', item('c-barra'), 'c-barra', true],
    ['sin comanda se ve en cualquier pestania', item(null), 'c-barra', true],
    ['comanda desactivada se ve en cualquier pestania', item('c-vieja'), 'c-barra', true],
    ['comanda desconocida se ve en cualquier pestania', item('c-borrada'), 'c-barra', true],
    ['otra comanda activa se oculta', item('c-cocina'), 'c-barra', false],
  ])('%s', (_caso, it, pestania, esperado) => {
    expect(itemVisible(it, pestania, ACTIVAS)).toBe(esperado)
  })

  it('acepta las activas como Set', () => {
    expect(itemVisible(item('c-cocina'), 'c-barra', new Set(ACTIVAS))).toBe(false)
    expect(itemVisible(item('c-vieja'), 'c-barra', new Set(ACTIVAS))).toBe(true)
  })
})

describe('partirItems', () => {
  it('separa visibles y ocultos conservando el orden y sin mutar', () => {
    const items = [item('c-cocina', 1), item('c-barra', 2), item(null, 3), item('c-postres', 4), item('c-vieja', 5)]
    const copia = structuredClone(items)

    const { visibles, ocultos } = partirItems(items, 'c-barra', ACTIVAS)

    expect(visibles.map((i) => i.cantidad)).toEqual([2, 3, 5])
    expect(ocultos.map((i) => i.cantidad)).toEqual([1, 4])
    expect(items).toEqual(copia)
  })

  it('en "Todas" no oculta nada', () => {
    expect(partirItems([item('c-cocina'), item('c-barra')], null, ACTIVAS).ocultos).toEqual([])
  })
})

describe('itemsParaImprimir', () => {
  it('son los mismos ítems que se ven en la pestania', () => {
    const items = [item('c-cocina', 1), item('c-barra', 2), item(null, 3)]

    expect(itemsParaImprimir(items, 'c-barra', ACTIVAS).map((i) => i.cantidad)).toEqual([2, 3])
  })
})

describe('tieneAlgoVisible', () => {
  it('cuenta también la línea eliminada, que la tarjeta muestra tachada', () => {
    expect(tieneAlgoVisible([item('c-barra', 1, 0)], 'c-barra', ACTIVAS)).toBe(true)
  })

  it('un pedido solo de otra comanda no tiene nada visible', () => {
    expect(tieneAlgoVisible([item('c-cocina'), item('c-postres')], 'c-barra', ACTIVAS)).toBe(false)
  })

  it('un pedido sin ítems no tiene nada visible en una pestaña filtrada, pero en "Todas" sí (como antes de las pestañas)', () => {
    expect(tieneAlgoVisible([], 'c-barra', ACTIVAS)).toBe(false)
    expect(tieneAlgoVisible([], null, ACTIVAS)).toBe(true)
  })

  it('en "Todas", con algún ítem, sí', () => {
    expect(tieneAlgoVisible([item('c-cocina')], null, ACTIVAS)).toBe(true)
  })
})

describe('ocultosVigentes', () => {
  it('no cuenta las líneas eliminadas y usa cantidadEditada antes que cantidad', () => {
    const ocultos = [item('c-cocina', 2), item('c-cocina', 3, 0), item('c-postres', 1, 4), item('c-cocina', 0, 2)]

    expect(ocultosVigentes(ocultos)).toBe(3)
  })

  it('una línea con cantidad 0 original y sin edición tampoco cuenta; sin ocultos es 0', () => {
    expect(ocultosVigentes([item('c-cocina', 0)])).toBe(0)
    expect(ocultosVigentes([])).toBe(0)
  })

  it('cuenta líneas, no unidades', () => {
    expect(ocultosVigentes([item('c-cocina', 5)])).toBe(1)
  })
})

describe('esComandaDeCocina', () => {
  it.each(['cocina', 'Cocina', 'COCINA', '  Cocina  ', '\tcocina\n'])('"%s" es la de cocina', (nombre) => {
    expect(esComandaDeCocina(nombre)).toBe(true)
  })

  it.each(['Cocina Central', 'Cocina fría', 'Co cina', 'Barra', ''])('"%s" no lo es', (nombre) => {
    expect(esComandaDeCocina(nombre)).toBe(false)
  })
})

describe('itemsPropios', () => {
  const linea = (id: string, comandaId: string | null, cantidad = 1, cantidadEditada: number | null = null) => ({
    id, ...item(comandaId, cantidad, cantidadEditada),
  })
  const ids = (lista: { id: string }[]) => lista.map((i) => i.id)
  const MIXTO = () => [linea('plato', 'c-cocina'), linea('bebida', 'c-barra'), linea('agua', null), linea('viejo', 'c-vieja'), linea('flan', 'c-postres')]

  it('en "Todas" son todas las vigentes', () => {
    expect(ids(itemsPropios(MIXTO(), null, COMANDAS))).toEqual(['plato', 'bebida', 'agua', 'viejo', 'flan'])
  })

  it('en una comanda son solo las suyas, sin las sin comanda ni las de cocina', () => {
    expect(ids(itemsPropios(MIXTO(), 'c-barra', COMANDAS))).toEqual(['bebida'])
    expect(ids(itemsPropios(MIXTO(), 'c-postres', COMANDAS))).toEqual(['flan'])
  })

  it('en la comanda de cocina suma las sin comanda y las de una comanda inactiva', () => {
    expect(ids(itemsPropios(MIXTO(), 'c-cocina', COMANDAS))).toEqual(['plato', 'agua', 'viejo'])
  })

  it('una comanda desconocida cuenta como inactiva: es de cocina', () => {
    expect(ids(itemsPropios([linea('raro', 'c-borrada'), linea('bebida', 'c-barra')], 'c-cocina', COMANDAS))).toEqual(['raro'])
  })

  it('la comanda de cocina se reconoce por el nombre, sin mayúsculas ni espacios, aunque tenga otro id', () => {
    const comandas = [{ id: 'k', nombre: '  COCINA ', activa: true }, BARRA]
    expect(ids(itemsPropios([linea('plato', 'k'), linea('agua', null), linea('bebida', 'c-barra')], 'k', comandas))).toEqual(['plato', 'agua'])
  })

  it('si no hay una comanda llamada cocina, ninguna pestaña se queda con las sin comanda', () => {
    const comandas = [{ id: 'c-central', nombre: 'Cocina Central', activa: true }, BARRA]
    expect(ids(itemsPropios([linea('plato', 'c-central'), linea('agua', null)], 'c-central', comandas))).toEqual(['plato'])
    expect(ids(itemsPropios([linea('bebida', 'c-barra'), linea('agua', null)], 'c-barra', comandas))).toEqual(['bebida'])
  })

  it('sin la lista de comandas, una pestaña solo tiene lo suyo', () => {
    expect(ids(itemsPropios([linea('bebida', 'c-barra'), linea('agua', null)], 'c-barra', undefined))).toEqual(['bebida'])
    expect(ids(itemsPropios([linea('bebida', 'c-barra')], 'c-barra', null))).toEqual(['bebida'])
  })

  it('no cuenta las líneas eliminadas, pero sí las editadas a otra cantidad', () => {
    const items = [linea('quitada', 'c-barra', 2, 0), linea('menos', 'c-barra', 3, 1), linea('cero', 'c-barra', 0)]
    expect(ids(itemsPropios(items, 'c-barra', COMANDAS))).toEqual(['menos'])
    expect(ids(itemsPropios(items, null, COMANDAS))).toEqual(['menos'])
  })

  it('no muta lo que recibe', () => {
    const items = MIXTO()
    const copia = structuredClone(items)
    itemsPropios(items, 'c-cocina', COMANDAS)
    expect(items).toEqual(copia)
  })
})

describe('columnaDelPedido y puedeMarcarListo', () => {
  const AHORA = '2026-11-26T15:00:00.000Z'
  const linea = (comandaId: string | null, listoEn: string | null = null, cantidad = 1, cantidadEditada: number | null = null) => ({
    ...item(comandaId, cantidad, cantidadEditada), listoEn,
  })
  const pedido = (estado: string, items: ReturnType<typeof linea>[]) => ({ estado, items })
  const columna = (p: ReturnType<typeof pedido>, pestania: string | null) => columnaDelPedido(p, pestania, COMANDAS)
  const puede = (p: ReturnType<typeof pedido>, pestania: string | null) => puedeMarcarListo(p, pestania, COMANDAS)
  // La barra ya marcó; la cocina no.
  const BARRA_MARCO = () => pedido('en_preparacion', [linea('c-cocina'), linea('c-barra', AHORA), linea('c-barra', AHORA)])

  describe('en "Todas"', () => {
    it('sigue el estado del pedido, aunque todo esté marcado', () => {
      expect(columna(BARRA_MARCO(), null)).toBe('en_preparacion')
      expect(columna(pedido('en_preparacion', [linea('c-barra', AHORA)]), null)).toBe('en_preparacion')
      expect(columna(pedido('listo', [linea('c-barra', AHORA)]), null)).toBe('listo')
    })

    it('el botón está mientras el pedido esté en preparación', () => {
      expect(puede(BARRA_MARCO(), null)).toBe(true)
      expect(puede(pedido('listo', [linea('c-barra', AHORA)]), null)).toBe(false)
    })
  })

  describe('en una comanda', () => {
    it('va a "Listo" cuando todas sus líneas propias están marcadas, y sigue en preparación en las demás pestañas', () => {
      expect(columna(BARRA_MARCO(), 'c-barra')).toBe('listo')
      expect(columna(BARRA_MARCO(), 'c-cocina')).toBe('en_preparacion')
      expect(columna(BARRA_MARCO(), null)).toBe('en_preparacion')
    })

    it('con alguna línea propia pendiente sigue en preparación y tiene botón', () => {
      const p = pedido('en_preparacion', [linea('c-barra', AHORA), linea('c-barra')])
      expect(columna(p, 'c-barra')).toBe('en_preparacion')
      expect(puede(p, 'c-barra')).toBe(true)
    })

    it('una línea propia eliminada no cuenta como pendiente', () => {
      const p = pedido('en_preparacion', [linea('c-cocina'), linea('c-barra', AHORA), linea('c-barra', null, 2, 0)])
      expect(columna(p, 'c-barra')).toBe('listo')
    })

    it('una pestaña sin líneas propias no va a "Listo" ni tiene botón (solo ve líneas ajenas)', () => {
      const p = pedido('en_preparacion', [linea(null), linea('c-cocina')])
      expect(columna(p, 'c-barra')).toBe('en_preparacion')
      expect(puede(p, 'c-barra')).toBe(false)
    })

    it('si sus líneas propias están todas eliminadas tampoco va a "Listo"', () => {
      const p = pedido('en_preparacion', [linea('c-barra', null, 1, 0), linea(null)])
      expect(columna(p, 'c-barra')).toBe('en_preparacion')
      expect(puede(p, 'c-barra')).toBe(false)
    })

    it('la cocina solo termina cuando también marcó lo sin comanda y lo de una comanda inactiva', () => {
      const p = pedido('en_preparacion', [linea('c-cocina', AHORA), linea(null), linea('c-vieja', AHORA)])
      expect(columna(p, 'c-cocina')).toBe('en_preparacion')
      expect(puede(p, 'c-cocina')).toBe(true)
      const todo = pedido('en_preparacion', [linea('c-cocina', AHORA), linea(null, AHORA), linea('c-vieja', AHORA)])
      expect(columna(todo, 'c-cocina')).toBe('listo')
      expect(puede(todo, 'c-cocina')).toBe(false)
    })

    it('un pedido ya listo va a "Listo" en cualquier pestaña, aunque tenga líneas sin marca', () => {
      const p = pedido('listo', [linea('c-barra'), linea('c-cocina')])
      expect(columna(p, 'c-barra')).toBe('listo')
      expect(columna(p, 'c-cocina')).toBe('listo')
      expect(puede(p, 'c-barra')).toBe(false)
    })

    it('un pedido que no es de cocina (anulado, entregado) no tiene botón', () => {
      expect(puede(pedido('anulado', [linea('c-barra')]), 'c-barra')).toBe(false)
      expect(puede(pedido('entregado', [linea('c-barra')]), null)).toBe(false)
    })

    it('una línea sin el dato listoEn cuenta como pendiente', () => {
      const p = { estado: 'en_preparacion', items: [item('c-barra')] }
      expect(columnaDelPedido(p, 'c-barra', COMANDAS)).toBe('en_preparacion')
    })
  })
})

describe('comandasListas', () => {
  const AHORA = '2026-11-26T15:00:00.000Z'
  const linea = (comandaId: string | null, listoEn: string | null = null, cantidad = 1, cantidadEditada: number | null = null) => ({
    ...item(comandaId, cantidad, cantidadEditada), listoEn,
  })
  const pedido = (items: ReturnType<typeof linea>[], estado = 'en_preparacion') => ({ estado, items })
  const nombres = (p: ReturnType<typeof pedido>, comandas: ComandaDeCocina[] = COMANDAS) =>
    comandasListas(p, comandas).map((c) => c.nombre)

  it('una comanda con todas sus líneas marcadas está lista, aunque la cocina siga pendiente', () => {
    expect(nombres(pedido([linea('c-cocina'), linea('c-barra', AHORA), linea('c-barra', AHORA)]))).toEqual(['Barra'])
  })

  it('con alguna línea pendiente, o sin nada marcado, todavía no', () => {
    expect(nombres(pedido([linea('c-barra', AHORA), linea('c-barra')]))).toEqual([])
    expect(nombres(pedido([linea('c-barra'), linea('c-cocina')]))).toEqual([])
  })

  it('una comanda sin líneas en el pedido no está lista', () => {
    expect(nombres(pedido([linea('c-cocina', AHORA)]))).toEqual([])
  })

  it('la comanda de cocina nunca genera aviso, aunque lo suyo esté marcado', () => {
    expect(nombres(pedido([linea('c-cocina', AHORA), linea('c-barra', AHORA)]))).toEqual(['Barra'])
  })

  it('la de cocina se reconoce por el nombre, sin mayúsculas ni espacios, aunque tenga otro id', () => {
    const comandas = [{ id: 'k', nombre: '  COCINA ', activa: true }, BARRA]
    expect(nombres(pedido([linea('k', AHORA), linea('c-barra', AHORA)]), comandas)).toEqual(['Barra'])
  })

  it('una comanda con otro nombre parecido ("Cocina Central") sí avisa', () => {
    const comandas = [{ id: 'c-central', nombre: 'Cocina Central', activa: true }]
    expect(nombres(pedido([linea('c-central', AHORA)]), comandas)).toEqual(['Cocina Central'])
  })

  it('con dos comandas listas devuelve las dos, ordenadas por nombre y no por el orden del pedido', () => {
    const p = pedido([linea('c-postres', AHORA), linea('c-barra', AHORA), linea('c-cocina')])
    expect(nombres(p)).toEqual(['Barra', 'Postres'])
  })

  it('una línea eliminada no cuenta: ni bloquea una comanda ni alcanza para marcarla lista', () => {
    expect(nombres(pedido([linea('c-barra', AHORA), linea('c-barra', null, 2, 0)]))).toEqual(['Barra'])
    expect(nombres(pedido([linea('c-barra', AHORA, 1, 0)]))).toEqual([])
    expect(nombres(pedido([linea('c-barra', null, 1, 0), linea('c-cocina')]))).toEqual([])
  })

  it('una línea editada a otra cantidad sigue contando', () => {
    expect(nombres(pedido([linea('c-barra', null, 3, 1)]))).toEqual([])
    expect(nombres(pedido([linea('c-barra', AHORA, 3, 1)]))).toEqual(['Barra'])
  })

  it('una comanda inactiva no avisa: sus líneas son "de cocina"', () => {
    expect(nombres(pedido([linea('c-vieja', AHORA), linea('c-cocina')]))).toEqual([])
  })

  it('las líneas sin comanda no le dan aviso a nadie', () => {
    expect(nombres(pedido([linea(null, AHORA), linea('c-cocina')]))).toEqual([])
  })

  it.each(['pendiente', 'listo', 'entregado', 'anulado'])('un pedido %s no tiene avisos', (estado) => {
    expect(nombres(pedido([linea('c-barra', AHORA)], estado))).toEqual([])
  })

  it('sin la lista de comandas no hay avisos', () => {
    const p = pedido([linea('c-barra', AHORA)])
    expect(comandasListas(p, undefined)).toEqual([])
    expect(comandasListas(p, null)).toEqual([])
    expect(comandasListas(p, [])).toEqual([])
  })

  it('una línea sin el dato listoEn cuenta como pendiente', () => {
    expect(comandasListas({ estado: 'en_preparacion', items: [item('c-barra')] }, COMANDAS)).toEqual([])
  })

  it('no muta lo que recibe', () => {
    const p = pedido([linea('c-postres', AHORA), linea('c-barra', AHORA)])
    const copiaPedido = structuredClone(p)
    const comandas = [POSTRES, BARRA, COCINA]
    const copiaComandas = structuredClone(comandas)

    comandasListas(p, comandas)

    expect(p).toEqual(copiaPedido)
    expect(comandas).toEqual(copiaComandas)
  })
})

describe('pedidoParaImprimir', () => {
  const linea = (id: string, comandaId: string | null, cantidad = 1, cantidadEditada: number | null = null) => ({
    id, ...item(comandaId, cantidad, cantidadEditada),
  })
  const pedido = (items: ReturnType<typeof linea>[]) => ({ id: 'p-1', mesa: 3, items })
  const ids = (p: { items: { id: string }[] } | null) => p?.items.map((i) => i.id)
  const MIXTO = () => [linea('plato', 'c-cocina'), linea('bebida', 'c-barra'), linea('agua', null)]

  it('en "Todas" es el pedido completo', () => {
    expect(ids(pedidoParaImprimir(pedido(MIXTO()), null, ACTIVAS))).toEqual(['plato', 'bebida', 'agua'])
  })

  it('en una pestaña filtrada deja solo los ítems de esa comanda y los sin comanda', () => {
    expect(ids(pedidoParaImprimir(pedido(MIXTO()), 'c-barra', ACTIVAS))).toEqual(['bebida', 'agua'])
    expect(ids(pedidoParaImprimir(pedido(MIXTO()), 'c-cocina', ACTIVAS))).toEqual(['plato', 'agua'])
  })

  it('un ítem de una comanda inactiva sale en todas las pestañas (la misma regla que la pantalla)', () => {
    const items = [linea('plato', 'c-cocina'), linea('viejo', 'c-vieja')]
    expect(ids(pedidoParaImprimir(pedido(items), 'c-cocina', ACTIVAS))).toEqual(['plato', 'viejo'])
    expect(ids(pedidoParaImprimir(pedido(items), 'c-barra', ACTIVAS))).toEqual(['viejo'])
  })

  it('omite las líneas con cantidad vigente 0, tanto la eliminada como la original en 0, en "Todas" y en una pestaña', () => {
    const items = [linea('plato', 'c-cocina', 2), linea('quitada', 'c-cocina', 3, 0), linea('bebida', 'c-barra', 0, 2)]
    expect(ids(pedidoParaImprimir(pedido(items), null, ACTIVAS))).toEqual(['plato', 'bebida'])
    expect(ids(pedidoParaImprimir(pedido(items), 'c-cocina', ACTIVAS))).toEqual(['plato'])
  })

  it('una línea editada a otra cantidad sigue saliendo', () => {
    expect(ids(pedidoParaImprimir(pedido([linea('plato', 'c-cocina', 3, 1)]), 'c-cocina', ACTIVAS))).toEqual(['plato'])
  })

  it('si no queda ninguna línea no hay nada que imprimir: null', () => {
    expect(pedidoParaImprimir(pedido([linea('quitada', 'c-barra', 1, 0)]), 'c-barra', ACTIVAS)).toBeNull()
    expect(pedidoParaImprimir(pedido([linea('plato', 'c-cocina')]), 'c-barra', ACTIVAS)).toBeNull()
    expect(pedidoParaImprimir(pedido([]), null, ACTIVAS)).toBeNull()
  })

  it('conserva el resto del pedido y no muta el original', () => {
    const original = pedido([linea('plato', 'c-cocina'), linea('quitada', 'c-cocina', 1, 0)])
    const copia = structuredClone(original)

    const salida = pedidoParaImprimir(original, null, ACTIVAS)

    expect(salida).toMatchObject({ id: 'p-1', mesa: 3 })
    expect(salida).not.toBe(original)
    expect(original).toEqual(copia)
  })
})
