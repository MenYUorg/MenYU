import { useCarritoStore } from './useCarritoStore'

const item1 = { id: '1', nombre: 'Milanesa', precio: 100 }
const item2 = { id: '2', nombre: 'Empanada', precio: 50 }

beforeEach(() => {
  useCarritoStore.setState({ items: [] })
})

describe('useCarritoStore', () => {
  describe('agregarItem', () => {
    it('agrega un ítem nuevo con cantidad 1', () => {
      useCarritoStore.getState().agregarItem(item1)

      const { items } = useCarritoStore.getState()
      expect(items).toHaveLength(1)
      expect(items[0]).toEqual({ ...item1, cantidad: 1 })
    })

    it('incrementa cantidad en 1 si el ítem ya existe', () => {
      useCarritoStore.getState().agregarItem(item1)
      useCarritoStore.getState().agregarItem(item1)

      const { items } = useCarritoStore.getState()
      expect(items).toHaveLength(1)
      expect(items[0].cantidad).toBe(2)
    })

    it('agrega ítems distintos como entradas separadas', () => {
      useCarritoStore.getState().agregarItem(item1)
      useCarritoStore.getState().agregarItem(item2)

      expect(useCarritoStore.getState().items).toHaveLength(2)
    })

    it('no modifica la cantidad del resto al agregar uno existente', () => {
      useCarritoStore.getState().agregarItem(item1)
      useCarritoStore.getState().agregarItem(item2)
      useCarritoStore.getState().agregarItem(item1)

      const items = useCarritoStore.getState().items
      expect(items.find((i) => i.id === '1')?.cantidad).toBe(2)
      expect(items.find((i) => i.id === '2')?.cantidad).toBe(1)
    })
  })

  describe('quitarItem', () => {
    it('elimina el ítem del carrito', () => {
      useCarritoStore.getState().agregarItem(item1)
      useCarritoStore.getState().quitarItem('1')

      expect(useCarritoStore.getState().items).toHaveLength(0)
    })

    it('elimina el ítem correcto cuando hay varios', () => {
      useCarritoStore.getState().agregarItem(item1)
      useCarritoStore.getState().agregarItem(item2)
      useCarritoStore.getState().quitarItem('1')

      const items = useCarritoStore.getState().items
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe('2')
    })

    it('no hace nada si el id no existe', () => {
      useCarritoStore.getState().agregarItem(item1)
      useCarritoStore.getState().quitarItem('inexistente')

      expect(useCarritoStore.getState().items).toHaveLength(1)
    })
  })

  describe('actualizarCantidad', () => {
    it('actualiza la cantidad del ítem', () => {
      useCarritoStore.getState().agregarItem(item1)
      useCarritoStore.getState().actualizarCantidad('1', 5)

      expect(useCarritoStore.getState().items[0].cantidad).toBe(5)
    })

    it('elimina el ítem si la nueva cantidad es 0', () => {
      useCarritoStore.getState().agregarItem(item1)
      useCarritoStore.getState().actualizarCantidad('1', 0)

      expect(useCarritoStore.getState().items).toHaveLength(0)
    })

    it('elimina el ítem si la nueva cantidad es negativa', () => {
      useCarritoStore.getState().agregarItem(item1)
      useCarritoStore.getState().actualizarCantidad('1', -3)

      expect(useCarritoStore.getState().items).toHaveLength(0)
    })

    it('no modifica otros ítems al actualizar uno', () => {
      useCarritoStore.getState().agregarItem(item1)
      useCarritoStore.getState().agregarItem(item2)
      useCarritoStore.getState().actualizarCantidad('1', 4)

      expect(useCarritoStore.getState().items.find((i) => i.id === '2')?.cantidad).toBe(1)
    })
  })

  describe('vaciarCarrito', () => {
    it('elimina todos los ítems', () => {
      useCarritoStore.getState().agregarItem(item1)
      useCarritoStore.getState().agregarItem(item2)
      useCarritoStore.getState().vaciarCarrito()

      expect(useCarritoStore.getState().items).toHaveLength(0)
    })

    it('no falla con carrito ya vacío', () => {
      expect(() => useCarritoStore.getState().vaciarCarrito()).not.toThrow()
    })
  })

  describe('total', () => {
    it('devuelve 0 con carrito vacío', () => {
      expect(useCarritoStore.getState().total()).toBe(0)
    })

    it('calcula precio × cantidad de un ítem', () => {
      useCarritoStore.getState().agregarItem(item1)
      useCarritoStore.getState().actualizarCantidad('1', 3)

      expect(useCarritoStore.getState().total()).toBe(300)
    })

    it('suma todos los ítems', () => {
      useCarritoStore.getState().agregarItem(item1)      // 100 × 1
      useCarritoStore.getState().agregarItem(item2)      // 50 × 1
      useCarritoStore.getState().actualizarCantidad('1', 3) // 100 × 3

      expect(useCarritoStore.getState().total()).toBe(350)
    })

    it('se actualiza al quitar un ítem', () => {
      useCarritoStore.getState().agregarItem(item1)
      useCarritoStore.getState().agregarItem(item2)
      useCarritoStore.getState().quitarItem('1')

      expect(useCarritoStore.getState().total()).toBe(50)
    })
  })

  describe('cantidadTotal', () => {
    it('devuelve 0 con carrito vacío', () => {
      expect(useCarritoStore.getState().cantidadTotal()).toBe(0)
    })

    it('suma las cantidades de todos los ítems', () => {
      useCarritoStore.getState().agregarItem(item1)
      useCarritoStore.getState().agregarItem(item1) // cantidad = 2
      useCarritoStore.getState().agregarItem(item2) // cantidad = 1

      expect(useCarritoStore.getState().cantidadTotal()).toBe(3)
    })

    it('se actualiza al vaciar el carrito', () => {
      useCarritoStore.getState().agregarItem(item1)
      useCarritoStore.getState().agregarItem(item2)
      useCarritoStore.getState().vaciarCarrito()

      expect(useCarritoStore.getState().cantidadTotal()).toBe(0)
    })
  })
})
