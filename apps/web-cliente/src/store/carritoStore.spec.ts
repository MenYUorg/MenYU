import { useCarritoStore, type CartItem } from './carritoStore'

const BASE: Omit<CartItem, 'cartId'> = {
  itemMenuId: 'item-1',
  nombre: 'Hamburguesa',
  precioUnitario: 1500,
  cantidad: 1,
  modificaciones: [],
}

describe('carritoStore', () => {
  beforeEach(() => {
    useCarritoStore.getState().vaciar()
    localStorage.clear()
  })

  // ── agregar ───────────────────────────────────────────────────────────────

  describe('agregar', () => {
    it('item nuevo queda en el carrito', () => {
      useCarritoStore.getState().agregar(BASE)
      expect(useCarritoStore.getState().items).toHaveLength(1)
    })

    it('asigna cartId único por entrada', () => {
      useCarritoStore.getState().agregar(BASE)
      useCarritoStore.getState().agregar({ ...BASE, nota: 'sin sal' })
      const [a, b] = useCarritoStore.getState().items
      expect(a.cartId).not.toBe(b.cartId)
    })

    it('mismo item + mismas mods + misma nota → suma cantidad (no duplica)', () => {
      useCarritoStore.getState().agregar(BASE)
      useCarritoStore.getState().agregar(BASE)
      expect(useCarritoStore.getState().items).toHaveLength(1)
      expect(useCarritoStore.getState().items[0].cantidad).toBe(2)
    })

    it('nota distinta → entrada separada', () => {
      useCarritoStore.getState().agregar(BASE)
      useCarritoStore.getState().agregar({ ...BASE, nota: 'sin sal' })
      expect(useCarritoStore.getState().items).toHaveLength(2)
    })

    it('modificaciones distintas → entrada separada', () => {
      useCarritoStore.getState().agregar(BASE)
      useCarritoStore.getState().agregar({
        ...BASE,
        modificaciones: [{ itemIngredienteId: 'ii-queso', accion: 'agregar', cantidad: 1 }],
      })
      expect(useCarritoStore.getState().items).toHaveLength(2)
    })

    it('al sumar, el precioUnitario se actualiza con el del nuevo agregado', () => {
      useCarritoStore.getState().agregar(BASE)
      useCarritoStore.getState().agregar({ ...BASE, precioUnitario: 1600 })
      expect(useCarritoStore.getState().items[0].precioUnitario).toBe(1600)
    })
  })

  // ── quitar ────────────────────────────────────────────────────────────────

  describe('quitar', () => {
    it('elimina el item con el cartId dado', () => {
      useCarritoStore.getState().agregar(BASE)
      const { cartId } = useCarritoStore.getState().items[0]
      useCarritoStore.getState().quitar(cartId)
      expect(useCarritoStore.getState().items).toHaveLength(0)
    })

    it('no afecta otros items del carrito', () => {
      useCarritoStore.getState().agregar(BASE)
      useCarritoStore.getState().agregar({ ...BASE, itemMenuId: 'item-2', nota: 'x' })
      const { cartId } = useCarritoStore.getState().items[0]
      useCarritoStore.getState().quitar(cartId)
      expect(useCarritoStore.getState().items).toHaveLength(1)
      expect(useCarritoStore.getState().items[0].itemMenuId).toBe('item-2')
    })
  })

  // ── cambiarCantidad ───────────────────────────────────────────────────────

  describe('cambiarCantidad', () => {
    it('actualiza la cantidad del item', () => {
      useCarritoStore.getState().agregar(BASE)
      const { cartId } = useCarritoStore.getState().items[0]
      useCarritoStore.getState().cambiarCantidad(cartId, 4)
      expect(useCarritoStore.getState().items[0].cantidad).toBe(4)
    })

    it('cantidad 0 → elimina el item del carrito', () => {
      useCarritoStore.getState().agregar(BASE)
      const { cartId } = useCarritoStore.getState().items[0]
      useCarritoStore.getState().cambiarCantidad(cartId, 0)
      expect(useCarritoStore.getState().items).toHaveLength(0)
    })
  })

  // ── vaciar ────────────────────────────────────────────────────────────────

  describe('vaciar', () => {
    it('deja el carrito vacío', () => {
      useCarritoStore.getState().agregar(BASE)
      useCarritoStore.getState().agregar({ ...BASE, nota: 'extra' })
      useCarritoStore.getState().vaciar()
      expect(useCarritoStore.getState().items).toHaveLength(0)
    })
  })

  // ── total ─────────────────────────────────────────────────────────────────

  describe('total', () => {
    it('carrito vacío → 0', () => {
      expect(useCarritoStore.getState().total()).toBe(0)
    })

    it('calcula precioUnitario × cantidad para cada item', () => {
      useCarritoStore.getState().agregar({ ...BASE, precioUnitario: 1500, cantidad: 2 })
      useCarritoStore.getState().agregar({ ...BASE, itemMenuId: 'item-2', nota: 'x', precioUnitario: 800, cantidad: 3 })
      // 1500×2 + 800×3 = 3000 + 2400 = 5400
      expect(useCarritoStore.getState().total()).toBe(5400)
    })
  })
})
