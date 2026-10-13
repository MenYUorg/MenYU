import type { CartItem } from '../store/carritoStore'
import { crearExtra, crearMenu, crearPlato, crearPlatoEnDescuento } from '../test/fixtures'
import { indexarPlatos, repreciarItems } from './repreciarCarrito'

function enCarrito(parcial: Partial<CartItem> = {}): CartItem {
  return {
    cartId: 'c1',
    itemMenuId: 'plato-1',
    nombre: 'Milanesa',
    precioUnitario: 1000,
    cantidad: 1,
    modificaciones: [],
    ...parcial,
  }
}

const menuCon = (...platos: ReturnType<typeof crearPlato>[]) =>
  crearMenu({ categorias: [{ id: 'cat-1', nombre: 'Principales', orden: 1, itemsDirectos: platos }] })

describe('indexarPlatos', () => {
  it('junta los platos de las categorías, de recomendados y de descuentos', () => {
    const menu = crearMenu({
      categorias: [{ id: 'cat-1', nombre: 'Principales', orden: 1, itemsDirectos: [crearPlato({ id: 'a' })] }],
      recomendados: [crearPlato({ id: 'b' })],
      descuentos: [crearPlato({ id: 'c' })],
    })
    expect([...indexarPlatos(menu).keys()].sort()).toEqual(['a', 'b', 'c'])
  })

  it('tolera un menú sin recomendados ni descuentos (backend sin actualizar)', () => {
    const menu = crearMenu({
      categorias: [{ id: 'cat-1', nombre: 'Principales', orden: 1, itemsDirectos: [crearPlato({ id: 'a' })] }],
    })
    delete (menu as Partial<typeof menu>).recomendados
    delete (menu as Partial<typeof menu>).descuentos
    expect([...indexarPlatos(menu).keys()]).toEqual(['a'])
  })
})

