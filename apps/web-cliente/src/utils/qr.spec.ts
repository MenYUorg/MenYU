import { extractQrToken, leerQrDeMesa } from './qr'

describe('extractQrToken', () => {
  it('del link del QR de una mesa saca el código de la mesa', () => {
    expect(extractQrToken('https://menyu-cliente.vercel.app/check-in?restaurantId=rest-1&tableCode=abc123')).toBe('abc123')
  })

  it('acepta también el parámetro qrToken, que manda sobre tableCode', () => {
    expect(extractQrToken('https://menyu.app/check-in?tableCode=viejo&qrToken=nuevo')).toBe('nuevo')
  })

  it('si el link no tiene parámetros usa el último tramo de la ruta', () => {
    expect(extractQrToken('https://menyu.app/mesa/xyz789')).toBe('xyz789')
  })

  it('si el link no tiene ni ruta ni parámetros devuelve lo leído tal cual', () => {
    expect(extractQrToken('https://menyu.app')).toBe('https://menyu.app')
  })

  it('un código suelto (que no es un link) se devuelve tal cual', () => {
    expect(extractQrToken('abc123')).toBe('abc123')
  })
})

describe('leerQrDeMesa', () => {
  it('del link del QR de una mesa saca el código y el restaurante', () => {
    expect(leerQrDeMesa('https://mesa.menyu-app.com/check-in?restaurantId=rest-1&tableCode=abc123')).toStrictEqual({
      qrToken: 'abc123',
      restauranteId: 'rest-1',
    })
  })

  it('un código suelto, o un link sin restaurante, va sin restaurante (el servidor no tiene con qué cruzarlo)', () => {
    expect(leerQrDeMesa('abc123')).toStrictEqual({ qrToken: 'abc123' })
    expect(leerQrDeMesa('https://mesa.menyu-app.com/check-in?tableCode=abc123&restaurantId=')).toStrictEqual({ qrToken: 'abc123' })
  })
})
