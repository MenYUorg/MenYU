import { ValidateBy, type ValidationOptions } from 'class-validator'

// PostgreSQL no acepta el carácter nulo en un texto: una consulta con él falla con un 500. Se arma con su código y no se escribe
// dentro de una expresión regular: SonarCloud marca los caracteres de control en las regex ("Remove this control character").
const CARACTER_NULO = String.fromCharCode(0)

/** `true` si es un texto y no trae el carácter nulo. Lo que no es un texto tampoco pasa. */
export function esTextoSinCaracterNulo(valor: unknown): valor is string {
  return typeof valor === 'string' && !valor.includes(CARACTER_NULO)
}

/** Rechaza un texto con el carácter nulo (solo ese: el resto de los caracteres de control no se toca). */
export function SinCaracterNulo(opciones?: ValidationOptions): PropertyDecorator {
  return ValidateBy({ name: 'sinCaracterNulo', validator: { validate: esTextoSinCaracterNulo } }, opciones)
}
