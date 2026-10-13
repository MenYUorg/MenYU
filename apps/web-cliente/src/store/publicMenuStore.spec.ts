import type { MenuPublico } from '@menyu/types'
import { api } from '../services/api'
import { crearMenu, crearPlato, crearPlatoEnDescuento } from '../test/fixtures'
import { useCarritoStore } from './carritoStore'
import { usePublicMenuStore } from './publicMenuStore'

vi.mock('../services/api', () => ({
  api: { menu: { publico: vi.fn() } },
}))

const publico = vi.mocked(api.menu.publico)

const conCategoria = (...platos: ReturnType<typeof crearPlato>[]) => ({
  id: 'cat-1',
  nombre: 'Principales',
  orden: 1,
  itemsDirectos: platos,
})

describe('publicMenuStore', () => {
  beforeEach(() => {
    publico.mockReset()
    usePublicMenuStore.setState({ menu: null, loading: false, error: null })
    useCarritoStore.getState().vaciar()
    localStorage.clear()
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
    usePublicMenuStore.setState({ menu: crearMenu(), error: 'algo' })

    usePublicMenuStore.getState().clear()

    expect(usePublicMenuStore.getState().menu).toBeNull()
    expect(usePublicMenuStore.getState().error).toBeNull()
  })
})
