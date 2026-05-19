import type { TokenPair } from '@menyu/types'

export const TOKEN_KEY = 'menyu_access_token'
export const REFRESH_KEY = 'menyu_refresh_token'

const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
    throw new ApiError(
      res.status,
      typeof err['message'] === 'string' ? err['message'] : `Error ${res.status}`,
    )
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const authService = {
  login: (email: string, password: string) =>
    post<TokenPair>('/auth/login', { email, password }),
  register: (nombre: string, email: string, password: string) =>
    post<TokenPair>('/auth/register', { nombre, email, password }),
  guest: (nombre?: string) =>
    post<TokenPair>('/auth/guest', { nombre }),
  logout: (refreshToken: string) =>
    post<void>('/auth/logout', { refreshToken }),
  refresh: (refreshToken: string) =>
    post<TokenPair>('/auth/refresh', { refreshToken }),
}
