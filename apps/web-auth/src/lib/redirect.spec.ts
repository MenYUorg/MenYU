import { describe, expect, it } from 'vitest'
import { redirectValido } from './redirect'

describe('redirectValido', () => {
  it.each([
    ['https://admin.menyu-app.com/admin/menu', 'auth.menyu-app.com'],
    ['https://staff.staging.menyu-app.com/cocina', 'auth.staging.menyu-app.com'],
    ['http://admin.menyu.local:5174/admin', 'auth.menyu.local'],
    ['https://mesa.menyu.local/', 'localhost'],
  ])('acepta %s desde %s', (url, desde) => {
    expect(redirectValido(url, desde)).toBe(url)
  })

  it.each([
    ['otro dominio', 'https://evil.com/'],
    ['un dominio que termina parecido', 'https://admin.menyu-app.com.evil.com/'],
    ['un dominio que contiene el nuestro', 'https://evilmenyu-app.com/'],
    ['http en producción', 'http://admin.menyu-app.com/'],
    ['menyu.local fuera de desarrollo', 'http://admin.menyu.local:5174/admin'],
    ['javascript:', 'javascript:alert(1)'],
    ['una ruta relativa', '/admin'],
    ['una URL sin protocolo', '//evil.com/'],
    ['usuario y contraseña', 'https://evil.com@admin.menyu-app.com/'],
    ['vacío', ''],
    ['ninguno', null],
  ])('rechaza %s', (_caso, url) => {
    expect(redirectValido(url, 'auth.menyu-app.com')).toBeNull()
  })
})
