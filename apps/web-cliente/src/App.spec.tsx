import type { DiscoveryRestauranteDetalle } from '@menyu/types'
import { render, screen } from '@testing-library/react'
import { App } from './App'
import { api } from './services/api'
import { reiniciarDiscoveryStore } from './store/discoveryStore'
import { useSessionStore } from './store/sessionStore'
import { crearRestaurante } from './test/fixtures'

vi.mock('./services/api', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('./services/api')>()),
  api: {
    discovery: { listar: vi.fn(), buscar: vi.fn(), restaurante: vi.fn() },
    sessions: { open: vi.fn() },
  },
}))

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
