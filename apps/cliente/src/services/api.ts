import axios from 'axios'

const API_URL = 'https://menyuapi-production.up.railway.app/api'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Callbacks que el store registra después de crearse.
// Evita la dependencia circular api.ts ↔ userStore.ts
let _getToken: () => string | null = () => null
let _doRefresh: () => Promise<string> = () => Promise.reject(new Error('Auth no configurado'))
let _doLogout: () => Promise<void> = () => Promise.resolve()

export function configureApiAuth(handlers: {
  getToken: () => string | null
  refresh: () => Promise<string>
  logout: () => Promise<void>
}) {
  _getToken = handlers.getToken
  _doRefresh = handlers.refresh
  _doLogout = handlers.logout
}

api.interceptors.request.use((config) => {
  const token = _getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original._retried) {
      return Promise.reject(error)
    }
    original._retried = true
    try {
      const newToken = await _doRefresh()
      original.headers.Authorization = `Bearer ${newToken}`
      return api(original)
    } catch {
      await _doLogout()
      return Promise.reject(error)
    }
  },
)
