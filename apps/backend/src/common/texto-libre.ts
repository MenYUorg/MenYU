import { applyDecorators } from '@nestjs/common'
import { Transform } from 'class-transformer'
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { SinCaracterNulo } from './sin-caracter-nulo'

/** Sin espacios en los costados. Lo que no es un texto queda igual, para que `IsString` lo rechace. */
const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

/** Como `recortar`, y un texto vacío queda en null. */
const recortarOVaciar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value)

/**
 * Un texto libre opcional que carga el dueño y se puede borrar: sin espacios en los costados, de hasta `maximo`
 * caracteres. Vacío o `null` lo borra (queda en null); sin mandarlo, no cambia.
 */
export function TextoOpcional(maximo: number): PropertyDecorator {
  return applyDecorators(Transform(recortarOVaciar), IsOptional(), IsString(), MaxLength(maximo), SinCaracterNulo())
}

/** Un texto libre que no puede quedar vacío, sin espacios en los costados y de hasta `maximo` caracteres. */
export function TextoObligatorio(maximo: number): PropertyDecorator {
  return applyDecorators(Transform(recortar), IsString(), IsNotEmpty(), MaxLength(maximo), SinCaracterNulo())
}
