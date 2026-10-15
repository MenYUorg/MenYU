import { extractQrToken } from './qr'

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
