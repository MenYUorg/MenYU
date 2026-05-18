import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '../services/api'
import { storage } from '../services/storage'
import { useUserStore } from './userStore'

vi.mock('../services/api', () => ({
  api: { post: vi.fn() },
  configureApiAuth: vi.fn(),
}))

vi.mock('../services/storage', () => ({
  storage: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    deleteItem: vi.fn().mockResolvedValue(undefined),
  },
}))

function makeJwt(payload: object): string {
  return `header.${btoa(JSON.stringify(payload))}.signature`
}

const MOCK_PAYLOAD = { sub: 'user-1', tipo: 'cliente' as const, nombre: 'Coty', iat: 0, exp: 9999999999 }
const GUEST_PAYLOAD = { sub: 'guest-1', tipo: 'cliente' as const, nombre: 'Invitado', iat: 0, exp: 9999999999 }
const MOCK_TOKENS = { accessToken: makeJwt(MOCK_PAYLOAD), refreshToken: 'refresh-token-raw' }
const GUEST_TOKENS = { accessToken: makeJwt(GUEST_PAYLOAD), refreshToken: 'guest-refresh-raw' }

describe('userStore — register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUserStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      isLoading: false,
      isHydrated: false,
    })
  })

  it('llama a POST /auth/register con los datos correctos', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: MOCK_TOKENS })

    await useUserStore.getState().register('Coty', 'coty@test.com', 'pass123')

    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      nombre: 'Coty',
      email: 'coty@test.com',
      password: 'pass123',
      telefono: undefined,
    })
  })

  it('persiste los tokens en storage tras el registro exitoso', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: MOCK_TOKENS })

    await useUserStore.getState().register('Coty', 'coty@test.com', 'pass123')

    expect(storage.setItem).toHaveBeenCalledWith('menyu_access_token', MOCK_TOKENS.accessToken)
    expect(storage.setItem).toHaveBeenCalledWith('menyu_refresh_token', MOCK_TOKENS.refreshToken)
  })

  it('guarda el usuario decodificado del JWT en el store', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: MOCK_TOKENS })

    await useUserStore.getState().register('Coty', 'coty@test.com', 'pass123')

    const { user, accessToken, isLoading } = useUserStore.getState()
    expect(user?.sub).toBe(MOCK_PAYLOAD.sub)
    expect(user?.tipo).toBe('cliente')
    expect(accessToken).toBe(MOCK_TOKENS.accessToken)
    expect(isLoading).toBe(false)
  })

  it('relanza el error si la API falla (para que el componente lo maneje)', async () => {
    const error = new Error('Network error')
    vi.mocked(api.post).mockRejectedValueOnce(error)

    await expect(
      useUserStore.getState().register('Coty', 'coty@test.com', 'pass123'),
    ).rejects.toThrow('Network error')
  })

  it('resetea isLoading a false aunque la API falle', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Network error'))

    await useUserStore.getState().register('Coty', 'coty@test.com', 'pass123').catch(() => undefined)

    expect(useUserStore.getState().isLoading).toBe(false)
  })
})

describe('userStore — loginAsGuest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUserStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      isLoading: false,
      isHydrated: false,
    })
  })

  it('llama a POST /auth/guest con el nombre proporcionado', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: GUEST_TOKENS })

    await useUserStore.getState().loginAsGuest('Ana')

    expect(api.post).toHaveBeenCalledWith('/auth/guest', { nombre: 'Ana' })
  })

  it('llama a POST /auth/guest con undefined si no se pasa nombre', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: GUEST_TOKENS })

    await useUserStore.getState().loginAsGuest()

    expect(api.post).toHaveBeenCalledWith('/auth/guest', { nombre: undefined })
  })

  it('persiste los tokens en storage tras el login exitoso', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: GUEST_TOKENS })

    await useUserStore.getState().loginAsGuest()

    expect(storage.setItem).toHaveBeenCalledWith('menyu_access_token', GUEST_TOKENS.accessToken)
    expect(storage.setItem).toHaveBeenCalledWith('menyu_refresh_token', GUEST_TOKENS.refreshToken)
  })

  it('guarda el usuario decodificado del JWT en el store', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: GUEST_TOKENS })

    await useUserStore.getState().loginAsGuest()

    const { user, isLoading } = useUserStore.getState()
    expect(user?.sub).toBe(GUEST_PAYLOAD.sub)
    expect(user?.tipo).toBe('cliente')
    expect(isLoading).toBe(false)
  })

  it('relanza el error si la API falla', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Network error'))

    await expect(useUserStore.getState().loginAsGuest()).rejects.toThrow('Network error')
  })

  it('resetea isLoading a false aunque la API falle', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Network error'))

    await useUserStore.getState().loginAsGuest().catch(() => undefined)

    expect(useUserStore.getState().isLoading).toBe(false)
  })
})

describe('userStore — refresh', () => {
  const NEW_PAYLOAD = { sub: 'user-1', tipo: 'cliente' as const, nombre: 'Coty', iat: 1, exp: 9999999999 }
  const NEW_TOKENS = { accessToken: makeJwt(NEW_PAYLOAD), refreshToken: 'new-refresh-raw' }

  beforeEach(() => {
    vi.clearAllMocks()
    useUserStore.setState({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      user: null,
      isLoading: false,
      isHydrated: true,
    })
  })

  it('llama a POST /auth/refresh con el refreshToken del store', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: NEW_TOKENS })

    await useUserStore.getState().refresh()

    expect(api.post).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'old-refresh' })
  })

  it('persiste los tokens nuevos en storage', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: NEW_TOKENS })

    await useUserStore.getState().refresh()

    expect(storage.setItem).toHaveBeenCalledWith('menyu_access_token', NEW_TOKENS.accessToken)
    expect(storage.setItem).toHaveBeenCalledWith('menyu_refresh_token', NEW_TOKENS.refreshToken)
  })

  it('actualiza el store con los tokens nuevos y el usuario decodificado', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: NEW_TOKENS })

    await useUserStore.getState().refresh()

    const { accessToken, refreshToken, user } = useUserStore.getState()
    expect(accessToken).toBe(NEW_TOKENS.accessToken)
    expect(refreshToken).toBe(NEW_TOKENS.refreshToken)
    expect(user?.sub).toBe(NEW_PAYLOAD.sub)
  })

  it('retorna el nuevo accessToken', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: NEW_TOKENS })

    const result = await useUserStore.getState().refresh()

    expect(result).toBe(NEW_TOKENS.accessToken)
  })

  it('lanza si no hay refreshToken en el store', async () => {
    useUserStore.setState({ refreshToken: null })

    await expect(useUserStore.getState().refresh()).rejects.toThrow('No hay refresh token')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('relanza el error si la API falla', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Token expirado'))

    await expect(useUserStore.getState().refresh()).rejects.toThrow('Token expirado')
  })
})
