import type { MenuPublico } from '@menyu/types'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { api } from '../../services/api'
import { useCarritoStore } from '../../store/carritoStore'
import { usePublicMenuStore } from '../../store/publicMenuStore'
import { useSessionStore } from '../../store/sessionStore'
import { crearMenu, crearPlato, crearPlatoEnDescuento } from '../../test/fixtures'
import { useAnunciadorStore } from '../../utils/anunciador'
import { CarritoPage } from './CarritoPage'
import { axe } from '../../test/axe'

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
      expect(await screen.findAllByText('$ 1.600')).not.toHaveLength(0)
      expect(screen.queryByText('$ 2.000')).not.toBeInTheDocument()
    })

    it('avisa que se actualizaron los precios', async () => {
      renderCarrito()

      // La región de estado ya existe desde el principio: se espera a que tenga el texto.
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Actualizamos los precios de tu pedido'))
    })

    it('"Entendido" cierra el aviso y los precios nuevos quedan', async () => {
      renderCarrito()

      fireEvent.click(await screen.findByRole('button', { name: 'Entendido' }))

      expect(aviso()).not.toBeInTheDocument()
      expect(useCarritoStore.getState().items[0].precioUnitario).toBe(800)
    })
  })

  describe('si el descuento de un plato del carrito ya se sacó', () => {
    it('vuelve al precio base y avisa', async () => {
      publico.mockResolvedValue(menuCon(crearPlato({ precioBase: 1000 })))
      agregarMilanesaAlCarrito(800)

      renderCarrito()

      await waitFor(() => expect(aviso()).toBeInTheDocument())
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

  describe('estructura de la pantalla (accesibilidad)', () => {
    it('con platos: el título es el <h1>; la lista y la barra del total van dentro del <main> y el encabezado no', async () => {
      publico.mockResolvedValue(menuCon(crearPlato()))
      agregarMilanesaAlCarrito(1000)

      renderCarrito()

      expect(screen.getByRole('heading', { level: 1, name: 'Carrito' })).toBeInTheDocument()
      const principal = screen.getByRole('main')
      expect(principal).toContainElement(screen.getByRole('button', { name: 'Confirmar pedido' }))
      expect(principal).toContainElement(screen.getByText('Milanesa'))
      expect(principal).not.toContainElement(screen.getByRole('banner'))
      await waitFor(() => expect(publico).toHaveBeenCalled())
    })

    it('vacío: el título es el <h1> y el aviso va dentro del <main>', async () => {
      publico.mockResolvedValue(menuCon(crearPlato()))

      renderCarrito()

      expect(screen.getByRole('heading', { level: 1, name: 'Carrito' })).toBeInTheDocument()
      expect(screen.getByRole('main')).toContainElement(screen.getByText('Tu carrito está vacío'))
      await waitFor(() => expect(publico).toHaveBeenCalled())
    })

    it('con el pedido enviado, la confirmación va dentro del <main>', async () => {
      publico.mockResolvedValue(menuCon(crearPlato()))
      vi.mocked(api.orders.create).mockResolvedValue({
        id: 'abcdef-123',
        items: [{ id: 'i1', cantidad: 2, precioUnitario: 1000, item: { nombre: 'Milanesa' } }],
      } as never)
      agregarMilanesaAlCarrito(1000)
      renderCarrito()

      fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido' }))

      const confirmacion = await screen.findByText('¡Pedido enviado a cocina!')
      expect(screen.getByRole('main')).toContainElement(confirmacion)
    })

    it('no tiene violaciones de accesibilidad (axe), con platos y vacío', async () => {
      publico.mockResolvedValue(menuCon(crearPlato()))
      agregarMilanesaAlCarrito(1000)
      const conPlatos = renderCarrito()
      expect(await axe(conPlatos.container)).toHaveNoViolations()
      conPlatos.unmount()

      useCarritoStore.getState().vaciar()
      const vacio = renderCarrito()
      expect(await axe(vacio.container)).toHaveNoViolations()
    })
  })

  describe('lectores de pantalla: confirmación, cantidades, extras, aviso de precios y errores', () => {
    const mensaje = () => useAnunciadorStore.getState().mensaje

    const agregarConExtras = () =>
      useCarritoStore.getState().agregar({
        itemMenuId: 'plato-1',
        nombre: 'Milanesa',
        precioUnitario: 1000,
        cantidad: 1,
        nota: 'Bien cocida',
        modificaciones: [
          { itemIngredienteId: 'i1', accion: 'quitar', cantidad: 1, nombre: 'Cebolla' },
          { itemIngredienteId: 'i2', accion: 'agregar', cantidad: 2, nombre: 'Cheddar' },
        ],
      })

    /** El carrito dentro de rutas, para ver a dónde lleva el nombre del plato. */
    function Detalle() {
      const { cartId } = useLocation().state as { cartId: string }
      return <p>detalle del plato con carrito {cartId}</p>
    }
    const renderConRutas = () =>
      render(
        <MemoryRouter initialEntries={['/carrito']}>
          <Routes>
            <Route path="/carrito" element={<CarritoPage />} />
            <Route path="/menu/:itemId" element={<Detalle />} />
            <Route path="/menu" element={<p>pantalla del menú</p>} />
          </Routes>
        </MemoryRouter>,
      )

    beforeEach(() => {
      useAnunciadorStore.setState({ mensaje: '', numero: 0 })
      vi.mocked(api.orders.create).mockReset()
      publico.mockResolvedValue(menuCon(crearPlato()))
    })

    describe('al confirmar el pedido', () => {
      const confirmar = async () => {
        vi.mocked(api.orders.create).mockResolvedValue({
          id: 'abcdef-123',
          items: [{ id: 'i1', cantidad: 2, precioUnitario: 1000, item: { nombre: 'Milanesa' } }],
        } as never)
        agregarMilanesaAlCarrito(1000)
        renderCarrito()
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido' }))
        return screen.findByRole('heading', { level: 1, name: '¡Pedido enviado a cocina!' })
      }

      it('el título de la confirmación es el <h1> y recibe el foco', async () => {
        const titulo = await confirmar()

        await waitFor(() => expect(titulo).toHaveFocus())
        expect(titulo).toHaveAttribute('tabindex', '-1')
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
      })

      it('el tilde es solo para la vista y el número de pedido se lee "Pedido ABCDEF", sin el "#"', async () => {
        await confirmar()

        expect(screen.getByText('✓').closest('[aria-hidden="true"]')).not.toBeNull()
        const codigo = screen.getByText('ABCDEF')
        expect(codigo.querySelector('[aria-hidden="true"]')).toHaveTextContent('#')
        expect(codigo.parentElement).toHaveTextContent('Pedido #ABCDEF')
      })

      it('"Pedir la cuenta" y "Volver al menú" siguen funcionando', async () => {
        await confirmar()

        expect(screen.getByRole('button', { name: 'Pedir la cuenta' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Volver al menú' })).toBeInTheDocument()
      })

      it('no tiene violaciones de accesibilidad (axe)', async () => {
        await confirmar()

        expect(await axe(document.body)).toHaveNoViolations()
      })
    })

    describe('cantidad y "Quitar"', () => {
      it('cada botón dice de qué plato es, y sumar y restar anuncian "Milanesa: N"', () => {
        agregarMilanesaAlCarrito(1000, 1)
        renderCarrito()

        fireEvent.click(screen.getByRole('button', { name: 'Sumar Milanesa' }))
        expect(useCarritoStore.getState().items[0].cantidad).toBe(2)
        expect(mensaje()).toBe('Milanesa: 2')

        fireEvent.click(screen.getByRole('button', { name: 'Restar Milanesa' }))
        expect(useCarritoStore.getState().items[0].cantidad).toBe(1)
        expect(mensaje()).toBe('Milanesa: 1')
      })

      it('en 1 el botón de restar no se deshabilita: queda aria-disabled, conserva el foco y no cambia nada', () => {
        agregarMilanesaAlCarrito(1000, 1)
        renderCarrito()
        const restar = screen.getByRole('button', { name: 'Restar Milanesa' })
        restar.focus()

        expect(restar).toHaveAttribute('aria-disabled', 'true')
        expect(restar).not.toBeDisabled()
        fireEvent.click(restar)

        expect(useCarritoStore.getState().items[0].cantidad).toBe(1)
        expect(restar).toHaveFocus()
        expect(mensaje()).toBe('')
      })

      it('"Quitar" dice qué plato saca y lo saca', () => {
        agregarMilanesaAlCarrito(1000)
        renderCarrito()

        fireEvent.click(screen.getByRole('button', { name: 'Quitar Milanesa' }))

        expect(useCarritoStore.getState().items).toHaveLength(0)
        expect(screen.getByText('Tu carrito está vacío')).toBeInTheDocument()
      })
    })

    describe('el plato, sus extras y su nota', () => {
      it('los extras se escriben en palabras: "Sin Cebolla · Con Cheddar, 2", sin "+ Cheddar ×2"', () => {
        agregarConExtras()
        renderCarrito()

        expect(screen.getByText('Sin Cebolla · Con Cheddar, 2')).toBeInTheDocument()
        expect(screen.queryByText(/\+ Cheddar/)).not.toBeInTheDocument()
        expect(screen.queryByText(/×/)).not.toBeInTheDocument()
      })

      it('si una modificación no trae el nombre, dice "ingrediente" o "extra"', () => {
        useCarritoStore.getState().agregar({
          itemMenuId: 'plato-1',
          nombre: 'Milanesa',
          precioUnitario: 1000,
          cantidad: 1,
          modificaciones: [
            { itemIngredienteId: 'i1', accion: 'quitar', cantidad: 1 },
            { itemIngredienteId: 'i2', accion: 'agregar', cantidad: 1 },
          ],
        })
        renderCarrito()

        expect(screen.getByText('Sin ingrediente · Con extra, 1')).toBeInTheDocument()
      })

      it('la nota se lee "Nota para cocina: …" y el emoji queda oculto', () => {
        agregarConExtras()
        renderCarrito()

        const nota = screen.getByText('Bien cocida', { exact: false })
        expect(nota).toHaveTextContent('Nota para cocina: Bien cocida')
        expect(screen.getByText('📝')).toHaveAttribute('aria-hidden', 'true')
      })

      it('el nombre es un botón "Editar Milanesa" que lleva al detalle del plato con su lugar en el carrito', () => {
        agregarMilanesaAlCarrito(1000)
        renderConRutas()
        const cartId = useCarritoStore.getState().items[0].cartId

        const nombre = screen.getByRole('button', { name: 'Editar Milanesa' })
        expect(nombre).toHaveTextContent('Milanesa')
        fireEvent.mouseEnter(nombre)
        expect(nombre).toHaveStyle({ textDecoration: 'underline' })
        fireEvent.mouseLeave(nombre)
        expect(nombre).toHaveStyle({ textDecoration: 'none' })
        fireEvent.click(nombre)

        expect(screen.getByText(`detalle del plato con carrito ${cartId}`)).toBeInTheDocument()
      })
    })

    describe('el aviso de precios actualizados', () => {
      it('la región está siempre montada: vacía y fuera de la vista sin aviso, y con el texto (la misma) cuando hay', async () => {
        agregarMilanesaAlCarrito(1000)
        renderCarrito()
        await waitFor(() => expect(usePublicMenuStore.getState().menu).not.toBeNull())

        const region = screen.getByRole('status')
        expect(region).toBeEmptyDOMElement()
        expect(region.parentElement).toHaveClass('sr-only')

        act(() => { useCarritoStore.setState({ avisoPrecios: true }) })

        expect(screen.getByRole('status')).toBe(region)
        expect(region).toHaveTextContent('Actualizamos los precios de tu pedido')
        expect(region.parentElement).not.toHaveClass('sr-only')
        // El botón queda afuera de la región: no se lee como parte del aviso.
        expect(region).not.toContainElement(screen.getByRole('button', { name: 'Entendido' }))
      })

      it('al descartar el aviso la región sigue, vacía', async () => {
        agregarMilanesaAlCarrito(1000)
        renderCarrito()
        await waitFor(() => expect(usePublicMenuStore.getState().menu).not.toBeNull())
        act(() => { useCarritoStore.setState({ avisoPrecios: true }) })
        const region = screen.getByRole('status')

        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))

        expect(screen.getByRole('status')).toBe(region)
        expect(region).toBeEmptyDOMElement()
        expect(screen.queryByRole('button', { name: 'Entendido' })).not.toBeInTheDocument()
      })
    })

    describe('si no se pudo enviar el pedido', () => {
      it('el error se anuncia como alerta', async () => {
        vi.mocked(api.orders.create).mockRejectedValue(new Error('La cocina no está recibiendo pedidos'))
        agregarMilanesaAlCarrito(1000)
        renderCarrito()

        fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido' }))

        expect(await screen.findByRole('alert')).toHaveTextContent('La cocina no está recibiendo pedidos')
      })

      it('sin sesión de mesa lo dice también como alerta y no llama al servidor', () => {
        useSessionStore.setState({ jwt: null })
        agregarMilanesaAlCarrito(1000)
        renderCarrito()

        fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido' }))

        expect(screen.getByRole('alert')).toHaveTextContent('No hay sesión activa')
        expect(api.orders.create).not.toHaveBeenCalled()
      })
    })

    it('con extras, nota y aviso de precios no tiene violaciones de accesibilidad (axe)', async () => {
      agregarConExtras()
      const { container } = renderCarrito()
      await waitFor(() => expect(usePublicMenuStore.getState().menu).not.toBeNull())
      act(() => { useCarritoStore.setState({ avisoPrecios: true }) })

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
