import { HttpException, HttpStatus } from '@nestjs/common'

// Los errores del endpoint del asistente llevan `{ codigo, mensaje }` de cuerpo, para que el chat de web-cliente muestre
// cada caso (docs/asistente/specs/asistente.md, "Endpoint del asistente y streaming"). Es la misma forma que
// `ErrorDelAsistente` de `@menyu/types`: el backend no lo importa porque el Dockerfile compila sin `packages/types`.

export type CodigoDeErrorDelAsistente =
  | 'asistente_deshabilitado'
  | 'sesion_invalida'
  | 'pregunta_invalida'
  | 'pregunta_larga'
  | 'limite_sesion'
  | 'limite_ip'
  | 'no_disponible_hoy'
  | 'no_disponible_momentaneamente'
  | 'error_del_asistente'

export interface ErrorDelAsistente {
  codigo: CodigoDeErrorDelAsistente
  mensaje: string
}

const ERRORES: Record<CodigoDeErrorDelAsistente, { status: HttpStatus; mensaje: string }> = {
  asistente_deshabilitado: {
    status: HttpStatus.FORBIDDEN,
    mensaje: 'El asistente no está disponible en este restaurante.',
  },
  sesion_invalida: {
    status: HttpStatus.FORBIDDEN,
    mensaje: 'La sesión de la mesa venció o es de otro restaurante.',
  },
  pregunta_invalida: {
    status: HttpStatus.BAD_REQUEST,
    mensaje: 'Escribí una pregunta para el asistente.',
  },
  pregunta_larga: {
    status: HttpStatus.BAD_REQUEST,
    mensaje: 'La pregunta es muy larga.',
  },
  // Los límites de uso ("Límites de uso" de la spec). Con token de mesa cuenta la sesión; sin él, la IP.
  limite_sesion: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    mensaje: 'Llegaste al límite de preguntas al asistente en esta mesa. Para otras consultas, preguntale al mozo.',
  },
  limite_ip: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    mensaje: 'Hiciste muchas preguntas seguidas. Probá de nuevo en unos minutos.',
  },
  // El tope diario propio (ASISTENTE_MAX_PREGUNTAS_DIA), la red de seguridad del gasto.
  no_disponible_hoy: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    mensaje: 'El asistente no está disponible por hoy.',
  },
  // El proveedor respondió 429 (cupo por minuto o por día), o una ráfaga de preguntas simultáneas chocó dos veces al
  // contarse en el registro. No es el tope diario propio (no_disponible_hoy).
  no_disponible_momentaneamente: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    mensaje: 'El asistente tiene muchas consultas en este momento. Probá de nuevo en unos minutos.',
  },
  error_del_asistente: {
    status: HttpStatus.BAD_GATEWAY,
    mensaje: 'El asistente no pudo responder. Probá de nuevo.',
  },
}

export function cuerpoDeError(codigo: CodigoDeErrorDelAsistente, mensaje?: string): ErrorDelAsistente {
  return { codigo, mensaje: mensaje ?? ERRORES[codigo].mensaje }
}

/** Responde el status del código con `{ codigo, mensaje }` de cuerpo. */
export function errorDelAsistente(codigo: CodigoDeErrorDelAsistente, mensaje?: string): HttpException {
  return new HttpException(cuerpoDeError(codigo, mensaje), ERRORES[codigo].status)
}
