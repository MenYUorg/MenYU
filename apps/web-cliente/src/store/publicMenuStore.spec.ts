import type { MenuPublico } from '@menyu/types'
import { api, ApiError } from '../services/api'
import { crearMenu, crearPlato, crearPlatoEnDescuento } from '../test/fixtures'
import { useCarritoStore } from './carritoStore'
import { menuEsDe, usePublicMenuStore } from './publicMenuStore'

vi.mock('../services/api', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../services/api')>()),
  api: { menu: { publico: vi.fn() } },
}))

const publico = vi.mocked(api.menu.publico)

/** El menú de un restaurante (para probar que no se mezclan). */
const menuDe = (id: string, nombre = `Resto ${id}`) =>
  crearMenu({ restaurante: { id, nombre, nombreSeccionRecomendados: 'RECOMENDACIONES' } })

/** Una promesa que se resuelve o rechaza cuando el test lo decide (para que las respuestas lleguen fuera de orden). */
function pendiente<T>() {
  let resolver!: (valor: T) => void
  let rechazar!: (error: unknown) => void
  const promesa = new Promise<T>((res, rej) => { resolver = res; rechazar = rej })
  return { promesa, resolver, rechazar }
}

const conCategoria = (...platos: ReturnType<typeof crearPlato>[]) => ({
  id: 'cat-1',
  nombre: 'Principales',
  orden: 1,
  itemsDirectos: platos,
})

