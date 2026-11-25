import {
  hayQueConfirmar,
  idsActivos,
  itemsParaImprimir,
  itemVisible,
  ocultosVigentes,
  partirItems,
  pestaniaVigente,
  textoDeConfirmacion,
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

describe('hayQueConfirmar', () => {
  it('solo si queda algún oculto vigente', () => {
    expect(hayQueConfirmar([item('c-cocina')])).toBe(true)
    expect(hayQueConfirmar([item('c-cocina', 1, 0)])).toBe(false)
    expect(hayQueConfirmar([])).toBe(false)
  })
})

describe('textoDeConfirmacion', () => {
  const PREFIJO = 'Vas a marcar listo todo el pedido, incluidos'

  it('en singular con un ítem de una comanda', () => {
    expect(textoDeConfirmacion([item('c-cocina')], COMANDAS)).toBe(`${PREFIJO} 1 ítem de Cocina`)
  })

  it('en plural, sin repetir la comanda', () => {
    expect(textoDeConfirmacion([item('c-cocina'), item('c-cocina', 3)], COMANDAS)).toBe(`${PREFIJO} 2 ítems de Cocina`)
  })

  it('con dos comandas las une con "y", ordenadas por nombre', () => {
    expect(textoDeConfirmacion([item('c-cocina'), item('c-barra')], COMANDAS)).toBe(
      `${PREFIJO} 2 ítems de Barra y Cocina`,
    )
  })

  it('con tres comandas usa comas y "y" antes de la última', () => {
    expect(textoDeConfirmacion([item('c-postres'), item('c-cocina'), item('c-barra')], COMANDAS)).toBe(
      `${PREFIJO} 3 ítems de Barra, Cocina y Postres`,
    )
  })

  it('ignora las líneas eliminadas, también para los nombres', () => {
    expect(textoDeConfirmacion([item('c-cocina'), item('c-barra', 1, 0)], COMANDAS)).toBe(`${PREFIJO} 1 ítem de Cocina`)
  })

  it('sin ocultos vigentes no hace falta confirmar', () => {
    expect(textoDeConfirmacion([], COMANDAS)).toBeNull()
    expect(textoDeConfirmacion([item('c-cocina', 1, 0)], COMANDAS)).toBeNull()
  })

  it('si no encuentra el nombre de la comanda, lo omite sin romper', () => {
    expect(textoDeConfirmacion([item('c-borrada')], COMANDAS)).toBe(`${PREFIJO} 1 ítem`)
    expect(textoDeConfirmacion([item('c-borrada'), item('c-barra')], COMANDAS)).toBe(`${PREFIJO} 2 ítems de Barra`)
    expect(textoDeConfirmacion([item('c-barra')], undefined)).toBe(`${PREFIJO} 1 ítem`)
  })

  it('no muta los argumentos', () => {
    const ocultos = [item('c-postres'), item('c-barra')]
    const copia = structuredClone(ocultos)
    textoDeConfirmacion(ocultos, COMANDAS)
    expect(ocultos).toEqual(copia)
  })
})
