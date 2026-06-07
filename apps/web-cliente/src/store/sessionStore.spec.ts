import { useSessionStore } from './sessionStore'
import { useCarritoStore } from './carritoStore'

vi.mock('../services/api', () => ({
  api: {
    sessions: {
      open: vi.fn(),
    },
  },
}))

const SESION_KEY       = 'menyu_sesion_id'
const MESA_KEY         = 'menyu_mesa_id'
const RESTAURANTE_KEY  = 'menyu_restaurante_id'
const JWT_KEY          = 'menyu_sesion_jwt'
const NUMERO_MESA_KEY  = 'menyu_numero_mesa'
const CODIGO_KEY       = 'menyu_codigo_sesion'
const MODO_KEY         = 'menyu_modo_sesion'

const SESION_RESPONSE = {
  sesionId:     'sesion-abc',
  mesaId:       'mesa-1',
  restauranteId:'rest-1',
  jwt:          'jwt.token.here',
  numeroMesa:   '5',
  codigoSesion: '042',
  modoSesion:   'abierto',
  esAnfitrion:  true,
  clienteId:    'cli-1',
}

describe('sessionStore', () => {
  beforeEach(() => {
    sessionStorage.clear()
    useCarritoStore.getState().vaciar()
    useSessionStore.setState({
      sesionId: null,
      mesaId: null,
      restauranteId: null,
      jwt: null,
      numeroMesa: null,
      codigoSesion: null,
      modoSesion: null,
      loading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  // ── clear ─────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('limpia todos los campos del store', () => {
      useSessionStore.setState({ sesionId: 'x', mesaId: 'y', jwt: 'z' })
      useSessionStore.getState().clear()
      const s = useSessionStore.getState()
      expect(s.sesionId).toBeNull()
      expect(s.mesaId).toBeNull()
      expect(s.jwt).toBeNull()
    })

    it('elimina todas las claves de sessionStorage', () => {
      sessionStorage.setItem(SESION_KEY, 'sesion-1')
      sessionStorage.setItem(MESA_KEY, 'mesa-1')
      sessionStorage.setItem(JWT_KEY, 'jwt')
      sessionStorage.setItem(NUMERO_MESA_KEY, '5')
      sessionStorage.setItem(CODIGO_KEY, '042')
      sessionStorage.setItem(MODO_KEY, 'abierto')
      sessionStorage.setItem(RESTAURANTE_KEY, 'rest-1')

      useSessionStore.getState().clear()

      expect(sessionStorage.getItem(SESION_KEY)).toBeNull()
      expect(sessionStorage.getItem(MESA_KEY)).toBeNull()
      expect(sessionStorage.getItem(JWT_KEY)).toBeNull()
      expect(sessionStorage.getItem(NUMERO_MESA_KEY)).toBeNull()
      expect(sessionStorage.getItem(CODIGO_KEY)).toBeNull()
      expect(sessionStorage.getItem(MODO_KEY)).toBeNull()
      expect(sessionStorage.getItem(RESTAURANTE_KEY)).toBeNull()
    })

    it('vacía el carrito al limpiar la sesión', () => {
      useCarritoStore.getState().agregar({
        itemMenuId: 'item-1', nombre: 'Pizza', precioUnitario: 1000,
        cantidad: 2, modificaciones: [],
      })
      expect(useCarritoStore.getState().items).toHaveLength(1)

      useSessionStore.getState().clear()

      expect(useCarritoStore.getState().items).toHaveLength(0)
    })
  })

  // ── setRestauranteId ──────────────────────────────────────────────────────

  describe('setRestauranteId', () => {
    it('actualiza el estado del store', () => {
      useSessionStore.getState().setRestauranteId('rest-99')
      expect(useSessionStore.getState().restauranteId).toBe('rest-99')
    })

    it('persiste en sessionStorage', () => {
      useSessionStore.getState().setRestauranteId('rest-99')
      expect(sessionStorage.getItem(RESTAURANTE_KEY)).toBe('rest-99')
    })
  })

  // ── openSession ───────────────────────────────────────────────────────────

  describe('openSession', () => {
    it('respuesta exitosa → actualiza el estado con los datos de sesión', async () => {
      const { api } = await import('../services/api')
      vi.mocked(api.sessions.open).mockResolvedValue(SESION_RESPONSE)

      await useSessionStore.getState().openSession({ qrToken: 'qr-abc' })

      const s = useSessionStore.getState()
      expect(s.sesionId).toBe('sesion-abc')
      expect(s.jwt).toBe('jwt.token.here')
      expect(s.numeroMesa).toBe('5')
      expect(s.loading).toBe(false)
    })

    it('respuesta exitosa → persiste jwt en sessionStorage', async () => {
      const { api } = await import('../services/api')
      vi.mocked(api.sessions.open).mockResolvedValue(SESION_RESPONSE)

      await useSessionStore.getState().openSession({ qrToken: 'qr-abc' })

      expect(sessionStorage.getItem(JWT_KEY)).toBe('jwt.token.here')
      expect(sessionStorage.getItem(SESION_KEY)).toBe('sesion-abc')
    })

    it('error "requiere código de sesión" → devuelve REQUIERE_CODIGO_SESION', async () => {
      const { api } = await import('../services/api')
      vi.mocked(api.sessions.open).mockRejectedValue(
        new Error('Esta mesa requiere código de sesión para unirse'),
      )

      const result = await useSessionStore.getState().openSession({ qrToken: 'qr-abc' })

      expect(result).toEqual({ error: 'REQUIERE_CODIGO_SESION' })
      expect(useSessionStore.getState().loading).toBe(false)
    })

    it('error genérico → setea error en el store y devuelve undefined', async () => {
      const { api } = await import('../services/api')
      vi.mocked(api.sessions.open).mockRejectedValue(new Error('Error de red'))

      const result = await useSessionStore.getState().openSession({ qrToken: 'qr-abc' })

      expect(result).toBeUndefined()
      expect(useSessionStore.getState().error).toBe('Error de red')
      expect(useSessionStore.getState().loading).toBe(false)
    })
  })
})
