import type { MenuPublico, MenuPublicoItem } from '@menyu/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useCarritoStore } from '../../store/carritoStore'
import { usePublicMenuStore } from '../../store/publicMenuStore'
import { useSessionStore } from '../../store/sessionStore'
import { crearExtra, crearMenu, crearPlato, crearPlatoEnDescuento } from '../../test/fixtures'
import { ItemDetailPage } from './ItemDetailPage'

vi.mock('../../services/api', () => ({
  api: { menu: { publico: vi.fn() } },
}))

// Plato de $1000 con 20% de descuento ($800) y un extra de $150.
const queso = crearExtra({
  id: 'ii-queso',
  precioExtra: 150,
  cantidadMax: 3,
  ingrediente: { id: 'ing-queso', restauranteId: 'rest-1', nombre: 'Queso extra', esAlergeno: false },
})
const hamburguesaEnDescuento = () =>
  crearPlatoEnDescuento({ id: 'hamb', nombre: 'Hamburguesa', precioBase: 1000, precioDescuento: 800, ingredientes: [queso] })

function renderDetalle(itemId: string, menu: MenuPublico) {
  usePublicMenuStore.setState({ menu, loading: false, error: null })
  return render(
    <MemoryRouter initialEntries={[`/menu/${itemId}`]}>
      <Routes>
        <Route path="/menu/:itemId" element={<ItemDetailPage />} />
        <Route path="/menu" element={<p>Pantalla del menú</p>} />
        <Route path="/carrito" element={<p>Pantalla del carrito</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const menuConCategoria = (...platos: MenuPublicoItem[]) =>
  crearMenu({ categorias: [{ id: 'cat-1', nombre: 'Principales', orden: 1, itemsDirectos: platos }] })

const botonAgregar = () => screen.getByRole('button', { name: /Agregar al pedido/ })

describe('ItemDetailPage', () => {
  // El estado se reinicia antes de cada test, no después: al terminar, la página sigue montada hasta que
  // Testing Library la desmonta, y un cambio de estado en ese momento dispara un render fuera de act().
  beforeEach(() => {
    useSessionStore.setState({ restauranteId: 'rest-1' })
    usePublicMenuStore.setState({ menu: null, loading: false, error: null })
    useCarritoStore.getState().vaciar()
    localStorage.clear()
  })

  describe('plato en descuento', () => {
    it('muestra el círculo con el porcentaje en la foto', () => {
      renderDetalle('hamb', menuConCategoria(hamburguesaEnDescuento()))

      expect(screen.getByRole('img', { name: '20% de descuento' })).toHaveTextContent('-20%')
    })

    it('muestra el precio original tachado y el precio con descuento', () => {
      const { container } = renderDetalle('hamb', menuConCategoria(hamburguesaEnDescuento()))

      expect(container.querySelector('s')).toHaveTextContent('$1000.00')
      expect(container).toHaveTextContent('Antes $1000.00, ahora $800.00')
    })

    it('el botón de agregar parte del precio con descuento', () => {
      renderDetalle('hamb', menuConCategoria(hamburguesaEnDescuento()))

      expect(botonAgregar()).toHaveTextContent('$800.00')
    })

    it('los extras se suman a precio normal, sin descuento', () => {
      renderDetalle('hamb', menuConCategoria(hamburguesaEnDescuento()))

      // El primer "+" es el del extra; el segundo es el de la cantidad del plato.
      fireEvent.click(screen.getAllByRole('button', { name: '+' })[0])

      expect(botonAgregar()).toHaveTextContent('$950.00') // 800 + 150
    })

    it('la cantidad multiplica el precio con descuento más los extras', () => {
      renderDetalle('hamb', menuConCategoria(hamburguesaEnDescuento()))

      fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]) // 1 extra
      fireEvent.click(screen.getAllByRole('button', { name: '+' })[1]) // 2 platos

      expect(botonAgregar()).toHaveTextContent('$1900.00') // (800 + 150) × 2
    })

    it('al agregar, el carrito guarda el precio con descuento más los extras', () => {
      renderDetalle('hamb', menuConCategoria(hamburguesaEnDescuento()))
      fireEvent.click(screen.getAllByRole('button', { name: '+' })[0])

      fireEvent.click(botonAgregar())

      const [enCarrito] = useCarritoStore.getState().items
      expect(enCarrito).toMatchObject({ itemMenuId: 'hamb', precioUnitario: 950, cantidad: 1 })
      expect(screen.getByText('Pantalla del carrito')).toBeInTheDocument()
    })

    it('sin extras, el carrito guarda el precio con descuento', () => {
      renderDetalle('hamb', menuConCategoria(hamburguesaEnDescuento()))

      fireEvent.click(botonAgregar())

      expect(useCarritoStore.getState().items[0].precioUnitario).toBe(800)
    })

    it('encuentra un plato que solo está en la sección de descuentos', () => {
      renderDetalle('hamb', crearMenu({ descuentos: [hamburguesaEnDescuento()] }))

      expect(screen.getByRole('heading', { name: 'Hamburguesa' })).toBeInTheDocument()
      expect(botonAgregar()).toHaveTextContent('$800.00')
    })
  })

  describe('plato sin descuento', () => {
    const milanesa = () => crearPlato({ id: 'mila', nombre: 'Milanesa', precioBase: 1000, ingredientes: [queso] })

    it('no muestra el círculo ni un precio tachado', () => {
      const { container } = renderDetalle('mila', menuConCategoria(milanesa()))

      expect(screen.queryByRole('img', { name: /de descuento/ })).not.toBeInTheDocument()
      expect(container.querySelector('s')).toBeNull()
    })

    it('el botón de agregar parte del precio base', () => {
      renderDetalle('mila', menuConCategoria(milanesa()))

      expect(botonAgregar()).toHaveTextContent('$1000.00')
    })

    it('los extras se suman al precio base', () => {
      renderDetalle('mila', menuConCategoria(milanesa()))

      fireEvent.click(screen.getAllByRole('button', { name: '+' })[0])

      expect(botonAgregar()).toHaveTextContent('$1150.00')
    })
  })

  it('un plato que no está en el menú muestra "Ítem no encontrado"', () => {
    renderDetalle('no-existe', menuConCategoria(crearPlato()))

    expect(screen.getByText('Ítem no encontrado')).toBeInTheDocument()
  })
})
