import { useContextStore } from './contextStore'

vi.mock('@menyu/auth', () => ({
  TOKEN_KEY: 'menyu_access_token',
  REFRESH_KEY: 'menyu_refresh_token',
}))

vi.mock('../services/api', () => ({
  api: {
    marcas: { list: vi.fn() },
    restaurantes: { list: vi.fn() },
  },
}))

const TOKEN_KEY = 'menyu_access_token'
const RESTAURANTE_KEY = 'menyu-admin-restaurante-id'

function makeJwt(payload: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(payload))}.signature`
}

const MARCA_X = { id: 'marca-1', nombre: 'Marca X', slug: 'marca-x', activo: true, createdAt: '2024-01-01' }

const RESTAURANTE_BASE = {
  marcaId: 'marca-1',
  direccion: null,
  qrBaseUrl: null,
  modoSesion: 'abierto',
  activo: true,
  createdAt: '2024-01-01',
  marca: MARCA_X,
}

const RESTAURANTE_A = { ...RESTAURANTE_BASE, id: 'rest-1', nombre: 'Resto A' }
const RESTAURANTE_B = { ...RESTAURANTE_BASE, id: 'rest-2', nombre: 'Resto B' }

describe('contextStore', () => {
  beforeEach(async () => {
    localStorage.clear()
    useContextStore.setState({
      marcas: [],
      restaurantes: [],
      selectedMarcaId: null,
      selectedRestauranteId: null,
    })
    vi.clearAllMocks()
  })

  // ── loadContext — GERENTE ─────────────────────────────────────────────────

  describe('loadContext — rol GERENTE', () => {
    it('solo llama api.restaurantes.list (no api.marcas.list)', async () => {
      localStorage.setItem(TOKEN_KEY, makeJwt({ rol: 'GERENTE' }))
      const { api } = await import('../services/api')
      vi.mocked(api.restaurantes.list).mockResolvedValue([RESTAURANTE_A])
      vi.mocked(api.marcas.list).mockResolvedValue([MARCA_X])

      await useContextStore.getState().loadContext()

      expect(api.restaurantes.list).toHaveBeenCalled()
      expect(api.marcas.list).not.toHaveBeenCalled()
    })

    it('selecciona el primer restaurante si no hay guardado', async () => {
      localStorage.setItem(TOKEN_KEY, makeJwt({ rol: 'GERENTE' }))
      const { api } = await import('../services/api')
      vi.mocked(api.restaurantes.list).mockResolvedValue([RESTAURANTE_A, RESTAURANTE_B])

      await useContextStore.getState().loadContext()

      expect(useContextStore.getState().selectedRestauranteId).toBe('rest-1')
    })

    it('respeta el restauranteId guardado si sigue existiendo en la lista', async () => {
      localStorage.setItem(TOKEN_KEY, makeJwt({ rol: 'GERENTE' }))
      localStorage.setItem(RESTAURANTE_KEY, 'rest-2')
      const { api } = await import('../services/api')
      vi.mocked(api.restaurantes.list).mockResolvedValue([RESTAURANTE_A, RESTAURANTE_B])

      await useContextStore.getState().loadContext()

      expect(useContextStore.getState().selectedRestauranteId).toBe('rest-2')
    })
  })

  // ── loadContext — OWNER / ROOT ────────────────────────────────────────────

  describe('loadContext — rol OWNER', () => {
    it('llama api.marcas.list y api.restaurantes.list en paralelo', async () => {
      localStorage.setItem(TOKEN_KEY, makeJwt({ rol: 'OWNER' }))
      const { api } = await import('../services/api')
      vi.mocked(api.marcas.list).mockResolvedValue([MARCA_X])
      vi.mocked(api.restaurantes.list).mockResolvedValue([RESTAURANTE_A])

      await useContextStore.getState().loadContext()

      expect(api.marcas.list).toHaveBeenCalled()
      expect(api.restaurantes.list).toHaveBeenCalled()
    })

    it('carga marcas y restaurantes en el estado', async () => {
      localStorage.setItem(TOKEN_KEY, makeJwt({ rol: 'OWNER' }))
      const { api } = await import('../services/api')
      vi.mocked(api.marcas.list).mockResolvedValue([MARCA_X])
      vi.mocked(api.restaurantes.list).mockResolvedValue([RESTAURANTE_A, RESTAURANTE_B])

      await useContextStore.getState().loadContext()

      expect(useContextStore.getState().marcas).toHaveLength(1)
      expect(useContextStore.getState().restaurantes).toHaveLength(2)
    })

    it('sin token → igual intenta cargar como OWNER (rol null)', async () => {
      const { api } = await import('../services/api')
      vi.mocked(api.marcas.list).mockResolvedValue([])
      vi.mocked(api.restaurantes.list).mockResolvedValue([])

      await useContextStore.getState().loadContext()

      expect(api.marcas.list).toHaveBeenCalled()
    })
  })

  // ── setRestaurante ────────────────────────────────────────────────────────

  describe('setRestaurante', () => {
    it('actualiza selectedRestauranteId en el store', () => {
      useContextStore.getState().setRestaurante('rest-99')
      expect(useContextStore.getState().selectedRestauranteId).toBe('rest-99')
    })

    it('persiste la selección en localStorage', () => {
      useContextStore.getState().setRestaurante('rest-99')
      expect(localStorage.getItem(RESTAURANTE_KEY)).toBe('rest-99')
    })
  })

  // ── setMarca ──────────────────────────────────────────────────────────────

  describe('setMarca', () => {
    it('actualiza selectedMarcaId en el store', () => {
      useContextStore.getState().setMarca('marca-42')
      expect(useContextStore.getState().selectedMarcaId).toBe('marca-42')
    })
  })
})
