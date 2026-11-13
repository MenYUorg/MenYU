import type { MenuPublico } from '@menyu/types'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../services/api'
import { useCarritoStore } from '../../store/carritoStore'
import { usePublicMenuStore } from '../../store/publicMenuStore'
import { useSessionStore } from '../../store/sessionStore'
import { crearMenu, crearPlato, crearPlatoEnDescuento } from '../../test/fixtures'
import { compartirLaSesionDeWebAuth, cuentaDePrueba, sesionDeSupabase, signOutSimulado } from '../../test/authClient'
import { irA } from '../../utils/navegar'
import { ClienteMenuPage } from './ClienteMenuPage'
import { axe } from '../../test/axe'
import { useAnunciadorStore } from '../../utils/anunciador'

vi.mock('../../utils/navegar', () => ({ irA: vi.fn() }))

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

        expect(await screen.findByRole('button', { name: '¡En camino!' })).toHaveAttribute('aria-disabled', 'true')
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

      it.each([[null], [500]])('con el código %s avisa "No se pudo cargar el menú" y deja reintentar (nunca dice "no existe")', (status) => {
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

      describe('con el código 404: el restaurante (o su marca) se dio de baja con la mesa abierta', () => {
        const renderizar = () =>
          render(
            <MemoryRouter initialEntries={['/menu']}>
              <Routes>
                <Route path="/menu" element={<ClienteMenuPage />} />
                <Route path="/pagar" element={<p>Pantalla de pagar</p>} />
                <Route path="/pedidos" element={<p>Pantalla de pedidos</p>} />
              </Routes>
            </MemoryRouter>,
          )

        it('en vez del error genérico explica que ya no está disponible y ofrece pedir la cuenta', () => {
          conError(404)
          renderizar()

          expect(screen.getByRole('heading', { name: 'Este restaurante ya no está disponible' })).toBeInTheDocument()
          expect(screen.getByText(/tu mesa sigue abierta/)).toBeInTheDocument()
          expect(screen.queryByText('No se pudo cargar el menú')).not.toBeInTheDocument()
          // Reintentar no sirve de nada: el menú va a seguir sin estar.
          expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
          // "No encontramos este restaurante" y "Volver al restaurante" son de la carta.
          expect(screen.queryByText('No encontramos este restaurante')).not.toBeInTheDocument()
          expect(screen.queryByText('Volver al restaurante')).not.toBeInTheDocument()
        })

        it('desde ahí se llega a pagar y a los pedidos, pero no al mozo', () => {
          conError(404)
          renderizar()
          // Con la baja, el personal recibe 403 al atender un llamado y al cobrar en efectivo (entrega 4.7).
          expect(screen.queryByRole('button', { name: /mozo/i })).not.toBeInTheDocument()

          fireEvent.click(screen.getByRole('button', { name: 'Pagar la cuenta' }))

          expect(screen.getByText('Pantalla de pagar')).toBeInTheDocument()
        })

        it('mientras vuelve a pedir el menú no muestra el aviso (solo cuando el 404 es el resultado)', () => {
          usePublicMenuStore.setState({ menu: null, loading: true, error: null, errorStatus: null, fetchMenu: vi.fn() })
          renderizar()

          expect(screen.queryByText('Este restaurante ya no está disponible')).not.toBeInTheDocument()
        })
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
      it('cada plato tiene su botón "+", que se llama "Ver {plato}", y tocarlo abre el detalle', () => {
        const { container } = renderMenu(menuCompleto())

        fireEvent.click(within(seccion(container, 'cat-2')!).getByRole('button', { name: 'Ver Flan' }))

        expect(screen.getByText('Detalle del plato')).toBeInTheDocument()
      })

      it('con platos en el carrito aparece el botón flotante con la cantidad y lleva al carrito', () => {
        useCarritoStore.getState().agregar({ itemMenuId: 'flan', nombre: 'Flan', precioUnitario: 700, cantidad: 1, modificaciones: [] })
        useCarritoStore.getState().agregar({ itemMenuId: 'ens', nombre: 'Ensalada', precioUnitario: 900, cantidad: 1, modificaciones: [] })
        renderMenu(menuCompleto())

        const carrito = screen.getByRole('button', { name: 'Ver carrito, 2 ítems' })
        expect(carrito).toHaveTextContent('2')
        fireEvent.click(carrito)

        expect(screen.getByText('Pantalla del carrito')).toBeInTheDocument()
      })

      it('con el carrito vacío no hay botón flotante', () => {
        renderMenu(menuCompleto())

        expect(screen.queryByRole('button', { name: /Ver carrito/ })).not.toBeInTheDocument()
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

      it('sin cuenta ofrece iniciar sesión (en web-auth, con la vuelta al menú de la mesa) y crear una', () => {
        vi.mocked(irA).mockClear()
        compartirLaSesionDeWebAuth()
        renderMenu(menuCompleto())

        expect(screen.getByText('Estás navegando como invitado')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

        expect(irA).toHaveBeenCalledWith(expect.stringMatching(/\/\?redirect=/))
      })

      it('"Crear cuenta gratis" abre el registro de web-auth', () => {
        vi.mocked(irA).mockClear()
        compartirLaSesionDeWebAuth()
        renderMenu(menuCompleto())

        fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta gratis' }))

        expect(irA).toHaveBeenCalledWith(expect.stringMatching(/\/crear-cuenta\?redirect=/))
      })

      describe('con cuenta', () => {
        beforeEach(() => {
          cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Ana Gómez', email: 'ana@mail.com' })
        })

        // Se abre desde el botón del header (el logo del restaurante), como en la app.
        const abrirMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Abrir el menú' }))
        const cerrarSesion = () => screen.queryByRole('button', { name: 'Cerrar sesión' })
        const esperar = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })

        it('muestra el saludo con el nombre completo y el email, en lugar de iniciar sesión o crear una cuenta', async () => {
          renderMenu(menuCompleto())

          expect(await screen.findByText('¡Hola, Ana Gómez!')).toBeInTheDocument()
          expect(screen.getByText('ana@mail.com')).toBeInTheDocument()
          expect(screen.getByText('Mis puntos')).toBeInTheDocument()
          expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).not.toBeInTheDocument()
          expect(screen.queryByRole('button', { name: 'Crear cuenta gratis' })).not.toBeInTheDocument()
        })

        it('si la mesa todavía no pidió nada ofrece "Cerrar sesión", que borra la sesión de cliente', async () => {
          renderMenu(menuCompleto())
          await screen.findByText('¡Hola, Ana Gómez!')
          abrirMenu()

          const cerrar = await screen.findByRole('button', { name: 'Cerrar sesión' })
          // Cerrar la cuenta es asíncrono (también cierra la de Supabase): act espera a que termine.
          await act(async () => {
            fireEvent.click(cerrar)
          })

          expect(api.orders.list).toHaveBeenCalledWith('jwt')
          expect(signOutSimulado).toHaveBeenCalledWith({ scope: 'local' })
          expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
        })

        it('si la mesa ya pidió algo no ofrece "Cerrar sesión" (y el saludo sigue)', async () => {
          vi.mocked(api.orders.list).mockResolvedValue([{ id: 'p1', estado: 'en_preparacion' }])
          renderMenu(menuCompleto())
          await screen.findByText('¡Hola, Ana Gómez!')
          abrirMenu()
          await esperar()

          expect(api.orders.list).toHaveBeenCalledTimes(1)
          expect(cerrarSesion()).not.toBeInTheDocument()
          expect(screen.getByText('¡Hola, Ana Gómez!')).toBeInTheDocument()
        })

        it('si lo único que pidió la mesa fue anulado, sí ofrece "Cerrar sesión"', async () => {
          vi.mocked(api.orders.list).mockResolvedValue([{ id: 'p1', estado: 'anulado' }])
          renderMenu(menuCompleto())
          await screen.findByText('¡Hola, Ana Gómez!')
          abrirMenu()

          expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
        })

        it('si no se puede saber si la mesa pidió algo, no lo ofrece', async () => {
          vi.mocked(api.orders.list).mockRejectedValue(new Error('sin conexión'))
          renderMenu(menuCompleto())
          await screen.findByText('¡Hola, Ana Gómez!')
          abrirMenu()
          await esperar()

          expect(cerrarSesion()).not.toBeInTheDocument()
        })

        it('mientras se averigua tampoco se ofrece (para que no aparezca y desaparezca)', async () => {
          vi.mocked(api.orders.list).mockReturnValue(new Promise(() => {}))
          renderMenu(menuCompleto())
          await screen.findByText('¡Hola, Ana Gómez!')
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

        fireEvent.click(screen.getByRole('button', { name: 'Filtrar por dietas' }))
        expect(screen.getByRole('checkbox', { name: 'Vegano, 1 plato' })).not.toBeChecked()
        fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 1 plato' }))
        fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' }))

        expect(screen.getByText('Ensalada')).toBeInTheDocument()
        expect(screen.queryByText('Bife')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Filtrar por dietas, 1 filtro activo' })).toHaveTextContent('1')
      })

      it('"Limpiar" vuelve a mostrar todos los platos', () => {
        renderMenu(menuConDietas())
        fireEvent.click(screen.getByRole('button', { name: 'Filtrar por dietas' }))
        fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 1 plato' }))
        fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' }))

        fireEvent.click(screen.getByRole('button', { name: 'Filtrar por dietas, 1 filtro activo' }))
        fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))

        expect(screen.getByText('Bife')).toBeInTheDocument()
      })
    })
  })

  describe('saludo del menú lateral', () => {
    afterEach(() => localStorage.clear())

    it('saluda por el nombre completo del cliente con sesión, con los acentos y la Ñ bien', async () => {
      cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Ñandú Gómez' })

      renderMenu(menuCompleto())

      expect(await screen.findByText('¡Hola, Ñandú Gómez!')).toBeInTheDocument()
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
      expect(descuentos.getByText('$ 1.500')).toBeInTheDocument()
      expect(descuentos.getByText('$ 1.200')).toBeInTheDocument()
    })

    it('en la categoría, el mismo plato también se ve con su descuento', () => {
      const { container } = renderMenu(menuCompleto())
      const principales = within(seccion(container, 'cat-1')!)

      expect(principales.getByRole('img', { name: '20% de descuento' })).toBeInTheDocument()
      expect(principales.getByText('$ 1.200')).toBeInTheDocument()
    })

    it('un plato sin descuento no tiene círculo en ninguna sección', () => {
      const { container } = renderMenu(menuCompleto())
      const postres = within(seccion(container, 'cat-2')!)

      expect(postres.getByText('$ 700')).toBeInTheDocument()
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

  describe('estructura de la pantalla (accesibilidad)', () => {
    it('el <h1> es el nombre del restaurante; el buscador y las secciones van dentro del <main> y el encabezado no', () => {
      renderMenu(menuCompleto())

      expect(screen.getByRole('heading', { level: 1, name: 'La Parrilla' })).toBeInTheDocument()
      const principal = screen.getByRole('main')
      expect(principal).toContainElement(screen.getByPlaceholderText('Buscar platos...'))
      expect(principal).toContainElement(screen.getByText('Flan'))
      expect(principal).not.toContainElement(screen.getByRole('banner'))
    })

    it('no tiene violaciones de accesibilidad (axe)', async () => {
      const { container } = renderMenu(menuCompleto())

      expect(await axe(container)).toHaveNoViolations()
    })
  })

  describe('menú lateral y filtro de dietas (accesibilidad)', () => {
    const abrirElMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Abrir el menú' }))
    const dialogo = () => screen.getByRole('dialog', { hidden: true })

    beforeEach(() => {
      useAnunciadorStore.setState({ mensaje: '', numero: 0 })
    })

    it('cerrado: el menú lateral está inerte y el resto de la pantalla no', () => {
      renderMenu(menuCompleto())

      expect(dialogo()).toHaveAttribute('inert')
      expect(screen.getByRole('banner')).not.toHaveAttribute('inert')
      expect(screen.getByRole('main')).not.toHaveAttribute('inert')
      expect(screen.getByRole('button', { name: 'Abrir el menú' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('abierto: el foco entra al menú, el encabezado y el contenido quedan inertes y el botón dice que está expandido', () => {
      renderMenu(menuCompleto())

      abrirElMenu()

      expect(dialogo()).not.toHaveAttribute('inert')
      expect(dialogo()).toHaveFocus()
      expect(screen.getByRole('banner')).toHaveAttribute('inert')
      expect(screen.getByRole('main')).toHaveAttribute('inert')
      expect(screen.getByRole('button', { name: 'Abrir el menú', hidden: true })).toHaveAttribute('aria-expanded', 'true')
    })

    it('Esc cierra el menú: vuelve la pantalla, se saca la inercia y el foco vuelve a "Abrir el menú"', async () => {
      const usuario = userEvent.setup()
      renderMenu(menuCompleto())
      await usuario.click(screen.getByRole('button', { name: 'Abrir el menú' }))

      await usuario.keyboard('{Escape}')

      expect(dialogo()).toHaveAttribute('inert')
      expect(screen.getByRole('banner')).not.toHaveAttribute('inert')
      expect(screen.getByRole('main')).not.toHaveAttribute('inert')
      expect(screen.getByRole('button', { name: 'Abrir el menú' })).toHaveFocus()
    })

    it('"Cerrar el menú" lo cierra y el foco vuelve a "Abrir el menú"', async () => {
      const usuario = userEvent.setup()
      renderMenu(menuCompleto())
      await usuario.click(screen.getByRole('button', { name: 'Abrir el menú' }))

      await usuario.click(screen.getByRole('button', { name: 'Cerrar el menú' }))

      expect(screen.getByRole('button', { name: 'Abrir el menú' })).toHaveFocus()
      expect(screen.getByRole('main')).not.toHaveAttribute('inert')
    })

    it('"Mis pedidos" se activa desde el menú lateral con el teclado y lleva a la pantalla', async () => {
      const usuario = userEvent.setup()
      renderMenu(menuCompleto())
      await usuario.click(screen.getByRole('button', { name: 'Abrir el menú' }))
      screen.getByRole('button', { name: 'Mis pedidos' }).focus()

      await usuario.keyboard('{Enter}')

      expect(screen.getByText('Pantalla de pedidos')).toBeInTheDocument()
    })

    describe('el filtro de dietas anuncia cuántos platos quedan', () => {
      const vegano = { id: 'veg', nombre: 'Vegano' }
      const menuConDietas = () => crearMenu({
        categorias: [{ id: 'cat-1', nombre: 'Principales', orden: 1, itemsDirectos: [
          crearPlato({ id: 'ens', nombre: 'Ensalada', clasificaciones: [vegano] }),
          crearPlato({ id: 'bife', nombre: 'Bife' }),
          crearPlato({ id: 'flan', nombre: 'Flan' }),
        ] }],
      })

      it('al aplicar una dieta dice cuántos platos quedan y el foco vuelve al botón "Dietas"', () => {
        renderMenu(menuConDietas())

        fireEvent.click(screen.getByRole('button', { name: 'Filtrar por dietas' }))
        fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 1 plato' }))
        fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' }))

        expect(useAnunciadorStore.getState().mensaje).toBe('1 plato')
        expect(screen.getByRole('button', { name: 'Filtrar por dietas, 1 filtro activo' })).toHaveFocus()
      })

      it('al limpiar dice cuántos platos hay en total', () => {
        renderMenu(menuConDietas())
        fireEvent.click(screen.getByRole('button', { name: 'Filtrar por dietas' }))
        fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 1 plato' }))
        fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' }))

        fireEvent.click(screen.getByRole('button', { name: 'Filtrar por dietas, 1 filtro activo' }))
        fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))

        expect(useAnunciadorStore.getState().mensaje).toBe('3 platos')
        expect(screen.getByRole('button', { name: 'Filtrar por dietas' })).toHaveFocus()
      })

      it('la cantidad tiene en cuenta lo que se escribió en el buscador', () => {
        renderMenu(menuConDietas())
        fireEvent.change(screen.getByPlaceholderText('Buscar platos...'), { target: { value: 'ens' } })

        fireEvent.click(screen.getByRole('button', { name: 'Filtrar por dietas' }))
        fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 1 plato' }))
        fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' }))

        expect(useAnunciadorStore.getState().mensaje).toBe('1 plato')
      })
    })

    it('no tiene violaciones de accesibilidad (axe), con el menú lateral abierto', async () => {
      const { container } = renderMenu(menuCompleto())
      abrirElMenu()

      expect(await axe(container)).toHaveNoViolations()
    })
  })

  describe('secciones, buscador y carrito (accesibilidad)', () => {
    const buscador = () => screen.getByRole('textbox', { name: 'Buscar platos' })
    const escribir = (texto: string) => fireEvent.change(buscador(), { target: { value: texto } })
    const esperar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

    beforeEach(() => {
      useAnunciadorStore.setState({ mensaje: '', numero: 0 })
      useCarritoStore.getState().vaciar()
      localStorage.clear()
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
      localStorage.clear()
      useCarritoStore.getState().vaciar()
    })

    describe('los chips de sección', () => {
      it('son una navegación con nombre ("Secciones del menú") con un botón por sección', () => {
        renderMenu(menuCompleto())

        const navegacion = screen.getByRole('navigation', { name: 'Secciones del menú' })
        expect(within(navegacion).getAllByRole('button').map((b) => b.textContent)).toEqual(['Descuentos', 'RECOMENDACIONES', 'Principales', 'Postres'])
      })

      it('tocar un chip desplaza a la sección y lleva el foco a su encabezado', () => {
        renderMenu(menuCompleto())

        fireEvent.click(within(screen.getByRole('navigation', { name: 'Secciones del menú' })).getByRole('button', { name: 'Postres' }))

        const encabezado = screen.getByRole('heading', { level: 2, name: 'Postres' })
        expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
        expect(encabezado).toHaveFocus()
        expect(encabezado).toHaveAttribute('tabindex', '-1')
      })

      it('el foco va a la sección que se tocó, también en "Descuentos"', () => {
        renderMenu(menuCompleto())

        fireEvent.click(within(screen.getByRole('navigation', { name: 'Secciones del menú' })).getByRole('button', { name: 'Descuentos' }))

        expect(screen.getByRole('heading', { level: 2, name: 'Descuentos' })).toHaveFocus()
      })

      it('no mueve la pantalla otra vez: el desplazamiento lo hace scrollIntoView, con animación', () => {
        const foco = vi.spyOn(HTMLElement.prototype, 'focus')
        renderMenu(menuCompleto())

        fireEvent.click(within(screen.getByRole('navigation', { name: 'Secciones del menú' })).getByRole('button', { name: 'Postres' }))

        expect(foco).toHaveBeenCalledWith({ preventScroll: true })
      })

      it('el chip de la sección que se está viendo dice "actual" (la primera, al abrir)', () => {
        renderMenu(menuCompleto())

        const navegacion = screen.getByRole('navigation', { name: 'Secciones del menú' })
        expect(within(navegacion).getByRole('button', { name: 'Descuentos' })).toHaveAttribute('aria-current', 'true')
        expect(within(navegacion).getByRole('button', { name: 'Postres' })).not.toHaveAttribute('aria-current')
      })
    })

    describe('el buscador', () => {
      it('se llama "Buscar platos" y al escribir anuncia cuántos platos quedan, cuando se deja de escribir', async () => {
        vi.useFakeTimers()
        renderMenu(menuCompleto())

        escribir('ens')
        await esperar(300)
        expect(useAnunciadorStore.getState().mensaje).toBe('')
        await esperar(300)

        expect(useAnunciadorStore.getState().mensaje).toBe('1 plato')
      })

      it('si no hay ninguno, anuncia "Ningún plato coincide"', async () => {
        vi.useFakeTimers()
        renderMenu(menuCompleto())

        escribir('zzz')
        await esperar(600)

        expect(useAnunciadorStore.getState().mensaje).toBe('Ningún plato coincide')
      })

      it('"Borrar búsqueda" borra el texto y devuelve el foco al campo', () => {
        renderMenu(menuCompleto())
        escribir('ens')

        fireEvent.click(screen.getByRole('button', { name: 'Borrar búsqueda' }))

        expect(buscador()).toHaveValue('')
        expect(buscador()).toHaveFocus()
        expect(screen.getByText('Flan')).toBeInTheDocument()
      })
    })

    describe('las tarjetas y el carrito', () => {
      it('cada plato tiene su botón "Ver {plato}" y su foto no repite el nombre', () => {
        renderMenu(menuCompleto())

        expect(screen.getAllByRole('button', { name: 'Ver Flan' })).toHaveLength(1)
        expect(screen.queryByRole('img', { name: 'Flan' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Agregar / })).not.toBeInTheDocument()
      })

      it('el botón del carrito cuenta unidades: 3 flanes y 2 ensaladas son "5 ítems"', () => {
        useCarritoStore.getState().agregar({ itemMenuId: 'flan', nombre: 'Flan', precioUnitario: 700, cantidad: 3, modificaciones: [] })
        useCarritoStore.getState().agregar({ itemMenuId: 'ens', nombre: 'Ensalada', precioUnitario: 900, cantidad: 2, modificaciones: [] })

        renderMenu(menuCompleto())

        expect(screen.getByRole('button', { name: 'Ver carrito, 5 ítems' })).toHaveTextContent('5')
      })
    })

    it('no tiene violaciones de accesibilidad (axe), con las secciones, los chips y un plato en el carrito', async () => {
      useCarritoStore.getState().agregar({ itemMenuId: 'flan', nombre: 'Flan', precioUnitario: 700, cantidad: 1, modificaciones: [] })
      const { container } = renderMenu(menuCompleto())

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
