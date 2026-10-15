import type { MenuPublico } from '@menyu/types'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../services/api'
import { useCarritoStore } from '../../store/carritoStore'
import { usePublicMenuStore } from '../../store/publicMenuStore'
import { useSessionStore } from '../../store/sessionStore'
import { crearMenu, crearPlato, crearPlatoEnDescuento } from '../../test/fixtures'
import { CarritoPage } from './CarritoPage'

vi.mock('../../services/api', () => ({
  api: {
    menu: { publico: vi.fn() },
    orders: { create: vi.fn() },
  },
}))

const publico = vi.mocked(api.menu.publico)

const menuCon = (plato: ReturnType<typeof crearPlato>): MenuPublico =>
  crearMenu({ categorias: [{ id: 'cat-1', nombre: 'Principales', orden: 1, itemsDirectos: [plato] }] })

function agregarMilanesaAlCarrito(precioUnitario: number, cantidad = 2) {
  useCarritoStore.getState().agregar({
    itemMenuId: 'plato-1',
    nombre: 'Milanesa',
    precioUnitario,
    cantidad,
    modificaciones: [],
  })
}

function renderCarrito() {
  return render(
    <MemoryRouter>
      <CarritoPage />
    </MemoryRouter>,
  )
}

const aviso = () => screen.queryByText(/Actualizamos los precios de tu pedido/)

describe('CarritoPage', () => {
  beforeEach(() => {
    publico.mockReset()
    useCarritoStore.getState().vaciar()
    usePublicMenuStore.setState({ menu: null, loading: false, error: null })
    useSessionStore.setState({ restauranteId: 'rest-1', jwt: 'jwt', numeroMesa: '5' })
    localStorage.clear()
  })

  it('al abrirse pide el menú del restaurante', async () => {
    publico.mockResolvedValue(menuCon(crearPlato()))
    agregarMilanesaAlCarrito(1000)

    renderCarrito()

    await waitFor(() => expect(publico).toHaveBeenCalledWith('rest-1'))
  })

  it('sin restaurante en la sesión no pide el menú', () => {
    useSessionStore.setState({ restauranteId: null })
    agregarMilanesaAlCarrito(1000)

    renderCarrito()

    expect(publico).not.toHaveBeenCalled()
  })

  describe('si un plato del carrito tiene un descuento nuevo', () => {
    beforeEach(() => {
      publico.mockResolvedValue(menuCon(crearPlatoEnDescuento({ precioBase: 1000, precioDescuento: 800 })))
      agregarMilanesaAlCarrito(1000)
    })

    it('corrige el precio del plato y el total', async () => {
      renderCarrito()

      await waitFor(() => expect(useCarritoStore.getState().items[0].precioUnitario).toBe(800))
      // 2 × $800 aparece en la línea del plato y en el total
      expect(await screen.findAllByText('$1600.00')).not.toHaveLength(0)
      expect(screen.queryByText('$2000.00')).not.toBeInTheDocument()
    })

    it('avisa que se actualizaron los precios', async () => {
      renderCarrito()

      expect(await screen.findByRole('status')).toHaveTextContent('Actualizamos los precios de tu pedido')
    })

    it('"Entendido" cierra el aviso y los precios nuevos quedan', async () => {
      renderCarrito()
      await screen.findByRole('status')

      fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))

      expect(aviso()).not.toBeInTheDocument()
      expect(useCarritoStore.getState().items[0].precioUnitario).toBe(800)
    })
  })

  describe('si el descuento de un plato del carrito ya se sacó', () => {
    it('vuelve al precio base y avisa', async () => {
      publico.mockResolvedValue(menuCon(crearPlato({ precioBase: 1000 })))
      agregarMilanesaAlCarrito(800)

      renderCarrito()

      expect(await screen.findByRole('status')).toBeInTheDocument()
      expect(useCarritoStore.getState().items[0].precioUnitario).toBe(1000)
      expect(useCarritoStore.getState().total()).toBe(2000)
    })
  })

  it('si los precios no cambiaron, no muestra el aviso', async () => {
    publico.mockResolvedValue(menuCon(crearPlatoEnDescuento({ precioBase: 1000, precioDescuento: 800 })))
    agregarMilanesaAlCarrito(800)

    renderCarrito()
    await waitFor(() => expect(publico).toHaveBeenCalled())
    await waitFor(() => expect(usePublicMenuStore.getState().menu).not.toBeNull())

    expect(aviso()).not.toBeInTheDocument()
  })

  it('si no se puede traer el menú, el carrito queda como estaba y sin aviso', async () => {
    publico.mockRejectedValue(new Error('Sin conexión'))
    agregarMilanesaAlCarrito(1000)

    renderCarrito()
    await waitFor(() => expect(usePublicMenuStore.getState().error).toBe('Sin conexión'))

    expect(useCarritoStore.getState().items[0].precioUnitario).toBe(1000)
    expect(aviso()).not.toBeInTheDocument()
  })
})
