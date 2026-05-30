import { TOKEN_KEY } from '@menyu/auth'

const BASE = import.meta.env.VITE_API_URL ?? ''

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
    throw new Error(typeof err['message'] === 'string' ? err['message'] : `Error ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  waiterCalls: {
    atender: (id: string) =>
      req<{ id: string; estado: string; mozoId: string | null }>('PATCH', `/waiter-calls/${id}/atender`),
  },
}
