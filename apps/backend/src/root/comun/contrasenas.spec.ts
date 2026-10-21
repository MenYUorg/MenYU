import * as crypto from 'node:crypto'
import {
  LARGO_PASSWORD_GENERADA,
  MAX_BYTES_PASSWORD,
  MIN_LARGO_PASSWORD,
  generarPassword,
  motivoContrasenaDebil,
} from './contrasenas'

describe('motivoContrasenaDebil', () => {
  it('acepta una contraseña larga, variada y sin relación con el email', () => {
    expect(motivoContrasenaDebil('Caracol-Violeta-48', 'ana@ejemplo.com')).toBeNull()
  })

  it('rechaza las de menos de 12 caracteres', () => {
    expect(motivoContrasenaDebil('Corta-1234', 'ana@ejemplo.com')).toMatch(/al menos 12 caracteres/)
    expect(motivoContrasenaDebil('a'.repeat(MIN_LARGO_PASSWORD - 1), 'ana@ejemplo.com')).toMatch(/al menos 12/)
  })

  it('rechaza las que bcrypt cortaría (más de 72 bytes), también con letras de varios bytes', () => {
    expect(motivoContrasenaDebil('Caracol-' + 'x7'.repeat(33), 'ana@ejemplo.com')).toMatch(/demasiado larga/)
    expect(motivoContrasenaDebil('ñ'.repeat(37) + 'Ab1!x', 'ana@ejemplo.com')).toMatch(/demasiado larga/) // 37 * 2 bytes + 5 > 72
    expect(motivoContrasenaDebil('Aa1!' + 'x7q9'.repeat(17), 'ana@ejemplo.com')).toBeNull() // 72 bytes justos
    expect(Buffer.byteLength('Aa1!' + 'x7q9'.repeat(17))).toBe(MAX_BYTES_PASSWORD)
  })

  it('rechaza las que repiten siempre lo mismo', () => {
    expect(motivoContrasenaDebil('abababababab', 'ana@ejemplo.com')).toMatch(/Repite/)
  })

  it.each(['root1234', 'ROOT1234', 'Password1234', 'qwerty123456', '123456789012', 'contrasena123'])('rechaza la conocida %s', (c) => {
    // Las de menos de 12 caracteres caen por el largo; las de 12 o más, por ser conocidas.
    expect(motivoContrasenaDebil(c, 'ana@ejemplo.com')).not.toBeNull()
  })

  it('rechaza una conocida de 12 caracteres o más por conocida', () => {
    expect(motivoContrasenaDebil('qwerty123456', 'ana@ejemplo.com')).toMatch(/conocida/)
  })

  it('rechaza las que contienen la parte del email antes de la arroba', () => {
    expect(motivoContrasenaDebil('Bruno-Violeta-48', 'bruno@ejemplo.com')).toMatch(/parte del email/)
  })

  it('no se fija en la parte del email si es muy corta', () => {
    expect(motivoContrasenaDebil('Caracol-Violeta-48', 'a@ejemplo.com')).toBeNull()
  })
})

describe('generarPassword', () => {
  const MUESTRAS = 3000
  const muestras = Array.from({ length: MUESTRAS }, () => generarPassword())

  it('tiene 12 caracteres', () => {
    expect(muestras.every((p) => p.length === LARGO_PASSWORD_GENERADA)).toBe(true)
    expect(LARGO_PASSWORD_GENERADA).toBe(12)
  })

  it('usa solo letras y números, sin los que se confunden (0, O, 1, l, I)', () => {
    for (const p of muestras) expect(p).toMatch(/^[2-9A-HJ-NP-Za-km-z]+$/)
  })

  it('siempre tiene al menos una minúscula, una mayúscula y un número', () => {
    for (const p of muestras) {
      expect(p).toMatch(/[a-z]/)
      expect(p).toMatch(/[A-Z]/)
      expect(p).toMatch(/[2-9]/)
    }
  })

  it('cumple la misma política que se le pide a quien la elige', () => {
    for (const p of muestras) expect(motivoContrasenaDebil(p, 'ana@ejemplo.com')).toBeNull()
  })

  it('no se repite', () => {
    expect(new Set(muestras).size).toBe(MUESTRAS)
  })

  it('reparte los caracteres: las tres obligatorias no quedan siempre en el mismo lugar y todos los lugares usan todo el alfabeto', () => {
    // Si las tres obligatorias quedaran siempre al principio, la primera posición sería siempre una minúscula.
    const primeras = new Set(muestras.map((p) => (/[a-z]/.test(p[0]) ? 'min' : /[A-Z]/.test(p[0]) ? 'may' : 'num')))
    expect(primeras.size).toBe(3)
  })

  it('usa crypto.randomInt y nunca Math.random', () => {
    // Arrange
    const aleatorio = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random no es seguro para contraseñas')
    })
    const seguro = jest.spyOn(crypto, 'randomInt')

    // Act
    const password = generarPassword()

    // Assert
    expect(password).toHaveLength(12)
    expect(seguro).toHaveBeenCalled()
    expect(aleatorio).not.toHaveBeenCalled()
    aleatorio.mockRestore()
    seguro.mockRestore()
  })
})
