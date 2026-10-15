import { rutaInterna } from './rutaInterna'

describe('rutaInterna (a dónde volver después de iniciar sesión)', () => {
  it.each([
    '/',
    '/menu',
    '/restaurante/abc/carta',
    '/restaurante/abc/carta?pin=qr',
    '/restaurante/a%2Fb/carta',
    '/carta#postres',
  ])('"%s" es una ruta de la app', (ruta) => {
    expect(rutaInterna(ruta)).toBe(ruta)
  })

  it.each([
    ['nada', null],
    ['vacío', ''],
    ['sin barra inicial', 'restaurante/abc/carta'],
    ['otro sitio con https', 'https://otro.com/carta'],
    ['otro sitio con http', 'http://otro.com'],
    ['otro sitio sin protocolo', '//otro.com'],
    ['otro sitio con barra invertida', '/\\otro.com'],
    ['barra invertida en cualquier lado', '/carta\\otro'],
    ['javascript', 'javascript:alert(1)'],
    ['un salto de línea', '/carta\nSet-Cookie: x'],
    ['un carácter de control', '/carta\u0001'],
    ['un tabulador', '/\totro.com'],
    ['el carácter de borrado (DEL)', '/carta\u007f'],
    ['demasiado largo', '/' + 'a'.repeat(600)],
  ])('%s no lo es', (_, valor) => {
    expect(rutaInterna(valor)).toBeNull()
  })

  it('una dirección con los dos puntos y barras dentro de la ruta sigue siendo de la app', () => {
    expect(rutaInterna('/restaurante/x/carta?volver=https://otro.com')).toBe('/restaurante/x/carta?volver=https://otro.com')
  })
})
