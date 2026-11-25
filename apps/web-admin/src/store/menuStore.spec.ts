import type { ItemMenu } from '@menyu/types'
import { api } from '../services/api'
import { useMenuStore } from './menuStore'

vi.mock('../services/api', () => ({
  api: {
    items: { setDescuento: vi.fn(), quitarDescuento: vi.fn() },
    comandas: { listar: vi.fn() },
  },
}))

function item(id: string, extra: Partial<ItemMenu> = {}): ItemMenu {
  return {
    id,
    restauranteId: 'rest-1',
    categoriaId: null,
    comandaId: null,
    nombre: `Plato ${id}`,
    descripcion: null,
    precioBase: 2000,
    precioDescuento: null,
    porcentajeDescuento: null,
    precioVigente: 2000,
    disponible: true,
    imagenUrl: null,
    ...extra,
  }
}

const A = item('a')
const B = item('b')
const A_CON_DESCUENTO = item('a', { precioDescuento: 1500, porcentajeDescuento: 25, precioVigente: 1500 })

describe('menuStore — descuentos', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useMenuStore.setState({ items: [A, B], loading: false, error: null })
  })

  describe('setDescuento', () => {
    it('pide el descuento al servidor y reemplaza solo ese ítem con el que devuelve', async () => {
      vi.mocked(api.items.setDescuento).mockResolvedValue(A_CON_DESCUENTO)

      const resultado = await useMenuStore.getState().setDescuento('a', { porcentaje: 25 })

      expect(api.items.setDescuento).toHaveBeenCalledWith('a', { porcentaje: 25 })
      expect(resultado).toEqual(A_CON_DESCUENTO)
      expect(useMenuStore.getState().items).toEqual([A_CON_DESCUENTO, B])
    })

    it('por precio manda precioDescuento tal cual', async () => {
      vi.mocked(api.items.setDescuento).mockResolvedValue(A_CON_DESCUENTO)

      await useMenuStore.getState().setDescuento('a', { precioDescuento: 1500 })

      expect(api.items.setDescuento).toHaveBeenCalledWith('a', { precioDescuento: 1500 })
    })

    it('si el servidor lo rechaza, propaga el error y deja la lista como estaba', async () => {
      vi.mocked(api.items.setDescuento).mockRejectedValue(new Error('El descuento es menor al 1%'))

      await expect(useMenuStore.getState().setDescuento('a', { precioDescuento: 1999 })).rejects.toThrow(
        'El descuento es menor al 1%',
      )

      expect(useMenuStore.getState().items).toEqual([A, B])
      expect(useMenuStore.getState().error).toBeNull()
    })

    it('no activa "loading" (la lista no parpadea con "Cargando…") ni usa el error global', async () => {
      let terminar: (i: ItemMenu) => void = () => undefined
      vi.mocked(api.items.setDescuento).mockReturnValue(new Promise<ItemMenu>((resolver) => (terminar = resolver)))

      const promesa = useMenuStore.getState().setDescuento('a', { porcentaje: 25 })

      expect(useMenuStore.getState().loading).toBe(false)
      terminar(A_CON_DESCUENTO)
      await promesa
      expect(useMenuStore.getState().loading).toBe(false)
      expect(useMenuStore.getState().error).toBeNull()
    })

    it('un ítem que ya no está en la lista no la altera', async () => {
      vi.mocked(api.items.setDescuento).mockResolvedValue(item('z', { precioDescuento: 1500 }))

      await useMenuStore.getState().setDescuento('z', { porcentaje: 25 })

      expect(useMenuStore.getState().items).toEqual([A, B])
    })
  })

  describe('quitarDescuento', () => {
    beforeEach(() => {
      useMenuStore.setState({ items: [A_CON_DESCUENTO, B] })
    })

    it('quita el descuento en el servidor y reemplaza el ítem con el que devuelve', async () => {
      vi.mocked(api.items.quitarDescuento).mockResolvedValue(A)

      const resultado = await useMenuStore.getState().quitarDescuento('a')

      expect(api.items.quitarDescuento).toHaveBeenCalledWith('a')
      expect(resultado).toEqual(A)
      expect(useMenuStore.getState().items).toEqual([A, B])
    })

    it('si falla, propaga el error y el ítem conserva su descuento', async () => {
      vi.mocked(api.items.quitarDescuento).mockRejectedValue(new Error('No tenés acceso a este restaurante'))

      await expect(useMenuStore.getState().quitarDescuento('a')).rejects.toThrow('No tenés acceso')

      expect(useMenuStore.getState().items).toEqual([A_CON_DESCUENTO, B])
      expect(useMenuStore.getState().loading).toBe(false)
    })
  })
})

