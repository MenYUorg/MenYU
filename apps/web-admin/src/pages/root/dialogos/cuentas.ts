// Las mismas reglas que valida la API al invitar (apps/backend/src/root/comun/dto/invitar-cuenta.dto.ts): se avisa antes de mandar.
export const MAX_NOMBRE_PERSONA = 100
export const MAX_EMAIL = 254
const FORMA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function errorDeNombreDePersona(nombre: string): string {
  if (!nombre.trim()) return 'Escribí el nombre.'
  if (nombre.trim().length > MAX_NOMBRE_PERSONA) return `Tiene que tener hasta ${MAX_NOMBRE_PERSONA} caracteres.`
  return ''
}

export function errorDeEmail(email: string): string {
  const texto = email.trim()
  if (!texto) return 'Escribí el email.'
  if (texto.length > MAX_EMAIL) return `Tiene que tener hasta ${MAX_EMAIL} caracteres.`
  if (!FORMA_EMAIL.test(texto)) return 'Revisá el email: tiene que ser como nombre@dominio.com.'
  return ''
}

/** Como lo guarda la API: sin espacios sobrantes y en minúsculas. */
export function emailParaInvitar(email: string): string {
  return email.trim().toLowerCase()
}
