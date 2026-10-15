import type { ItemMenu } from '@menyu/types'
import { api } from '../services/api'
import { useMenuStore } from './menuStore'

vi.mock('../services/api', () => ({
  api: {
    items: { setDescuento: vi.fn(), quitarDescuento: vi.fn() },
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
