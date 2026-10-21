import { describe, expect, it } from 'vitest'
import { redirectValido } from './redirect'

describe('redirectValido', () => {
  it.each([
    'https://admin.menyu-app.com/admin/menu',
    'https://staff.staging.menyu-app.com/cocina',
    'http://admin.menyu.local:5174/admin',
    'https://mesa.menyu.local/',
  ])('acepta %s', (url) => {
    expect(redirectValido(url)).toBe(url)
  })

  it.each([
    ['otro dominio', 'https://evil.com/'],
    ['un dominio que termina parecido', 'https://admin.menyu-app.com.evil.com/'],
    ['un dominio que contiene el nuestro', 'https://evilmenyu-app.com/'],
    ['http en producción', 'http://admin.menyu-app.com/'],
    ['javascript:', 'javascript:alert(1)'],
    ['una ruta relativa', '/admin'],
    ['una URL sin protocolo', '//evil.com/'],
    ['usuario y contraseña', 'https://evil.com@admin.menyu-app.com/'],
    ['vacío', ''],
    ['ninguno', null],
  ])('rechaza %s', (_caso, url) => {
    expect(redirectValido(url)).toBeNull()
  })
})
