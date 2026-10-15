import type { MenuPublico } from '@menyu/types'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../services/api'
import { useCarritoStore } from '../../store/carritoStore'
import { usePublicMenuStore } from '../../store/publicMenuStore'
import { useSessionStore } from '../../store/sessionStore'
import { crearMenu, crearPlato, crearPlatoEnDescuento, crearTokenJwt } from '../../test/fixtures'
import { ClienteMenuPage } from './ClienteMenuPage'

vi.mock('../../services/api', () => ({
  api: {
    menu: { publico: vi.fn() },
    waiterCalls: { llamar: vi.fn() },
    orders: { list: vi.fn() },
  },
}))

class IntersectionObserverFalso {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  takeRecords = vi.fn(() => [])
}

const hamburguesa = crearPlatoEnDescuento({ id: 'hamb', nombre: 'Hamburguesa', precioBase: 1500, precioDescuento: 1200 })
const ensalada = crearPlato({ id: 'ens', nombre: 'Ensalada', precioBase: 900 })
const flan = crearPlato({ id: 'flan', nombre: 'Flan', precioBase: 700 })

function menuCompleto(): MenuPublico {
  return crearMenu({
    categorias: [
      { id: 'cat-1', nombre: 'Principales', orden: 1, itemsDirectos: [hamburguesa, ensalada] },
      { id: 'cat-2', nombre: 'Postres', orden: 2, itemsDirectos: [flan] },
    ],
    recomendados: [ensalada],
    descuentos: [hamburguesa],
  })
}

