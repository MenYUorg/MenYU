import { describe, expect, it } from 'vitest'
import { urlDelSocket } from './urlDelSocket'

describe('urlDelSocket', () => {
  it('usa VITE_WS_URL si está definida', () => {
    expect(urlDelSocket('https://ws.ejemplo.com', 'https://api.menyu-app.com/api')).toBe('https://ws.ejemplo.com')
  })

  it.each([
    ['https://api.menyu-app.com/api', 'https://api.menyu-app.com'],
    ['https://api.staging.menyu-app.com/api/', 'https://api.staging.menyu-app.com'],
    ['https://menyu-backend-staging.up.railway.app/api', 'https://menyu-backend-staging.up.railway.app'],
    ['/api', ''],
  ])('si no, saca solo el /api del final de %s', (apiUrl, socket) => {
    expect(urlDelSocket(undefined, apiUrl)).toBe(socket)
  })

  it('sin ninguna de las dos devuelve undefined', () => {
    expect(urlDelSocket(undefined, undefined)).toBeUndefined()
  })
})