describe('repreciarItems', () => {
  it('un descuento nuevo baja el precio del plato en el carrito', () => {
    const menu = menuCon(crearPlatoEnDescuento({ precioBase: 1000, precioDescuento: 800 }))

    const { items, cambio } = repreciarItems([enCarrito({ precioUnitario: 1000 })], menu)

    expect(cambio).toBe(true)
    expect(items[0].precioUnitario).toBe(800)
  })

  it('un descuento que ya se sacó devuelve el plato a su precio base', () => {
    const menu = menuCon(crearPlato({ precioBase: 1000 }))

    const { items, cambio } = repreciarItems([enCarrito({ precioUnitario: 800 })], menu)

    expect(cambio).toBe(true)
    expect(items[0].precioUnitario).toBe(1000)
  })

  it('los extras agregados se suman a precio normal, sin descuento', () => {
    const queso = crearExtra({ id: 'ii-queso', precioExtra: 150 })
    const menu = menuCon(crearPlatoEnDescuento({ precioBase: 1000, precioDescuento: 800, ingredientes: [queso] }))
    const conExtras = enCarrito({
      precioUnitario: 1300, // 1000 + 2 × 150 de antes del descuento
      modificaciones: [{ itemIngredienteId: 'ii-queso', accion: 'agregar', cantidad: 2 }],
    })

    const { items } = repreciarItems([conExtras], menu)

    expect(items[0].precioUnitario).toBe(1100) // 800 + 2 × 150
  })

  it('el precio extra puede venir como texto (Decimal serializado)', () => {
    const queso = crearExtra({ id: 'ii-queso', precioExtra: '150.00' as unknown as number })
    const menu = menuCon(crearPlatoEnDescuento({ precioBase: 1000, precioDescuento: 800, ingredientes: [queso] }))
    const conExtra = enCarrito({
      precioUnitario: 1150,
      modificaciones: [{ itemIngredienteId: 'ii-queso', accion: 'agregar', cantidad: 1 }],
    })

    expect(repreciarItems([conExtra], menu).items[0].precioUnitario).toBe(950)
  })

  it('quitar un ingrediente no cambia el precio', () => {
    const cebolla = crearExtra({ id: 'ii-cebolla', esOriginal: true, esRemovible: true, esAgregable: false, precioExtra: 0 })
    const menu = menuCon(crearPlatoEnDescuento({ precioBase: 1000, precioDescuento: 800, ingredientes: [cebolla] }))
    const sinCebolla = enCarrito({
      precioUnitario: 1000,
      modificaciones: [{ itemIngredienteId: 'ii-cebolla', accion: 'quitar', cantidad: 1 }],
    })

    expect(repreciarItems([sinCebolla], menu).items[0].precioUnitario).toBe(800)
  })

  it('si ningún precio cambió, devuelve los mismos ítems y cambio es false', () => {
    const menu = menuCon(crearPlatoEnDescuento({ precioBase: 1000, precioDescuento: 800 }))
    const itemsCarrito = [enCarrito({ precioUnitario: 800 })]

    const resultado = repreciarItems(itemsCarrito, menu)

    expect(resultado.cambio).toBe(false)
    expect(resultado.items).toBe(itemsCarrito)
  })

  it('un plato que ya no está en el menú queda como está', () => {
    const menu = menuCon(crearPlato({ id: 'otro-plato' }))
    const itemsCarrito = [enCarrito({ precioUnitario: 900 })]

    const resultado = repreciarItems(itemsCarrito, menu)

    expect(resultado.cambio).toBe(false)
    expect(resultado.items[0].precioUnitario).toBe(900)
  })

  it('si un extra ya no existe en el plato no se puede calcular y el ítem queda como está', () => {
    const menu = menuCon(crearPlatoEnDescuento({ precioBase: 1000, precioDescuento: 800, ingredientes: [] }))
    const conExtraViejo = enCarrito({
      precioUnitario: 1150,
      modificaciones: [{ itemIngredienteId: 'ii-que-ya-no-esta', accion: 'agregar', cantidad: 1 }],
    })

    const resultado = repreciarItems([conExtraViejo], menu)

    expect(resultado.cambio).toBe(false)
    expect(resultado.items[0].precioUnitario).toBe(1150)
  })

  it('ignora diferencias menores a medio centavo (ruido de coma flotante)', () => {
    const menu = menuCon(crearPlatoEnDescuento({ precioBase: 1000, precioDescuento: 800 }))

    const resultado = repreciarItems([enCarrito({ precioUnitario: 800.001 })], menu)

    expect(resultado.cambio).toBe(false)
  })

  it('solo reemplaza los ítems que cambiaron de precio', () => {
    const menu = crearMenu({
      categorias: [{
        id: 'cat-1', nombre: 'Principales', orden: 1,
        itemsDirectos: [
          crearPlatoEnDescuento({ id: 'a', precioBase: 1000, precioDescuento: 800 }),
          crearPlato({ id: 'b', precioBase: 500 }),
        ],
      }],
    })
    const a = enCarrito({ cartId: 'ca', itemMenuId: 'a', precioUnitario: 1000 })
    const b = enCarrito({ cartId: 'cb', itemMenuId: 'b', precioUnitario: 500 })

    const { items } = repreciarItems([a, b], menu)

    expect(items[0]).not.toBe(a)
    expect(items[0].precioUnitario).toBe(800)
    expect(items[1]).toBe(b)
  })

  it('no modifica los ítems originales', () => {
    const menu = menuCon(crearPlatoEnDescuento({ precioBase: 1000, precioDescuento: 800 }))
    const original = enCarrito({ precioUnitario: 1000 })

    repreciarItems([original], menu)

    expect(original.precioUnitario).toBe(1000)
  })

  it('encuentra un plato que solo está en descuentos, sin categoría', () => {
    const menu = crearMenu({
      descuentos: [crearPlatoEnDescuento({ precioBase: 1000, precioDescuento: 700 })],
    })

    expect(repreciarItems([enCarrito()], menu).items[0].precioUnitario).toBe(700)
  })

  it('mantiene la cantidad, la nota y las modificaciones del ítem', () => {
    const menu = menuCon(crearPlatoEnDescuento({ precioBase: 1000, precioDescuento: 800 }))
    const original = enCarrito({ cantidad: 3, nota: 'bien cocida', precioUnitario: 1000 })

    const [actualizado] = repreciarItems([original], menu).items

    expect(actualizado).toMatchObject({ cartId: 'c1', cantidad: 3, nota: 'bien cocida', precioUnitario: 800 })
  })
})