describe('menuStore — comandas', () => {
  const COCINA = { id: 'com-1', restauranteId: 'rest-1', nombre: 'Cocina', activa: true }
  const BARRA = { id: 'com-2', restauranteId: 'rest-1', nombre: 'Barra', activa: false }

  beforeEach(() => {
    vi.resetAllMocks()
    useMenuStore.setState({ comandas: null, comandasEstado: 'cargando', loading: false, error: null })
  })

  /** Una llamada a `api.comandas.listar` que se resuelve o rechaza a mano. */
  function diferida() {
    let resolver!: (c: typeof COCINA[]) => void
    let rechazar!: (e: Error) => void
    const promesa = new Promise<typeof COCINA[]>((ok, mal) => { resolver = ok; rechazar = mal })
    return { promesa, resolver, rechazar }
  }
  const estado = () => useMenuStore.getState().comandasEstado
  const lista = () => useMenuStore.getState().comandas

  it('arranca sin cargar (null) y en estado "cargando"', () => {
    const inicial = useMenuStore.getInitialState()

    expect(inicial.comandas).toBeNull()
    expect(inicial.comandasEstado).toBe('cargando')
  })

  it('al pedir pasa a "cargando" con la lista en null, aunque antes estuviera en "ok" o "error"', async () => {
    for (const previo of ['ok', 'error'] as const) {
      useMenuStore.setState({ comandas: previo === 'ok' ? [COCINA] : null, comandasEstado: previo })
      const d = diferida()
      vi.mocked(api.comandas.listar).mockReturnValue(d.promesa)

      const pedido = useMenuStore.getState().fetchComandas('rest-1')
      expect(estado()).toBe('cargando')
      expect(lista()).toBeNull()
      d.resolver([COCINA])
      await pedido
    }
  })

  it('si el pedido sale bien queda en "ok" con la lista', async () => {
    vi.mocked(api.comandas.listar).mockResolvedValue([COCINA])

    await useMenuStore.getState().fetchComandas('rest-1')

    expect(estado()).toBe('ok')
    expect(lista()).toEqual([COCINA])
  })

  it('una lista vacía también es "ok" (no es lo mismo que fallar)', async () => {
    vi.mocked(api.comandas.listar).mockResolvedValue([])

    await useMenuStore.getState().fetchComandas('rest-1')

    expect(estado()).toBe('ok')
    expect(lista()).toEqual([])
  })

  it('si falla queda en "error" con la lista en null', async () => {
    vi.mocked(api.comandas.listar).mockRejectedValue(new Error('boom'))

    await useMenuStore.getState().fetchComandas('rest-1')

    expect(estado()).toBe('error')
    expect(lista()).toBeNull()
  })

  describe('pedidos superpuestos: solo cuenta el más nuevo', () => {
    it('éxito: si el pedido viejo resuelve después, no pisa al nuevo', async () => {
      const a = diferida()
      const b = diferida()
      vi.mocked(api.comandas.listar).mockReturnValueOnce(a.promesa).mockReturnValueOnce(b.promesa)

      const pedidoA = useMenuStore.getState().fetchComandas('rest-1')
      const pedidoB = useMenuStore.getState().fetchComandas('rest-2')
      b.resolver([BARRA])
      await pedidoB
      a.resolver([COCINA])
      await pedidoA

      expect(lista()).toEqual([BARRA])
      expect(estado()).toBe('ok')
    })

    it('error: si el pedido viejo falla después de que el nuevo salió bien, no lo pisa', async () => {
      const a = diferida()
      const b = diferida()
      vi.mocked(api.comandas.listar).mockReturnValueOnce(a.promesa).mockReturnValueOnce(b.promesa)

      const pedidoA = useMenuStore.getState().fetchComandas('rest-1')
      const pedidoB = useMenuStore.getState().fetchComandas('rest-2')
      b.resolver([BARRA])
      await pedidoB
      a.rechazar(new Error('boom'))
      await pedidoA

      expect(lista()).toEqual([BARRA])
      expect(estado()).toBe('ok')
    })

    it('inverso: si el pedido nuevo falla y el viejo resuelve tarde, queda "error" con null', async () => {
      const a = diferida()
      const b = diferida()
      vi.mocked(api.comandas.listar).mockReturnValueOnce(a.promesa).mockReturnValueOnce(b.promesa)

      const pedidoA = useMenuStore.getState().fetchComandas('rest-1')
      const pedidoB = useMenuStore.getState().fetchComandas('rest-2')
      b.rechazar(new Error('boom'))
      await pedidoB
      a.resolver([COCINA])
      await pedidoA

      expect(lista()).toBeNull()
      expect(estado()).toBe('error')
    })

    it('mientras el pedido nuevo no terminó, el viejo que resuelve no lo saca de "cargando"', async () => {
      const a = diferida()
      const b = diferida()
      vi.mocked(api.comandas.listar).mockReturnValueOnce(a.promesa).mockReturnValueOnce(b.promesa)

      const pedidoA = useMenuStore.getState().fetchComandas('rest-1')
      const pedidoB = useMenuStore.getState().fetchComandas('rest-2')
      a.resolver([COCINA])
      await pedidoA

      expect(lista()).toBeNull()
      expect(estado()).toBe('cargando')
      b.resolver([BARRA])
      await pedidoB
      expect(lista()).toEqual([BARRA])
    })
  })

  it('fetchComandas guarda todas las del restaurante, activas e inactivas', async () => {
    vi.mocked(api.comandas.listar).mockResolvedValue([COCINA, BARRA])

    await useMenuStore.getState().fetchComandas('rest-1')

    expect(api.comandas.listar).toHaveBeenCalledWith('rest-1')
    expect(useMenuStore.getState().comandas).toEqual([COCINA, BARRA])
  })

  it('si falla deja null, sin romper ni tocar el error de la tienda', async () => {
    useMenuStore.setState({ comandas: [COCINA] })
    vi.mocked(api.comandas.listar).mockRejectedValue(new Error('boom'))

    await expect(useMenuStore.getState().fetchComandas('rest-1')).resolves.toBeUndefined()

    expect(useMenuStore.getState().comandas).toBeNull()
    expect(useMenuStore.getState().error).toBeNull()
  })

  it('al pedir las de otro restaurante la lista anterior no queda mientras llega la nueva', async () => {
    useMenuStore.setState({ comandas: [COCINA] })
    let terminar!: (c: typeof BARRA[]) => void
    vi.mocked(api.comandas.listar).mockReturnValue(new Promise((resolver) => (terminar = resolver)))

    const pedido = useMenuStore.getState().fetchComandas('rest-2')
    expect(useMenuStore.getState().comandas).toBeNull()
    terminar([{ ...BARRA, restauranteId: 'rest-2' }])
    await pedido

    expect(useMenuStore.getState().comandas).toEqual([{ ...BARRA, restauranteId: 'rest-2' }])
  })
})
