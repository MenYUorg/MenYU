import { randomInt } from 'node:crypto'

/**
 * Contraseñas de las cuentas ROOT y de los dueños (docs/plan-consola-root.md, decisiones 8, 14 y 20).
 *
 * Sin dependencias de Nest: lo usan los servicios de la consola y el script de cuentas ROOT.
 */

export const MIN_LARGO_PASSWORD = 12

/** bcrypt solo mira los primeros 72 bytes: más allá no suma seguridad y dos contraseñas distintas darían el mismo hash. */
export const MAX_BYTES_PASSWORD = 72

export const LARGO_PASSWORD_GENERADA = 12

const CONTRASENAS_CONOCIDAS = ['root1234', 'password123', 'password1234', 'admin1234', 'qwerty123456', '123456789012', 'contrasena123']

/** Devuelve el motivo si la contraseña no sirve para una cuenta ROOT o de dueño, o null si está bien. */
export function motivoContrasenaDebil(contrasena: string, email: string): string | null {
  if (contrasena.length < MIN_LARGO_PASSWORD) return `Tiene que tener al menos ${MIN_LARGO_PASSWORD} caracteres.`
  if (Buffer.byteLength(contrasena, 'utf8') > MAX_BYTES_PASSWORD) return `Es demasiado larga (hasta ${MAX_BYTES_PASSWORD} bytes).`
  if (new Set(contrasena).size < 5) return 'Repite demasiado los mismos caracteres.'
  if (CONTRASENAS_CONOCIDAS.includes(contrasena.toLowerCase())) return 'Es una contraseña conocida.'
  const usuario = email.split('@')[0]
  if (usuario.length >= 4 && contrasena.toLowerCase().includes(usuario)) return 'Contiene la parte del email antes de la arroba.'
  return null
}

// Sin los caracteres que se confunden al leerlos o copiarlos: 0/O, 1/l/I.
const MINUSCULAS = 'abcdefghijkmnopqrstuvwxyz'
const MAYUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITOS = '23456789'
const TODOS = MINUSCULAS + MAYUSCULAS + DIGITOS

const elegir = (alfabeto: string): string => alfabeto[randomInt(alfabeto.length)]

/**
 * Una contraseña temporal de 12 caracteres con `crypto.randomInt` (no `Math.random`): al menos una minúscula, una mayúscula y un
 * número, y ninguno de los caracteres que se confunden. Se muestra una sola vez y la persona la cambia en su primer ingreso.
 */
export function generarPassword(): string {
  for (;;) {
    const caracteres = [elegir(MINUSCULAS), elegir(MAYUSCULAS), elegir(DIGITOS)]
    while (caracteres.length < LARGO_PASSWORD_GENERADA) caracteres.push(elegir(TODOS))
    // Fisher-Yates con randomInt, para que las tres obligatorias no queden siempre al principio.
    for (let i = caracteres.length - 1; i > 0; i--) {
      const j = randomInt(i + 1)
      ;[caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]]
    }
    const password = caracteres.join('')
    if (motivoContrasenaDebil(password, '') === null) return password
  }
}
