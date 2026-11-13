import type { DiscoveryRestauranteDetalle } from '@menyu/types'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from './App'
import { api } from './services/api'
import { reiniciarDiscoveryStore } from './store/discoveryStore'
import { useSessionStore } from './store/sessionStore'
import { crearMenu, crearPlato, crearRestaurante } from './test/fixtures'
import { usePublicMenuStore } from './store/publicMenuStore'
import { axe } from './test/axe'
import { anunciar } from './utils/anunciador'

vi.mock('./services/api', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('./services/api')>()),
  api: {
    discovery: { listar: vi.fn(), buscar: vi.fn(), restaurante: vi.fn() },
    menu: { publico: vi.fn() },
    sessions: { open: vi.fn() },
  },
}))

// `vi.mock` se eleva arriba de todo, así que el socket falso se define con `vi.hoisted` para existir antes.
const { ioFalso, socketFalso } = vi.hoisted(() => {
  const socketFalso = { on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }
  return { socketFalso, ioFalso: vi.fn(() => socketFalso) }
})

vi.mock('socket.io-client', () => ({ io: ioFalso }))

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

describe('SessionGuard: el socket de la mesa', () => {
  beforeEach(() => {
    reiniciarDiscoveryStore()
    sessionStorage.clear()
    useSessionStore.getState().clear()
    ioFalso.mockClear()
    socketFalso.on.mockClear()
    socketFalso.off.mockClear()
    socketFalso.emit.mockClear()
    socketFalso.disconnect.mockClear()
    vi.mocked(api.discovery.listar).mockReset().mockResolvedValue({ restaurantes: [], ofertas: [] })
  })

  /** Las opciones con las que se abrió la conexión número `n` (desde 0). */
  function opcionesDeLaConexion(n: number) {
    return (ioFalso.mock.calls[n] as unknown as [string, { auth: unknown }])[1]
  }

  it('con JWT de mesa lo manda en el handshake', async () => {
    useSessionStore.setState({ restauranteId: 'rest-1', jwt: 'jwt-de-mesa' })

    abrirEn('/')
    await screen.findByRole('heading', { level: 1, name: 'Descubrí dónde comer' })

    expect(ioFalso).toHaveBeenCalledTimes(1)
    expect(opcionesDeLaConexion(0)).toEqual({ transports: ['websocket'], auth: { token: 'jwt-de-mesa' } })
  })

  it('sin JWT conecta igual, sin token', async () => {
    useSessionStore.setState({ restauranteId: 'rest-1', jwt: null })

    abrirEn('/')
    await screen.findByRole('heading', { level: 1, name: 'Descubrí dónde comer' })

    expect(ioFalso).toHaveBeenCalledTimes(1)
    expect(opcionesDeLaConexion(0)).toEqual({ transports: ['websocket'], auth: {} })
  })

  it('con un JWT nuevo en el mismo restaurante reconecta con ese JWT', async () => {
    useSessionStore.setState({ restauranteId: 'rest-1', jwt: 'jwt-viejo' })
    abrirEn('/')
    await screen.findByRole('heading', { level: 1, name: 'Descubrí dónde comer' })

    // Otra mesa del mismo restaurante: `openSession` deja otro JWT sin que cambie `restauranteId`.
    act(() => { useSessionStore.setState({ jwt: 'jwt-nuevo' }) })

    expect(socketFalso.disconnect).toHaveBeenCalledTimes(1)
    expect(ioFalso).toHaveBeenCalledTimes(2)
    expect(opcionesDeLaConexion(1)).toEqual({ transports: ['websocket'], auth: { token: 'jwt-nuevo' } })
  })
})

describe('título, foco y anuncios al navegar (accesibilidad)', () => {
  beforeEach(() => {
    reiniciarDiscoveryStore()
    usePublicMenuStore.setState({ menu: null, loading: false, error: null, errorStatus: null, cargandoDe: null })
    sessionStorage.clear()
    useSessionStore.getState().clear()
    vi.mocked(api.discovery.listar).mockReset().mockResolvedValue({ restaurantes: [], ofertas: [] })
    vi.mocked(api.discovery.restaurante).mockReset().mockResolvedValue(PARRILLA)
    document.title = ''
  })

  afterEach(() => window.history.pushState({}, '', '/'))

  it('el título de la pestaña dice la pantalla y, cuando se sabe, el restaurante', async () => {
    abrirEn('/restaurante/parrilla')
    await screen.findByRole('heading', { level: 1, name: 'La Parrilla del Puerto' })

    expect(document.title).toBe('Restaurante · La Parrilla del Puerto')
  })

  it('en el inicio, sin restaurante, termina en "MenYU"', async () => {
    abrirEn('/')
    await screen.findByRole('heading', { level: 1, name: 'Descubrí dónde comer' })

    expect(document.title).toBe('Descubrir restaurantes · MenYU')
  })

  it('en la primera carga el foco no se mueve', async () => {
    abrirEn('/restaurante/parrilla')
    await screen.findByRole('heading', { level: 1, name: 'La Parrilla del Puerto' })

    expect(document.activeElement).toBe(document.body)
  })

  it('al pasar a otra pantalla el foco va a su <h1>, que se anuncia', async () => {
    abrirEn('/restaurante/parrilla')
    fireEvent.click(await screen.findByRole('link', { name: 'Ingresar a una mesa' }))

    const titulo = await screen.findByRole('heading', { level: 1, name: 'Ingresar a una mesa' })
    await waitFor(() => expect(document.activeElement).toBe(titulo))
    expect(document.title).toBe('Ingresar a una mesa · La Parrilla del Puerto')
  })

  it('cualquier pantalla puede anunciar algo: la región viva ya está montada', async () => {
    abrirEn('/')
    await screen.findByRole('heading', { level: 1, name: 'Descubrí dónde comer' })

    act(() => anunciar('Hamburguesa doble agregada al carrito'))

    expect(screen.getByText('Hamburguesa doble agregada al carrito')).toBeInTheDocument()
  })

  it('el inicio, con todo lo que hay en el <body> (también el anunciador), no tiene violaciones de accesibilidad (axe)', async () => {
    abrirEn('/')
    await screen.findByRole('heading', { level: 1, name: 'Descubrí dónde comer' })

    expect(await axe(document.body)).toHaveNoViolations()
  })
})
