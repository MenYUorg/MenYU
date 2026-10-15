import type { DiscoveryRestauranteDetalle } from '@menyu/types'
import { render, screen } from '@testing-library/react'
import { App } from './App'
import { api } from './services/api'
import { reiniciarDiscoveryStore } from './store/discoveryStore'
import { useSessionStore } from './store/sessionStore'
import { crearMenu, crearPlato, crearRestaurante } from './test/fixtures'
import { usePublicMenuStore } from './store/publicMenuStore'

vi.mock('./services/api', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('./services/api')>()),
  api: {
    discovery: { listar: vi.fn(), buscar: vi.fn(), restaurante: vi.fn() },
    menu: { publico: vi.fn() },
    sessions: { open: vi.fn() },
  },
}))

// La carta usa el IntersectionObserver para saber qué sección se ve; jsdom no lo trae.
class IntersectionObserverFalso {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  takeRecords = vi.fn(() => [])
}
beforeAll(() => { vi.stubGlobal('IntersectionObserver', IntersectionObserverFalso) })
afterAll(() => { vi.unstubAllGlobals() })

const PARRILLA: DiscoveryRestauranteDetalle = {
  restaurante: crearRestaurante({ id: 'parrilla', nombre: 'La Parrilla del Puerto' }),
  ofertas: [],
}

/** Abre la app como si se hubiera escrito esa dirección en el navegador. */
function abrirEn(ruta: string) {
  window.history.pushState({}, '', ruta)
  return render(<App />)
}

describe('rutas de la app', () => {
  beforeEach(() => {
    reiniciarDiscoveryStore()
    usePublicMenuStore.setState({ menu: null, loading: false, error: null, errorStatus: null, cargandoDe: null })
    sessionStorage.clear()
    useSessionStore.getState().clear()
    vi.mocked(api.discovery.listar).mockReset().mockResolvedValue({ restaurantes: [], ofertas: [] })
    vi.mocked(api.discovery.restaurante).mockReset().mockResolvedValue(PARRILLA)
  })

  afterEach(() => window.history.pushState({}, '', '/'))

  it('el inicio es el home de Discovery', async () => {
    abrirEn('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Descubrí dónde comer' })).toBeInTheDocument()
  })

  it('/restaurante/:id abre la pantalla de ese restaurante', async () => {
    abrirEn('/restaurante/parrilla')

    expect(await screen.findByRole('heading', { level: 1, name: 'La Parrilla del Puerto' })).toBeInTheDocument()
    expect(api.discovery.restaurante).toHaveBeenCalledWith('parrilla')
  })

  it('/restaurante/:id/mesa abre el ingreso a una mesa de ese restaurante', async () => {
    abrirEn('/restaurante/parrilla/mesa')

    expect(await screen.findByRole('heading', { level: 1, name: 'Ingresar a una mesa' })).toBeInTheDocument()
    expect(await screen.findByText('La Parrilla del Puerto')).toBeInTheDocument()
  })

  describe('/restaurante/:id/carta (la carta en modo vista)', () => {
    it('es pública: sin sesión de mesa se ve la carta y no redirige al inicio', async () => {
      vi.mocked(api.menu.publico).mockResolvedValue(crearMenu({
        restaurante: { id: 'parrilla', nombre: 'La Parrilla del Puerto', nombreSeccionRecomendados: 'RECOMENDACIONES' },
        categorias: [{ id: 'c1', nombre: 'Principales', orden: 1, itemsDirectos: [crearPlato({ nombre: 'Milanesa napolitana' })] }],
      }))

      abrirEn('/restaurante/parrilla/carta')

      expect(await screen.findByText('Milanesa napolitana')).toBeInTheDocument()
      expect(window.location.pathname).toBe('/restaurante/parrilla/carta')
      expect(api.menu.publico).toHaveBeenCalledWith('parrilla')
      expect(screen.queryByRole('heading', { level: 1, name: 'Descubrí dónde comer' })).not.toBeInTheDocument()
    })

    it('el menú de la mesa (/menu) sí pide sesión: sin ella vuelve al inicio', async () => {
      abrirEn('/menu')

      expect(await screen.findByRole('heading', { level: 1, name: 'Descubrí dónde comer' })).toBeInTheDocument()
      expect(window.location.pathname).toBe('/')
    })
  })

  describe('/ingresar-pin (el PIN ahora se pide dentro de un restaurante)', () => {
    it('lleva al inicio, donde se elige el restaurante', async () => {
      abrirEn('/ingresar-pin')

      expect(await screen.findByRole('heading', { level: 1, name: 'Descubrí dónde comer' })).toBeInTheDocument()
      expect(window.location.pathname).toBe('/')
      expect(screen.queryByLabelText('PIN de mesa')).not.toBeInTheDocument()
    })

    it('reemplaza la entrada del historial: "atrás" no vuelve a una dirección que redirige', async () => {
      const entradasAntes = window.history.length
      window.history.pushState({}, '', '/ingresar-pin')
      const conLaDireccion = window.history.length
      render(<App />)

      await screen.findByRole('heading', { level: 1, name: 'Descubrí dónde comer' })

      expect(window.history.length).toBe(conLaDireccion)
      expect(conLaDireccion).toBe(entradasAntes + 1)
    })
  })
})