function renderMenu(menu: MenuPublico) {
  usePublicMenuStore.setState({ menu, loading: false, error: null })
  return render(
    <MemoryRouter initialEntries={['/menu']}>
      <Routes>
        <Route path="/menu" element={<ClienteMenuPage />} />
        <Route path="/menu/:itemId" element={<p>Detalle del plato</p>} />
        <Route path="/carrito" element={<p>Pantalla del carrito</p>} />
        <Route path="/etiquetar" element={<p>Pantalla de etiquetar</p>} />
        <Route path="/pedidos" element={<p>Pantalla de pedidos</p>} />
        <Route path="/pagar" element={<p>Pantalla de pagar</p>} />
        <Route path="/auth" element={<p>Pantalla de ingreso</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const idsDeSecciones = (contenedor: HTMLElement) =>
  Array.from(contenedor.querySelectorAll('[data-categoria-id]')).map((s) => s.getAttribute('data-categoria-id'))

const seccion = (contenedor: HTMLElement, id: string) =>
  contenedor.querySelector<HTMLElement>(`[data-categoria-id="${id}"]`)

describe('ClienteMenuPage', () => {
  // jsdom no trae IntersectionObserver ni scrollIntoView. Se dejan puestos todo el archivo: la página los usa
  // también en efectos que corren después de cada test, antes de que Testing Library la desmonte.
  beforeAll(() => {
    vi.stubGlobal('IntersectionObserver', IntersectionObserverFalso)
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    useSessionStore.setState({ restauranteId: 'rest-1', sesionId: null, mesaId: null, jwt: null, numeroMesa: null })
    usePublicMenuStore.setState({ menu: null, loading: false, error: null })
  })

  // Lo que la carta en modo vista (sin pedir) no tiene y el menú de la mesa sí: se prueba acá para que, al compartir
  // las piezas entre los dos modos, el de la mesa no cambie.
  describe('modo mesa', () => {
    const mesa = { sesionId: 'ses-1', mesaId: 'mesa-1', jwt: 'jwt', numeroMesa: '5', modoSesion: 'abierto', codigoSesion: '042' }

    beforeEach(() => {
      useSessionStore.setState(mesa)
      useCarritoStore.getState().vaciar()
      vi.mocked(api.waiterCalls.llamar).mockReset().mockResolvedValue(undefined as never)
      vi.mocked(api.orders.list).mockReset().mockResolvedValue([])
    })

    afterEach(() => {
      localStorage.clear()
      useCarritoStore.getState().vaciar()
    })

    describe('header', () => {
      it('muestra el nombre del restaurante y el número de la mesa', () => {
        renderMenu(menuCompleto())

        expect(screen.getByRole('banner')).toHaveTextContent('La Parrilla')
        expect(screen.getByText('Mesa 5')).toBeInTheDocument()
      })

      it('en una mesa en modo seguro también muestra el código (PIN)', () => {
        useSessionStore.setState({ modoSesion: 'seguro', codigoSesion: '731' })
        renderMenu(menuCompleto())

        expect(screen.getByText('PIN 731')).toBeInTheDocument()
      })

      it('en modo abierto no muestra el código', () => {
        renderMenu(menuCompleto())

        expect(screen.queryByText(/^PIN /)).not.toBeInTheDocument()
      })

      it('"Mozo" llama al mozo de la mesa y avisa que está en camino', async () => {
        renderMenu(menuCompleto())

        fireEvent.click(screen.getByRole('button', { name: /Mozo/ }))

        expect(await screen.findByRole('button', { name: /¡En camino!/ })).toBeDisabled()
        expect(api.waiterCalls.llamar).toHaveBeenCalledWith('ses-1', 'jwt')
      })

      it('si el llamado falla, lo dice', async () => {
        vi.mocked(api.waiterCalls.llamar).mockRejectedValue(new Error('sin conexión'))
        renderMenu(menuCompleto())

        fireEvent.click(screen.getByRole('button', { name: /Mozo/ }))

        expect(await screen.findByRole('button', { name: /Error/ })).toBeInTheDocument()
      })

      it('sin una sesión de mesa no hay botón del mozo ni número de mesa', () => {
        useSessionStore.setState({ sesionId: null, mesaId: null, jwt: null, numeroMesa: null })
        renderMenu(menuCompleto())

        expect(screen.queryByRole('button', { name: /Mozo/ })).not.toBeInTheDocument()
        expect(screen.queryByText(/^Mesa /)).not.toBeInTheDocument()
      })
    })

    describe('cuando no se puede cargar el menú', () => {
      const pedirOriginal = usePublicMenuStore.getState().fetchMenu
      // El pedido no hace nada: así el error que se deja puesto en el store es el que se ve.
      const conError = (errorStatus: number | null, fetchMenu = vi.fn().mockResolvedValue(undefined)) => {
        usePublicMenuStore.setState({ menu: null, loading: false, error: 'No se pudo', errorStatus, fetchMenu })
        return fetchMenu
      }

      // Se desmonta la pantalla antes de devolver el pedido de verdad, para que el cambio no llegue a una pantalla abierta.
      afterEach(() => {
        cleanup()
        usePublicMenuStore.setState({ fetchMenu: pedirOriginal })
      })

      it.each([[null], [404], [500]])('con el código %s avisa "No se pudo cargar el menú" y deja reintentar (nunca dice "no existe")', (status) => {
        conError(status)
        render(
          <MemoryRouter initialEntries={['/menu']}>
            <Routes><Route path="/menu" element={<ClienteMenuPage />} /></Routes>
          </MemoryRouter>,
        )

        expect(screen.getByText('No se pudo cargar el menú')).toBeInTheDocument()
        expect(screen.queryByText('No encontramos este restaurante')).not.toBeInTheDocument()
        // "Volver al restaurante" es de la carta: la mesa ya tiene su restaurante.
        expect(screen.queryByText('Volver al restaurante')).not.toBeInTheDocument()
      })

      it('"Reintentar" vuelve a pedir el menú del restaurante de la mesa', () => {
        const pedir = conError(500)
        render(
          <MemoryRouter initialEntries={['/menu']}>
            <Routes><Route path="/menu" element={<ClienteMenuPage />} /></Routes>
          </MemoryRouter>,
        )
        pedir.mockClear()

        fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

        expect(pedir).toHaveBeenCalledTimes(1)
        expect(pedir).toHaveBeenCalledWith('rest-1')
      })
    })

    describe('el restaurante en el header y en el menú lateral', () => {
      it('el logo es el botón del header y la dirección está en el menú lateral', () => {
        renderMenu(crearMenu({
          restaurante: { id: 'rest-1', nombre: 'La Parrilla', logoUrl: 'https://x/logo-parrilla.png', direccion: 'Av. Alicia Moreau de Justo 1150, Puerto Madero' },
          categorias: [{ id: 'cat-1', nombre: 'Principales', orden: 1, itemsDirectos: [flan] }],
        }))

        expect(screen.getByRole('button', { name: 'Abrir el menú' }).querySelector('img')).toHaveAttribute('src', 'https://x/logo-parrilla.png')
        expect(screen.getByText('Av. Alicia Moreau de Justo 1150, Puerto Madero')).toBeInTheDocument()
      })

      it('sin logo muestra el de MenYU en el header', () => {
        renderMenu(menuCompleto())

        expect(screen.getByRole('button', { name: 'Abrir el menú' }).querySelector('img')).toHaveAttribute('src', '/logo-u.png')
      })
    })

    describe('platos y carrito', () => {
      it('cada plato tiene su botón "+" y tocarlo abre el detalle', () => {
        const { container } = renderMenu(menuCompleto())

        fireEvent.click(within(seccion(container, 'cat-2')!).getByRole('button', { name: 'Agregar Flan' }))

        expect(screen.getByText('Detalle del plato')).toBeInTheDocument()
      })

      it('con platos en el carrito aparece el botón flotante con la cantidad y lleva al carrito', () => {
        useCarritoStore.getState().agregar({ itemMenuId: 'flan', nombre: 'Flan', precioUnitario: 700, cantidad: 1, modificaciones: [] })
        useCarritoStore.getState().agregar({ itemMenuId: 'ens', nombre: 'Ensalada', precioUnitario: 900, cantidad: 1, modificaciones: [] })
        renderMenu(menuCompleto())

        const carrito = screen.getByRole('button', { name: /🛒/ })
        expect(carrito).toHaveTextContent('2')
        fireEvent.click(carrito)

        expect(screen.getByText('Pantalla del carrito')).toBeInTheDocument()
      })

      it('con el carrito vacío no hay botón flotante', () => {
        renderMenu(menuCompleto())

        expect(screen.queryByRole('button', { name: /🛒/ })).not.toBeInTheDocument()
      })
    })

    describe('menú lateral', () => {
      it.each([
        ['Etiquetar pedidos', 'Pantalla de etiquetar'],
        ['Mis pedidos', 'Pantalla de pedidos'],
        ['Pagar la cuenta', 'Pantalla de pagar'],
      ])('"%s" lleva a su pantalla', (fila, pantalla) => {
        renderMenu(menuCompleto())

        fireEvent.click(screen.getByText(fila))

        expect(screen.getByText(pantalla)).toBeInTheDocument()
      })

      it('sin cuenta ofrece iniciar sesión y crear una', () => {
        renderMenu(menuCompleto())

        expect(screen.getByText('Estás navegando como invitado')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

        expect(screen.getByText('Pantalla de ingreso')).toBeInTheDocument()
      })

      it('"Crear cuenta gratis" abre el registro', () => {
        renderMenu(menuCompleto())

        fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta gratis' }))

        expect(screen.getByText('Pantalla de ingreso')).toBeInTheDocument()
      })

      describe('con cuenta', () => {
        beforeEach(() => {
          localStorage.setItem('menyu_access_token', crearTokenJwt({ tipo: 'cliente', nombre: 'Ana Gómez', email: 'ana@mail.com' }))
          localStorage.setItem('menyu_refresh_token', 'refresh')
        })

        // Se abre desde el botón del header (el logo del restaurante), como en la app.
        const abrirMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Abrir el menú' }))
        const cerrarSesion = () => screen.queryByRole('button', { name: 'Cerrar sesión' })
        const esperar = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })

        it('muestra el saludo con el nombre completo y el email, en lugar de iniciar sesión o crear una cuenta', () => {
          renderMenu(menuCompleto())

          expect(screen.getByText('¡Hola, Ana Gómez!')).toBeInTheDocument()
          expect(screen.getByText('ana@mail.com')).toBeInTheDocument()
          expect(screen.getByText('Mis puntos')).toBeInTheDocument()
          expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).not.toBeInTheDocument()
          expect(screen.queryByRole('button', { name: 'Crear cuenta gratis' })).not.toBeInTheDocument()
        })

        it('si la mesa todavía no pidió nada ofrece "Cerrar sesión", que borra la sesión de cliente', async () => {
          renderMenu(menuCompleto())
          abrirMenu()

          fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))

          expect(api.orders.list).toHaveBeenCalledWith('jwt')
          expect(localStorage.getItem('menyu_access_token')).toBeNull()
          expect(localStorage.getItem('menyu_refresh_token')).toBeNull()
          expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
        })

        it('si la mesa ya pidió algo no ofrece "Cerrar sesión" (y el saludo sigue)', async () => {
          vi.mocked(api.orders.list).mockResolvedValue([{ id: 'p1', estado: 'en_preparacion' }])
          renderMenu(menuCompleto())
          abrirMenu()
          await esperar()

          expect(api.orders.list).toHaveBeenCalledTimes(1)
          expect(cerrarSesion()).not.toBeInTheDocument()
          expect(screen.getByText('¡Hola, Ana Gómez!')).toBeInTheDocument()
        })

        it('si lo único que pidió la mesa fue anulado, sí ofrece "Cerrar sesión"', async () => {
          vi.mocked(api.orders.list).mockResolvedValue([{ id: 'p1', estado: 'anulado' }])
          renderMenu(menuCompleto())
          abrirMenu()

          expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
        })

        it('si no se puede saber si la mesa pidió algo, no lo ofrece', async () => {
          vi.mocked(api.orders.list).mockRejectedValue(new Error('sin conexión'))
          renderMenu(menuCompleto())
          abrirMenu()
          await esperar()

          expect(cerrarSesion()).not.toBeInTheDocument()
        })

        it('mientras se averigua tampoco se ofrece (para que no aparezca y desaparezca)', async () => {
          vi.mocked(api.orders.list).mockReturnValue(new Promise(() => {}))
          renderMenu(menuCompleto())
          abrirMenu()
          await esperar()

          expect(cerrarSesion()).not.toBeInTheDocument()
        })

        it('no consulta los pedidos hasta que se abre el menú lateral', async () => {
          renderMenu(menuCompleto())
          await esperar()

          expect(api.orders.list).not.toHaveBeenCalled()
        })
      })

      it('sin cuenta no se consultan los pedidos', () => {
        renderMenu(menuCompleto())
        fireEvent.click(screen.getByRole('button', { name: 'Abrir el menú' }))

        expect(api.orders.list).not.toHaveBeenCalled()
      })

      it('un invitado con nombre de comensal es saludado por ese nombre', async () => {
        const { useComensalStore } = await import('../../store/comensalStore')
        useComensalStore.setState({ nombre: 'Lucía' })
        const { unmount } = renderMenu(menuCompleto())

        expect(screen.getByText('¡Hola, Lucía!')).toBeInTheDocument()
        // Se desmonta antes de limpiar el nombre: así el cambio no llega a una pantalla que sigue abierta.
        unmount()
        useComensalStore.getState().reset()
      })
    })

    describe('filtro de dietas', () => {
      const vegano = { id: 'veg', nombre: 'Vegano' }
      const menuConDietas = () => crearMenu({
        categorias: [{ id: 'cat-1', nombre: 'Principales', orden: 1, itemsDirectos: [
          crearPlato({ id: 'ens', nombre: 'Ensalada', clasificaciones: [vegano] }),
          crearPlato({ id: 'bife', nombre: 'Bife' }),
        ] }],
      })

      it('lista las clasificaciones con la cantidad de platos y aplica la elegida', () => {
        renderMenu(menuConDietas())

        fireEvent.click(screen.getByRole('button', { name: /Dietas/ }))
        expect(screen.getByText('Vegano')).toBeInTheDocument()
        fireEvent.click(screen.getByText('Vegano'))
        fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' }))

        expect(screen.getByText('Ensalada')).toBeInTheDocument()
        expect(screen.queryByText('Bife')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Dietas/ })).toHaveTextContent('1')
      })

      it('"Limpiar" vuelve a mostrar todos los platos', () => {
        renderMenu(menuConDietas())
        fireEvent.click(screen.getByRole('button', { name: /Dietas/ }))
        fireEvent.click(screen.getByText('Vegano'))
        fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' }))

        fireEvent.click(screen.getByRole('button', { name: /Dietas/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))

        expect(screen.getByText('Bife')).toBeInTheDocument()
      })
    })
  })

  describe('saludo del menú lateral', () => {
    afterEach(() => localStorage.clear())

    it('saluda por el nombre completo del cliente con sesión, con los acentos y la Ñ bien', () => {
      localStorage.setItem('menyu_access_token', crearTokenJwt({ tipo: 'cliente', nombre: 'Ñandú Gómez' }))

      renderMenu(menuCompleto())

      expect(screen.getByText('¡Hola, Ñandú Gómez!')).toBeInTheDocument()
    })

    it('sin sesión de cliente no hay saludo', () => {
      renderMenu(menuCompleto())

      expect(screen.queryByText(/^¡Hola,/)).not.toBeInTheDocument()
    })
  })

  describe('sección Descuentos', () => {
    it('va primero, antes de las recomendaciones y de las categorías', () => {
      const { container } = renderMenu(menuCompleto())

      expect(idsDeSecciones(container)).toEqual(['descuentos', 'recomendados', 'cat-1', 'cat-2'])
    })

    it('tiene su título', () => {
      renderMenu(menuCompleto())

      expect(screen.getByRole('heading', { name: 'Descuentos' })).toBeInTheDocument()
    })

    it('muestra los platos en descuento con el círculo del porcentaje y los dos precios', () => {
      const { container } = renderMenu(menuCompleto())
      const descuentos = within(seccion(container, 'descuentos')!)

      expect(descuentos.getByText('Hamburguesa')).toBeInTheDocument()
      expect(descuentos.getByRole('img', { name: '20% de descuento' })).toBeInTheDocument()
      expect(descuentos.getByText('$1500.00')).toBeInTheDocument()
      expect(descuentos.getByText('$1200.00')).toBeInTheDocument()
    })

    it('en la categoría, el mismo plato también se ve con su descuento', () => {
      const { container } = renderMenu(menuCompleto())
      const principales = within(seccion(container, 'cat-1')!)

      expect(principales.getByRole('img', { name: '20% de descuento' })).toBeInTheDocument()
      expect(principales.getByText('$1200.00')).toBeInTheDocument()
    })

    it('un plato sin descuento no tiene círculo en ninguna sección', () => {
      const { container } = renderMenu(menuCompleto())
      const postres = within(seccion(container, 'cat-2')!)

      expect(postres.getByText('$700.00')).toBeInTheDocument()
      expect(postres.queryByRole('img', { name: /de descuento/ })).not.toBeInTheDocument()
    })

    it('hay un chip Descuentos primero, y está activo al abrir el menú', () => {
      renderMenu(menuCompleto())
      const nombres = ['Descuentos', 'RECOMENDACIONES', 'Principales', 'Postres']
      const chips = screen.getAllByRole('button').filter((b) => nombres.includes(b.textContent ?? ''))

      expect(chips.map((c) => c.textContent)).toEqual(nombres)
      expect(chips[0]).toHaveStyle({ background: '#2D3561' })
      expect(chips[1]).not.toHaveStyle({ background: '#2D3561' })
    })

    it('tocar el chip lleva a la sección', () => {
      renderMenu(menuCompleto())

      fireEvent.click(screen.getByRole('button', { name: 'Postres' }))

      const llamadas = vi.mocked(Element.prototype.scrollIntoView).mock.contexts
      expect(llamadas).toHaveLength(1)
      expect(llamadas[0]).toHaveAttribute('data-categoria-id', 'cat-2')
    })

    it('tocar un plato en descuento abre su detalle', () => {
      const { container } = renderMenu(menuCompleto())

      fireEvent.click(within(seccion(container, 'descuentos')!).getByText('Hamburguesa'))

      expect(screen.getByText('Detalle del plato')).toBeInTheDocument()
    })
  })

  describe('sin platos en descuento', () => {
    it('no aparece la sección ni el chip, y la primera sección son las recomendaciones', () => {
      const menu = { ...menuCompleto(), descuentos: [] }
      const { container } = renderMenu(menu)

      expect(idsDeSecciones(container)).toEqual(['recomendados', 'cat-1', 'cat-2'])
      expect(screen.queryByRole('heading', { name: 'Descuentos' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Descuentos' })).not.toBeInTheDocument()
    })

    it('con un backend sin actualizar, que no manda el campo descuentos, el menú se ve igual', () => {
      const menu = menuCompleto() as Partial<MenuPublico>
      delete menu.descuentos
      const { container } = renderMenu(menu as MenuPublico)

      expect(idsDeSecciones(container)).toEqual(['recomendados', 'cat-1', 'cat-2'])
    })

    it('sin descuentos ni recomendaciones, la primera sección es la primera categoría', () => {
      const menu = { ...menuCompleto(), descuentos: [], recomendados: [] }
      const { container } = renderMenu(menu)

      expect(idsDeSecciones(container)).toEqual(['cat-1', 'cat-2'])
    })
  })

  describe('un restaurante que no cargó ningún plato', () => {
    it('el menú dice que todavía no cargó su carta, no que una categoría está vacía', () => {
      renderMenu(crearMenu())

      expect(screen.getByText('Este restaurante todavía no cargó su carta')).toBeInTheDocument()
      expect(screen.queryByText(/No hay ítems en esta categoría/)).not.toBeInTheDocument()
    })
  })

  describe('buscador', () => {
    it('también filtra los descuentos', async () => {
      const user = userEvent.setup()
      const { container } = renderMenu(menuCompleto())

      await user.type(screen.getByPlaceholderText('Buscar platos...'), 'ensa')

      expect(idsDeSecciones(container)).toEqual(['recomendados', 'cat-1'])
    })

    it('si el plato en descuento coincide, la sección sigue y se van las demás', async () => {
      const user = userEvent.setup()
      const { container } = renderMenu(menuCompleto())

      await user.type(screen.getByPlaceholderText('Buscar platos...'), 'hamb')

      expect(idsDeSecciones(container)).toEqual(['descuentos', 'cat-1'])
    })

    it('si nada coincide, muestra el estado vacío', async () => {
      const user = userEvent.setup()
      renderMenu(menuCompleto())

      await user.type(screen.getByPlaceholderText('Buscar platos...'), 'zzz')

      expect(screen.getByText('No hay platos que coincidan con "zzz"')).toBeInTheDocument()
    })
  })
})
