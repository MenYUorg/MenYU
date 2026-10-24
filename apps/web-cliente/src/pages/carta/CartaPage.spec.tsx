import type { MenuPublico } from '@menyu/types'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../services/api'
import { useCarritoStore } from '../../store/carritoStore'
import { useComensalStore } from '../../store/comensalStore'
import { usePublicMenuStore } from '../../store/publicMenuStore'
import { useSessionStore } from '../../store/sessionStore'
import { crearMenu, crearPlato, crearPlatoEnDescuento, crearTokenJwt } from '../../test/fixtures'
import { compartirLaSesionDeWebAuth } from '../../test/authClient'
import { irA } from '../../utils/navegar'
import { CartaPage } from './CartaPage'

vi.mock('../../utils/navegar', () => ({ irA: vi.fn() }))

vi.mock('../../services/api', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../services/api')>()),
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

const pedirMenu = vi.mocked(api.menu.publico)

const hamburguesa = crearPlatoEnDescuento({ id: 'hamb', nombre: 'Hamburguesa', precioBase: 1500, precioDescuento: 1200 })
const ensalada = crearPlato({ id: 'ens', nombre: 'Ensalada', precioBase: 900, clasificaciones: [{ id: 'veg', nombre: 'Vegano' }] })
const flan = crearPlato({ id: 'flan', nombre: 'Flan', precioBase: 700 })

const MENU_PARRILLA: MenuPublico = crearMenu({
  restaurante: { id: 'rest-1', nombre: 'La Parrilla', nombreSeccionRecomendados: 'RECOMENDACIONES' },
  categorias: [
    { id: 'cat-1', nombre: 'Principales', orden: 1, itemsDirectos: [hamburguesa, ensalada] },
    { id: 'cat-2', nombre: 'Postres', orden: 2, itemsDirectos: [flan] },
  ],
  recomendados: [ensalada],
  descuentos: [hamburguesa],
})

const MENU_VITO: MenuPublico = crearMenu({
  restaurante: { id: 'rest-2', nombre: 'Pizzería Don Vito', nombreSeccionRecomendados: 'LO MEJOR' },
  categorias: [{ id: 'cat-v', nombre: 'Pizzas', orden: 1, itemsDirectos: [crearPlato({ id: 'muzza', nombre: 'Muzzarella', precioBase: 3000 })] }],
})

/** Muestra a dónde se navegó (la ruta y el `?…`), para probar los links del menú lateral. */
function Destino({ nombre }: { nombre: string }) {
  const { pathname, search } = useLocation()
  return <p>{nombre}: {pathname}{search}</p>
}

/** Botón para pasar de una carta a otra sin salir de la pantalla. */
function IrA({ id }: { id: string }) {
  const navigate = useNavigate()
  return <button onClick={() => navigate(`/restaurante/${id}/carta`)}>Ir a {id}</button>
}

function renderCarta(id = 'rest-1') {
  return render(
    <MemoryRouter initialEntries={[`/restaurante/${id}/carta`]}>
      <IrA id="rest-2" />
      <Routes>
        <Route path="/" element={<Destino nombre="inicio" />} />
        <Route path="/restaurante/:restauranteId" element={<Destino nombre="restaurante" />} />
        <Route path="/restaurante/:restauranteId/mesa" element={<Destino nombre="ingreso a mesa" />} />
        <Route path="/restaurante/:restauranteId/carta" element={<CartaPage />} />
        <Route path="/menu/:itemId" element={<Destino nombre="detalle" />} />
        <Route path="/carrito" element={<Destino nombre="carrito" />} />
        <Route path="/auth" element={<Destino nombre="auth" />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Espera a que llegue el menú: recién ahí aparece el header (con el botón del menú lateral). */
const cargada = () => screen.findByRole('banner')
/** Deja que lleguen las respuestas pendientes (dentro de act). */
const esperar = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })
const abrirMenuLateral = () => fireEvent.click(screen.getByRole('button', { name: 'Abrir el menú' }))
const idsDeSecciones = (contenedor: HTMLElement) =>
  Array.from(contenedor.querySelectorAll('[data-categoria-id]')).map((s) => s.getAttribute('data-categoria-id'))

describe('CartaPage (la carta en modo vista)', () => {
  beforeAll(() => {
    vi.stubGlobal('IntersectionObserver', IntersectionObserverFalso)
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    pedirMenu.mockReset().mockResolvedValue(MENU_PARRILLA)
    usePublicMenuStore.setState({ menu: null, loading: false, error: null, errorStatus: null, cargandoDe: null })
    // Sin sesión de mesa: la carta es pública.
    useSessionStore.getState().clear()
    useCarritoStore.getState().vaciar()
    localStorage.clear()
  })

  afterEach(() => {
    useCarritoStore.getState().vaciar()
    localStorage.clear()
  })

  describe('sin sesión', () => {
    it('pide el menú del restaurante de la dirección y lo muestra, sin pasar por ninguna pantalla de ingreso', async () => {
      renderCarta()

      expect(await screen.findByRole('banner')).toHaveTextContent('La Parrilla')
      expect(pedirMenu).toHaveBeenCalledTimes(1)
      expect(pedirMenu).toHaveBeenCalledWith('rest-1')
      expect(screen.getAllByText('Ensalada').length).toBeGreaterThan(0)
    })

    it('mientras llega muestra el indicador de carga y no una pantalla vacía', () => {
      pedirMenu.mockReturnValue(new Promise(() => {}))

      renderCarta()

      expect(screen.queryByText('La Parrilla')).not.toBeInTheDocument()
      expect(screen.queryByText('No se pudo cargar el menú')).not.toBeInTheDocument()
    })

    it('al abrirla nunca llega a pintar el aviso de error: del primer cuadro pasa a la carga y de ahí a la carta', async () => {
      // `render` junta todos los cuadros en uno solo: lo que se pintó en el camino se ve en lo que se fue agregando al DOM.
      // Se miran también los nodos que se sacaron: un aviso que se pintó y después se reemplazó queda ahí, ya suelto.
      const pintado: string[] = []
      const anotar = (registros: MutationRecord[]) => registros.forEach((r) => {
        r.addedNodes.forEach((n) => pintado.push(n.textContent ?? ''))
        r.removedNodes.forEach((n) => pintado.push(n.textContent ?? ''))
      })
      const observador = new MutationObserver(anotar)
      observador.observe(document.body, { childList: true, subtree: true })

      renderCarta()
      await cargada()
      anotar(observador.takeRecords())
      observador.disconnect()

      expect(pintado.join(' | ')).not.toContain('No se pudo cargar el menú')
      expect(pintado.join(' | ')).not.toContain('No encontramos este restaurante')
    })

    it('tiene las secciones de siempre: descuentos, recomendaciones y categorías', async () => {
      const { container } = renderCarta()
      await cargada()

      expect(idsDeSecciones(container)).toEqual(['descuentos', 'recomendados', 'cat-1', 'cat-2'])
    })
  })

  describe('solo se mira, no se pide', () => {
    beforeEach(() => {
      // Aunque el navegador tenga una mesa abierta y platos en el carrito, la carta no los usa.
      useSessionStore.setState({ restauranteId: 'rest-1', sesionId: 'ses-1', mesaId: 'mesa-1', jwt: 'jwt', numeroMesa: '5', modoSesion: 'seguro', codigoSesion: '731' })
      useCarritoStore.getState().agregar({ itemMenuId: 'flan', nombre: 'Flan', precioUnitario: 700, cantidad: 1, modificaciones: [] })
    })

    it('las tarjetas no tienen botón "+"', async () => {
      renderCarta()
      await cargada()

      expect(screen.queryByRole('button', { name: /^Agregar / })).not.toBeInTheDocument()
    })

    it('no hay botón del carrito', async () => {
      renderCarta()
      await cargada()

      expect(screen.queryByRole('button', { name: /🛒/ })).not.toBeInTheDocument()
    })

    it('no hay botón del mozo ni la mesa', async () => {
      renderCarta()
      await cargada()

      expect(screen.queryByRole('button', { name: /Mozo/ })).not.toBeInTheDocument()
      expect(screen.queryByText(/^Mesa /)).not.toBeInTheDocument()
      expect(screen.queryByText(/^PIN /)).not.toBeInTheDocument()
    })

    it('tocar una tarjeta no abre el detalle: no pasa nada', async () => {
      const { container } = renderCarta()
      await cargada()

      fireEvent.click(within(container.querySelector<HTMLElement>('[data-categoria-id="cat-2"]')!).getByText('Flan'))

      expect(screen.queryByText(/^detalle:/)).not.toBeInTheDocument()
      expect(screen.getByRole('banner')).toHaveTextContent('La Parrilla')
    })

    it('las tarjetas no tienen cursor de poder tocarse', async () => {
      const { container } = renderCarta()
      await cargada()

      const tarjeta = container.querySelector<HTMLElement>('[data-categoria-id="cat-2"] .group')!
      expect(tarjeta).toHaveStyle({ cursor: 'default' })
    })

    it('el descuento se ve: círculo con el porcentaje y los dos precios', async () => {
      const { container } = renderCarta()
      await cargada()
      const descuentos = within(container.querySelector<HTMLElement>('[data-categoria-id="descuentos"]')!)

      expect(descuentos.getByRole('img', { name: '20% de descuento' })).toBeInTheDocument()
      expect(descuentos.getByText('$1500.00')).toBeInTheDocument()
      expect(descuentos.getByText('$1200.00')).toBeInTheDocument()
    })
  })

  describe('el restaurante en el header y en el menú lateral', () => {
    const CON_DATOS = crearMenu({
      restaurante: { id: 'rest-1', nombre: 'La Parrilla', logoUrl: 'https://x/logo-parrilla.png', direccion: 'Av. Alicia Moreau de Justo 1150, Puerto Madero' },
      categorias: [{ id: 'c1', nombre: 'Principales', orden: 1, itemsDirectos: [flan] }],
    })
    const SIN_DATOS = crearMenu({
      restaurante: { id: 'rest-1', nombre: 'La Parrilla', logoUrl: null, direccion: null },
      categorias: [{ id: 'c1', nombre: 'Principales', orden: 1, itemsDirectos: [flan] }],
    })
    const logos = () => Array.from(document.querySelectorAll('img')).map((i) => i.getAttribute('src')).filter((s) => s !== null && !s.startsWith('data:'))

    it('el logo del restaurante (o el de su marca, ya resuelto) es el botón del header y está arriba del menú lateral', async () => {
      pedirMenu.mockResolvedValue(CON_DATOS)
      renderCarta()
      await cargada()

      expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Abrir el menú' }).querySelector('img')).toHaveAttribute('src', 'https://x/logo-parrilla.png')
      expect(logos().filter((s) => s === 'https://x/logo-parrilla.png')).toHaveLength(2)
    })

    it('el menú lateral muestra la dirección del restaurante', async () => {
      pedirMenu.mockResolvedValue(CON_DATOS)
      renderCarta()
      await cargada()

      expect(screen.getByText('Av. Alicia Moreau de Justo 1150, Puerto Madero')).toBeInTheDocument()
    })

    it('sin logo ni dirección: el de MenYU en los dos lugares y ninguna línea de dirección', async () => {
      pedirMenu.mockResolvedValue(SIN_DATOS)
      renderCarta()
      await cargada()

      expect(logos().filter((s) => s === '/logo-u.png')).toHaveLength(2)
      expect(document.querySelector('svg[width="14"]')).toBeNull()
    })
  })

  describe('buscador, dietas y secciones', () => {
    it('el buscador filtra los platos', async () => {
      const user = userEvent.setup()
      const { container } = renderCarta()
      await cargada()

      await user.type(screen.getByPlaceholderText('Buscar platos...'), 'hamb')

      expect(idsDeSecciones(container)).toEqual(['descuentos', 'cat-1'])
    })

    it('si nada coincide lo dice', async () => {
      const user = userEvent.setup()
      renderCarta()
      await cargada()

      await user.type(screen.getByPlaceholderText('Buscar platos...'), 'zzz')

      expect(screen.getByText('No hay platos que coincidan con "zzz"')).toBeInTheDocument()
    })

    it('un restaurante que no cargó ningún plato lo dice con un texto propio', async () => {
      pedirMenu.mockResolvedValue(crearMenu({ restaurante: { id: 'rest-1', nombre: 'La Parrilla' } }))
      renderCarta()
      await cargada()

      expect(screen.getByText('Este restaurante todavía no cargó su carta')).toBeInTheDocument()
      expect(screen.queryByText(/No hay ítems en esta categoría/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
    })

    it('el aviso de que no cargó su carta no aparece en un restaurante con platos', async () => {
      renderCarta()
      await cargada()

      expect(screen.queryByText(/todavía no cargó su carta/)).not.toBeInTheDocument()
    })

    it('el filtro de dietas deja solo los platos compatibles', async () => {
      renderCarta()
      await cargada()

      fireEvent.click(screen.getByRole('button', { name: /Dietas/ }))
      fireEvent.click(screen.getByText('Vegano'))
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' }))

      expect(screen.queryByText('Flan')).not.toBeInTheDocument()
      expect(screen.getAllByText('Ensalada').length).toBeGreaterThan(0)
    })

    it('tocar el chip de una sección lleva a ella', async () => {
      renderCarta()
      await cargada()

      fireEvent.click(screen.getByRole('button', { name: 'Postres' }))

      const llamadas = vi.mocked(Element.prototype.scrollIntoView).mock.contexts
      expect(llamadas).toHaveLength(1)
      expect(llamadas[0]).toHaveAttribute('data-categoria-id', 'cat-2')
    })
  })

  describe('menú lateral', () => {
    it('no repite las filas del pedido: ofrece entrar a una mesa y volver al inicio', async () => {
      renderCarta()
      await cargada()

      expect(screen.getByText('Ingresar a una mesa')).toBeInTheDocument()
      expect(screen.getByText('Volver al inicio')).toBeInTheDocument()
      expect(screen.queryByText('Volver al restaurante')).not.toBeInTheDocument()
      expect(screen.queryByText('Etiquetar pedidos')).not.toBeInTheDocument()
      expect(screen.queryByText('Mis pedidos')).not.toBeInTheDocument()
      expect(screen.queryByText('Pagar la cuenta')).not.toBeInTheDocument()
    })

    it('"Ingresar a una mesa" lleva al ingreso a mesa de este restaurante', async () => {
      renderCarta()
      await cargada()

      fireEvent.click(screen.getByText('Ingresar a una mesa'))

      expect(screen.getByText('ingreso a mesa: /restaurante/rest-1/mesa')).toBeInTheDocument()
    })

    it('"Volver al inicio" lleva al inicio de MenYU', async () => {
      renderCarta()
      await cargada()

      fireEvent.click(screen.getByText('Volver al inicio'))

      expect(screen.getByText('inicio: /')).toBeInTheDocument()
    })

    // En web-auth, que vuelve a esta pantalla (la carta). En jsdom, la URL de la página (window.location).
    it('"Iniciar sesión" lleva al ingreso de web-auth, con la vuelta a la carta', async () => {
      vi.mocked(irA).mockClear()
      compartirLaSesionDeWebAuth()
      renderCarta()
      await cargada()

      fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

      expect(irA).toHaveBeenCalledWith(expect.stringMatching(/\/\?redirect=/))
      expect(new URL(vi.mocked(irA).mock.calls[0][0]).searchParams.get('redirect')).toBe(window.location.href)
    })

    it('"Crear cuenta gratis" abre el registro de web-auth, también con la vuelta a la carta', async () => {
      vi.mocked(irA).mockClear()
      compartirLaSesionDeWebAuth()
      renderCarta()
      await cargada()

      fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta gratis' }))

      expect(irA).toHaveBeenCalledWith(expect.stringMatching(/\/crear-cuenta\?redirect=/))
    })

    it('un invitado no es saludado por el nombre de una mesa anterior', async () => {
      useComensalStore.setState({ nombre: 'Lucía' })
      const { unmount } = renderCarta()
      await cargada()

      expect(screen.getByText('¡Hola!')).toBeInTheDocument()
      expect(screen.queryByText(/Lucía/)).not.toBeInTheDocument()
      // Se desmonta antes de limpiar el nombre: así el cambio no llega a una pantalla que sigue abierta.
      unmount()
      useComensalStore.getState().reset()
    })

    describe('con cuenta', () => {
      beforeEach(() => {
        localStorage.setItem('menyu_access_token', crearTokenJwt({ tipo: 'cliente', nombre: 'Ana Gómez', email: 'ana@mail.com' }))
        vi.mocked(api.orders.list).mockReset().mockResolvedValue([])
      })

      it('saluda por el nombre completo y en lugar de iniciar sesión o crear una cuenta', async () => {
        renderCarta()
        await cargada()

        expect(screen.getByText('¡Hola, Ana Gómez!')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Crear cuenta gratis' })).not.toBeInTheDocument()
        expect(screen.queryByText('Mis puntos')).not.toBeInTheDocument()
      })

      it('sin una mesa abierta ofrece "Cerrar sesión" enseguida, sin consultar pedidos', async () => {
        renderCarta()
        await cargada()
        abrirMenuLateral()

        expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
        expect(api.orders.list).not.toHaveBeenCalled()
      })

      it('"Cerrar sesión" borra la sesión de cliente y vuelve a ofrecer iniciar sesión', async () => {
        localStorage.setItem('menyu_refresh_token', 'refresh')
        renderCarta()
        await cargada()
        abrirMenuLateral()

        // Cerrar la cuenta es asíncrono (también cierra la de Supabase): act espera a que termine.
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
        })

        expect(localStorage.getItem('menyu_access_token')).toBeNull()
        expect(localStorage.getItem('menyu_refresh_token')).toBeNull()
        expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
      })

      it('con una mesa abierta que ya pidió algo no se ofrece (aunque se esté mirando la carta)', async () => {
        useSessionStore.setState({ restauranteId: 'rest-9', sesionId: 'ses-1', mesaId: 'mesa-1', jwt: 'jwt', numeroMesa: '5' })
        vi.mocked(api.orders.list).mockResolvedValue([{ id: 'p1', estado: 'pendiente' }])
        renderCarta()
        await cargada()
        abrirMenuLateral()

        await waitFor(() => expect(api.orders.list).toHaveBeenCalledWith('jwt'))
        await esperar()

        expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
        expect(screen.getByText('¡Hola, Ana Gómez!')).toBeInTheDocument()
      })
    })

    it('se abre con el botón del header', async () => {
      renderCarta()
      await cargada()

      abrirMenuLateral()

      expect(screen.getByText('Ingresar a una mesa')).toBeInTheDocument()
    })
  })

  describe('cuando no se puede mostrar', () => {
    it('un restaurante que no existe (404) lo dice y vuelve al inicio', async () => {
      pedirMenu.mockRejectedValue(new ApiError('Restaurante no encontrado', 404))

      renderCarta('no-existe')

      expect(await screen.findByText('No encontramos este restaurante')).toBeInTheDocument()
      expect(screen.queryByText('No se pudo cargar el menú')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }))

      expect(screen.getByText('inicio: /')).toBeInTheDocument()
    })

    it('sin conexión avisa, deja reintentar y ofrece volver al restaurante', async () => {
      pedirMenu.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      renderCarta()

      expect(await screen.findByText('No se pudo cargar el menú')).toBeInTheDocument()
      expect(screen.queryByText('No encontramos este restaurante')).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Volver al restaurante' })).toHaveAttribute('href', '/restaurante/rest-1')

      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

      expect(await screen.findByRole('banner')).toHaveTextContent('La Parrilla')
      expect(pedirMenu).toHaveBeenCalledTimes(2)
      expect(pedirMenu).toHaveBeenLastCalledWith('rest-1')
    })

    it('un error del servidor (500) no se confunde con un restaurante que no existe', async () => {
      pedirMenu.mockRejectedValue(new ApiError('Error 500', 500))
      renderCarta()

      expect(await screen.findByText('No se pudo cargar el menú')).toBeInTheDocument()
      expect(screen.queryByText('No encontramos este restaurante')).not.toBeInTheDocument()
    })
  })

  describe('de una carta a otra', () => {
    it('no mezcla los menús: al pasar al otro restaurante no se ve el anterior y se pide el nuevo', async () => {
      pedirMenu.mockImplementation((id: string) => Promise.resolve(id === 'rest-2' ? MENU_VITO : MENU_PARRILLA))
      renderCarta()
      await cargada()

      fireEvent.click(screen.getByRole('button', { name: 'Ir a rest-2' }))

      expect(await screen.findByRole('banner')).toHaveTextContent('Pizzería Don Vito')
      expect(screen.queryByText('La Parrilla')).not.toBeInTheDocument()
      expect(screen.queryByText('Hamburguesa')).not.toBeInTheDocument()
      expect(screen.getByText('Muzzarella')).toBeInTheDocument()
      expect(pedirMenu).toHaveBeenLastCalledWith('rest-2')
    })

    it('mientras llega el nuevo menú no se muestra el del restaurante anterior', async () => {
      renderCarta()
      await cargada()
      pedirMenu.mockReturnValue(new Promise(() => {}))

      fireEvent.click(screen.getByRole('button', { name: 'Ir a rest-2' }))

      expect(screen.queryByText('La Parrilla')).not.toBeInTheDocument()
      expect(screen.queryByText('Hamburguesa')).not.toBeInTheDocument()
    })

    it('si el store todavía guarda el menú de otro restaurante, la carta no lo muestra como suyo', () => {
      const pedidoOriginal = usePublicMenuStore.getState().fetchMenu
      // El pedido no hace nada: así el store sigue con el menú de antes, que es lo que se ve en el primer cuadro.
      usePublicMenuStore.setState({ menu: MENU_VITO, fetchMenu: vi.fn().mockResolvedValue(undefined) })
      const { unmount } = renderCarta('rest-1')

      try {
        expect(screen.queryByText('Pizzería Don Vito')).not.toBeInTheDocument()
        expect(screen.queryByText('Muzzarella')).not.toBeInTheDocument()
      } finally {
        unmount()
        usePublicMenuStore.setState({ fetchMenu: pedidoOriginal })
      }
    })

    it('el id de la dirección se compara sin importar mayúsculas (los ids son UUID)', async () => {
      pedirMenu.mockResolvedValue(crearMenu({ restaurante: { id: 'abcd-1234', nombre: 'La Parrilla', nombreSeccionRecomendados: 'RECOMENDACIONES' }, categorias: [{ id: 'c', nombre: 'Platos', orden: 1, itemsDirectos: [flan] }] }))

      renderCarta('ABCD-1234')

      expect(await screen.findByRole('banner')).toHaveTextContent('La Parrilla')
      // Y no queda pidiéndolo una y otra vez.
      expect(pedirMenu).toHaveBeenCalledTimes(1)
    })
  })
})
