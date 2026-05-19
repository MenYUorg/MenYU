import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '../services/api'
import { useAuthStore } from './authStore'

const TOKEN_KEY = 'menyu_access_token'
const REFRESH_KEY = 'menyu_refresh_token'

vi.mock('../services/api', () => ({
  api: {
    auth: {
      login: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
    },
    marcas: { list: vi.fn() },
    restaurantes: { list: vi.fn() },
  },
  TOKEN_KEY: 'menyu_access_token',
  REFRESH_KEY: 'menyu_refresh_token',
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message)
      this.name = 'ApiError'
    }
  },
}))

describe('authStore — logout', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(api.auth.logout).mockResolvedValue(undefined)
    useAuthStore.setState({
      user: null,
      isLoggedIn: false,
      loading: false,
      error: null,
      marcas: [],
      restaurantes: [],
      selectedMarcaId: null,
      selectedRestauranteId: null,
    })
  })

  it('llama a api.auth.logout con el refreshToken guardado en localStorage', async () => {
    localStorage.setItem(REFRESH_KEY, 'test-refresh-token')

    await useAuthStore.getState().logout()

    expect(api.auth.logout).toHaveBeenCalledWith('test-refresh-token')
  })

  it('limpia localStorage aunque la llamada a la API falle', async () => {
    localStorage.setItem(TOKEN_KEY, 'access-token')
    localStorage.setItem(REFRESH_KEY, 'refresh-token')
    vi.mocked(api.auth.logout).mockRejectedValueOnce(new Error('Network error'))

    await useAuthStore.getState().logout()

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull()
  })

  it('no llama a la API si no hay refreshToken en localStorage', async () => {
    await useAuthStore.getState().logout()

    expect(api.auth.logout).not.toHaveBeenCalled()
  })

  it('resetea todo el estado del store', async () => {
    useAuthStore.setState({
      user: { sub: 'u1', tipo: 'admin' } as never,
      isLoggedIn: true,
      marcas: [{ id: 'm1', nombre: 'Marca' } as never],
      restaurantes: [{ id: 'r1', nombre: 'Rest' } as never],
      selectedMarcaId: 'm1',
      selectedRestauranteId: 'r1',
    })

    await useAuthStore.getState().logout()

    const { user, isLoggedIn, marcas, restaurantes, selectedMarcaId, selectedRestauranteId } =
      useAuthStore.getState()
    expect(user).toBeNull()
    expect(isLoggedIn).toBe(false)
    expect(marcas).toEqual([])
    expect(restaurantes).toEqual([])
    expect(selectedMarcaId).toBeNull()
    expect(selectedRestauranteId).toBeNull()
  })
})
