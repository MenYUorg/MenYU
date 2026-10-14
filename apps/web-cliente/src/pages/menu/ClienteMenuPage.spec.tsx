import type { MenuPublico } from '@menyu/types'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { usePublicMenuStore } from '../../store/publicMenuStore'
import { useSessionStore } from '../../store/sessionStore'
import { crearMenu, crearPlato, crearPlatoEnDescuento, crearTokenJwt } from '../../test/fixtures'
import { ClienteMenuPage } from './ClienteMenuPage'

vi.mock('../../services/api', () => ({
  api: {
    menu: { publico: vi.fn() },
    waiterCalls: { llamar: vi.fn() },
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

  describe('saludo del menú lateral', () => {
    afterEach(() => localStorage.clear())

    it('saluda por el primer nombre del cliente con sesión, con los acentos y la Ñ bien', () => {
      localStorage.setItem('menyu_access_token', crearTokenJwt({ tipo: 'cliente', nombre: 'Ñandú Gómez' }))

      renderMenu(menuCompleto())

      expect(screen.getByText('¡Hola, Ñandú!')).toBeInTheDocument()
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