describe('publicMenuStore', () => {
  beforeEach(() => {
    publico.mockReset()
    usePublicMenuStore.setState({ menu: null, loading: false, error: null, errorStatus: null, cargandoDe: null })
    useCarritoStore.getState().vaciar()
    localStorage.clear()
  })

  describe('menuEsDe', () => {
    it('es del restaurante con ese id, sin importar las mayúsculas (los ids son UUID)', () => {
      expect(menuEsDe(menuDe('abcd-1234'), 'abcd-1234')).toBe(true)
      expect(menuEsDe(menuDe('abcd-1234'), 'ABCD-1234')).toBe(true)
      expect(menuEsDe(menuDe('ABCD-1234'), 'abcd-1234')).toBe(true)
    })

    it('no es de otro restaurante, ni sin menú, ni sin id', () => {
      expect(menuEsDe(menuDe('rest-1'), 'rest-2')).toBe(false)
      expect(menuEsDe(null, 'rest-1')).toBe(false)
      expect(menuEsDe(menuDe('rest-1'), null)).toBe(false)
      expect(menuEsDe(menuDe('rest-1'), undefined)).toBe(false)
      expect(menuEsDe(menuDe('rest-1'), '')).toBe(false)
    })
  })

  describe('getItemById', () => {
    it('sin menú cargado no encuentra nada', () => {
      expect(usePublicMenuStore.getState().getItemById('plato-1')).toBeUndefined()
    })

    it('encuentra un plato de una categoría', () => {
      const plato = crearPlato({ id: 'en-categoria' })
      usePublicMenuStore.setState({ menu: crearMenu({ categorias: [conCategoria(plato)] }) })

      expect(usePublicMenuStore.getState().getItemById('en-categoria')).toBe(plato)
    })

    it('encuentra un plato que solo está en recomendados', () => {
      const plato = crearPlato({ id: 'solo-recomendado' })
      usePublicMenuStore.setState({ menu: crearMenu({ recomendados: [plato] }) })

      expect(usePublicMenuStore.getState().getItemById('solo-recomendado')).toBe(plato)
    })

    it('encuentra un plato que solo está en descuentos', () => {
      const plato = crearPlatoEnDescuento({ id: 'solo-descuento', precioBase: 1000, precioDescuento: 800 })
      usePublicMenuStore.setState({ menu: crearMenu({ descuentos: [plato] }) })

      expect(usePublicMenuStore.getState().getItemById('solo-descuento')).toBe(plato)
    })

    it('si el plato está en una categoría y en descuentos, devuelve el de la categoría', () => {
      const enCategoria = crearPlato({ id: 'repetido' })
      const enDescuentos = crearPlato({ id: 'repetido' })
      usePublicMenuStore.setState({
        menu: crearMenu({ categorias: [conCategoria(enCategoria)], descuentos: [enDescuentos] }),
      })

      expect(usePublicMenuStore.getState().getItemById('repetido')).toBe(enCategoria)
    })

    it('un id que no está en el menú devuelve undefined', () => {
      usePublicMenuStore.setState({ menu: crearMenu({ categorias: [conCategoria(crearPlato())] }) })

      expect(usePublicMenuStore.getState().getItemById('no-existe')).toBeUndefined()
    })

    it('tolera un menú sin recomendados ni descuentos (backend sin actualizar)', () => {
      const menu = crearMenu({ categorias: [conCategoria(crearPlato())] })
      delete (menu as Partial<MenuPublico>).recomendados
      delete (menu as Partial<MenuPublico>).descuentos
      usePublicMenuStore.setState({ menu })

      expect(usePublicMenuStore.getState().getItemById('no-existe')).toBeUndefined()
    })
  })

  describe('fetchMenu', () => {
    it('guarda el menú que devuelve el backend', async () => {
      const menu = crearMenu({ categorias: [conCategoria(crearPlato())] })
      publico.mockResolvedValue(menu)

      await usePublicMenuStore.getState().fetchMenu('rest-1')

      expect(publico).toHaveBeenCalledWith('rest-1')
      expect(usePublicMenuStore.getState().menu).toBe(menu)
      expect(usePublicMenuStore.getState().loading).toBe(false)
    })

    it('corrige los precios del carrito guardado con los del menú nuevo', async () => {
      useCarritoStore.getState().agregar({
        itemMenuId: 'plato-1',
        nombre: 'Milanesa',
        precioUnitario: 1000,
        cantidad: 2,
        modificaciones: [],
      })
      publico.mockResolvedValue(
        crearMenu({ categorias: [conCategoria(crearPlatoEnDescuento({ precioBase: 1000, precioDescuento: 800 }))] }),
      )

      await usePublicMenuStore.getState().fetchMenu('rest-1')

      expect(useCarritoStore.getState().items[0].precioUnitario).toBe(800)
      expect(useCarritoStore.getState().total()).toBe(1600)
      expect(useCarritoStore.getState().avisoPrecios).toBe(true)
    })

    it('si los precios del carrito no cambiaron, no avisa', async () => {
      useCarritoStore.getState().agregar({
        itemMenuId: 'plato-1',
        nombre: 'Milanesa',
        precioUnitario: 1000,
        cantidad: 1,
        modificaciones: [],
      })
      publico.mockResolvedValue(crearMenu({ categorias: [conCategoria(crearPlato({ precioBase: 1000 }))] }))

      await usePublicMenuStore.getState().fetchMenu('rest-1')

      expect(useCarritoStore.getState().avisoPrecios).toBe(false)
    })

    it('no vuelve a pedir el menú mientras ya se está cargando', async () => {
      let resolver: (menu: MenuPublico) => void = () => {}
      publico.mockReturnValue(new Promise<MenuPublico>((resolve) => { resolver = resolve }))

      const primera = usePublicMenuStore.getState().fetchMenu('rest-1')
      await usePublicMenuStore.getState().fetchMenu('rest-1')
      expect(publico).toHaveBeenCalledTimes(1)

      resolver(crearMenu())
      await primera
      expect(usePublicMenuStore.getState().loading).toBe(false)
    })

    describe('un menú por restaurante', () => {
      it('al pedir el de otro restaurante, el anterior deja de estar mientras llega el nuevo', async () => {
        publico.mockResolvedValueOnce(menuDe('rest-1'))
        await usePublicMenuStore.getState().fetchMenu('rest-1')
        const { promesa, resolver } = pendiente<MenuPublico>()
        publico.mockReturnValueOnce(promesa)

        const carga = usePublicMenuStore.getState().fetchMenu('rest-2')

        expect(usePublicMenuStore.getState().menu).toBeNull()
        expect(usePublicMenuStore.getState().loading).toBe(true)

        resolver(menuDe('rest-2'))
        await carga
        expect(usePublicMenuStore.getState().menu?.restaurante.id).toBe('rest-2')
        expect(usePublicMenuStore.getState().loading).toBe(false)
      })

      it('al volver a pedir el mismo restaurante, el menú de antes queda mientras se actualiza', async () => {
        publico.mockResolvedValueOnce(menuDe('rest-1', 'Antes'))
        await usePublicMenuStore.getState().fetchMenu('rest-1')
        const { promesa, resolver } = pendiente<MenuPublico>()
        publico.mockReturnValueOnce(promesa)

        const carga = usePublicMenuStore.getState().fetchMenu('rest-1')

        expect(usePublicMenuStore.getState().menu?.restaurante.nombre).toBe('Antes')

        resolver(menuDe('rest-1', 'Después'))
        await carga
        expect(usePublicMenuStore.getState().menu?.restaurante.nombre).toBe('Después')
      })

      it('si se pide otro restaurante mientras se carga uno, se pide el nuevo (no se queda con el pedido anterior)', async () => {
        publico.mockReturnValueOnce(new Promise(() => {}))
        void usePublicMenuStore.getState().fetchMenu('rest-1')
        publico.mockResolvedValueOnce(menuDe('rest-2'))

        await usePublicMenuStore.getState().fetchMenu('rest-2')

        expect(publico).toHaveBeenCalledTimes(2)
        expect(usePublicMenuStore.getState().menu?.restaurante.id).toBe('rest-2')
        expect(usePublicMenuStore.getState().loading).toBe(false)
      })

      it('si la respuesta del restaurante anterior llega después, se descarta', async () => {
        const viejo = pendiente<MenuPublico>()
        publico.mockReturnValueOnce(viejo.promesa).mockResolvedValueOnce(menuDe('rest-2'))

        const cargaVieja = usePublicMenuStore.getState().fetchMenu('rest-1')
        await usePublicMenuStore.getState().fetchMenu('rest-2')
        viejo.resolver(menuDe('rest-1'))
        await cargaVieja

        expect(usePublicMenuStore.getState().menu?.restaurante.id).toBe('rest-2')
        expect(usePublicMenuStore.getState().loading).toBe(false)
      })

      it('un error del restaurante anterior que llega después no pisa al nuevo', async () => {
        const viejo = pendiente<MenuPublico>()
        publico.mockReturnValueOnce(viejo.promesa).mockResolvedValueOnce(menuDe('rest-2'))

        const cargaVieja = usePublicMenuStore.getState().fetchMenu('rest-1')
        await usePublicMenuStore.getState().fetchMenu('rest-2')
        viejo.rechazar(new ApiError('Restaurante no encontrado', 404))
        await cargaVieja

        expect(usePublicMenuStore.getState().menu?.restaurante.id).toBe('rest-2')
        expect(usePublicMenuStore.getState().error).toBeNull()
        expect(usePublicMenuStore.getState().errorStatus).toBeNull()
      })

      it('mientras se pide uno, la respuesta vieja no apaga el indicador de carga del nuevo', async () => {
        const viejo = pendiente<MenuPublico>()
        const nuevo = pendiente<MenuPublico>()
        publico.mockReturnValueOnce(viejo.promesa).mockReturnValueOnce(nuevo.promesa)

        const cargaVieja = usePublicMenuStore.getState().fetchMenu('rest-1')
        const cargaNueva = usePublicMenuStore.getState().fetchMenu('rest-2')
        viejo.resolver(menuDe('rest-1'))
        await cargaVieja

        expect(usePublicMenuStore.getState().loading).toBe(true)
        expect(usePublicMenuStore.getState().menu).toBeNull()

        nuevo.resolver(menuDe('rest-2'))
        await cargaNueva
        expect(usePublicMenuStore.getState().loading).toBe(false)
      })
    })

    describe('el código del error (para distinguir un restaurante que no existe de una falla)', () => {
      it('guarda el código HTTP: un 404 es "no existe"', async () => {
        publico.mockRejectedValue(new ApiError('Restaurante no encontrado', 404))

        await usePublicMenuStore.getState().fetchMenu('rest-1')

        expect(usePublicMenuStore.getState().errorStatus).toBe(404)
        expect(usePublicMenuStore.getState().error).toBe('Restaurante no encontrado')
      })

      it('sin respuesta del servidor no hay código', async () => {
        publico.mockRejectedValue(new TypeError('Failed to fetch'))

        await usePublicMenuStore.getState().fetchMenu('rest-1')

        expect(usePublicMenuStore.getState().error).toBe('Failed to fetch')
        expect(usePublicMenuStore.getState().errorStatus).toBeNull()
      })

      it('un código que no es un número no se guarda', async () => {
        publico.mockRejectedValue(Object.assign(new Error('raro'), { status: '404' }))

        await usePublicMenuStore.getState().fetchMenu('rest-1')

        expect(usePublicMenuStore.getState().errorStatus).toBeNull()
      })

      it('un pedido nuevo borra el error y el código del anterior', async () => {
        publico.mockRejectedValueOnce(new ApiError('Restaurante no encontrado', 404))
        await usePublicMenuStore.getState().fetchMenu('rest-1')
        publico.mockResolvedValueOnce(menuDe('rest-1'))

        await usePublicMenuStore.getState().fetchMenu('rest-1')

        expect(usePublicMenuStore.getState().error).toBeNull()
        expect(usePublicMenuStore.getState().errorStatus).toBeNull()
      })
    })

    it('si falla, guarda el error y no toca el carrito', async () => {
      useCarritoStore.getState().agregar({
        itemMenuId: 'plato-1',
        nombre: 'Milanesa',
        precioUnitario: 1000,
        cantidad: 1,
        modificaciones: [],
      })
      publico.mockRejectedValue(new Error('Sin conexión'))

      await usePublicMenuStore.getState().fetchMenu('rest-1')

      expect(usePublicMenuStore.getState().error).toBe('Sin conexión')
      expect(usePublicMenuStore.getState().menu).toBeNull()
      expect(usePublicMenuStore.getState().loading).toBe(false)
      expect(useCarritoStore.getState().avisoPrecios).toBe(false)
    })
  })

  it('clear descarta el menú y el error', () => {
    usePublicMenuStore.setState({ menu: crearMenu(), error: 'algo', errorStatus: 500 })

    usePublicMenuStore.getState().clear()

    expect(usePublicMenuStore.getState().menu).toBeNull()
    expect(usePublicMenuStore.getState().error).toBeNull()
    expect(usePublicMenuStore.getState().errorStatus).toBeNull()
  })
})
