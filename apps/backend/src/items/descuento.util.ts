import { BadRequestException } from '@nestjs/common'

// Reglas de los descuentos de ítems.
//
// - El descuento se guarda como un precio entero en pesos (`precioDescuento`). El porcentaje no se
//   guarda nunca: se calcula cada vez que se lee.
// - Un descuento es válido si el precio es entero, mayor a 0 y menor al precio base, y si el porcentaje
//   resultante (redondeado) está entre 1 y 99.
// - Redondeo al peso más cercano, con .5 hacia arriba.
//
// Las cuentas se hacen en centavos enteros para que el .5 se detecte exacto y no dependa de la coma
// flotante. La función con el mismo cálculo del formulario de web-admin (vista previa en vivo) tiene que
// dar los mismos resultados: los casos de descuento.util.spec.ts se repiten allá.

export const PORCENTAJE_MIN = 1
export const PORCENTAJE_MAX = 99

export interface DescuentoDerivado {
  precioDescuento: number | null
  porcentajeDescuento: number | null
  precioVigente: number
}

const aCentavos = (pesos: number): number => Math.round(pesos * 100)

/** Cociente redondeado al entero más cercano, con .5 hacia arriba (numerador >= 0 y denominador > 0). */
const dividirRedondeado = (numerador: number, denominador: number): number =>
  Math.floor((2 * numerador + denominador) / (2 * denominador))

/** "$1.500" o "$1.234,56": para los mensajes de error. */
export function formatearPesos(valor: number): string {
  return `$${valor.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
}

type EvaluacionPrecio = { valido: true; porcentaje: number } | { valido: false; motivo: string }

/** Revisa un precio con descuento contra el precio base y calcula el porcentaje que representa. */
function evaluarPrecioConDescuento(precioBase: number, precioDescuento: number): EvaluacionPrecio {
  const base = aCentavos(precioBase)
  if (!Number.isInteger(precioDescuento) || precioDescuento <= 0 || precioDescuento * 100 >= base) {
    return {
      valido: false,
      motivo: `El precio con descuento tiene que ser un número entero mayor a 0 y menor al precio original (${formatearPesos(precioBase)})`,
    }
  }
  const porcentaje = dividirRedondeado(100 * (base - precioDescuento * 100), base)
  if (porcentaje < PORCENTAJE_MIN) {
    return { valido: false, motivo: 'El descuento es menor al 1%. Cargá un precio más bajo.' }
  }
  if (porcentaje > PORCENTAJE_MAX) {
    return { valido: false, motivo: 'El descuento no puede ser del 100%. Cargá un precio más alto.' }
  }
  return { valido: true, porcentaje }
}

/**
 * Precio con descuento (pesos enteros) para un porcentaje entero de 1 a 99.
 * Lanza 400 si el porcentaje no es válido o si el redondeo deja el precio igual al base o en $0.
 */
export function precioDesdePorcentaje(precioBase: number, porcentaje: number): number {
  if (!Number.isInteger(porcentaje) || porcentaje < PORCENTAJE_MIN || porcentaje > PORCENTAJE_MAX) {
    throw new BadRequestException(
      `El porcentaje tiene que ser un número entero entre ${PORCENTAJE_MIN} y ${PORCENTAJE_MAX}`,
    )
  }
  const base = aCentavos(precioBase)
  const precio = dividirRedondeado(base * (100 - porcentaje), 10000)
  if (precio * 100 >= base) {
    throw new BadRequestException(
      `Con ${porcentaje}% el precio no cambia (queda en ${formatearPesos(precioBase)}). Probá con un porcentaje mayor.`,
    )
  }
  if (precio <= 0) {
    throw new BadRequestException(`Con ${porcentaje}% el precio queda en $0. Probá con un porcentaje menor.`)
  }
  return precio
}

/**
 * Porcentaje (entero de 1 a 99) que representa un precio con descuento.
 * Lanza 400 si el precio no es un entero mayor a 0 y menor al base, o si el porcentaje queda fuera de rango.
 */
export function porcentajeDesdePrecio(precioBase: number, precioDescuento: number): number {
  const evaluacion = evaluarPrecioConDescuento(precioBase, precioDescuento)
  if (!evaluacion.valido) throw new BadRequestException(evaluacion.motivo)
  return evaluacion.porcentaje
}

/**
 * Los tres valores derivados que devuelve la API para un ítem. Si el descuento guardado no es válido
 * contra el precio base (no debería pasar: lo impide el CHECK de la base y la regla de cambio de precio),
 * se lo ignora y el ítem se cobra al precio base.
 */
export function derivarDescuento(
  precioBase: unknown,
  precioDescuento: number | null | undefined,
): DescuentoDerivado {
  const base = Number(precioBase)
  if (precioDescuento != null) {
    const evaluacion = evaluarPrecioConDescuento(base, precioDescuento)
    if (evaluacion.valido) {
      return {
        precioDescuento,
        porcentajeDescuento: evaluacion.porcentaje,
        precioVigente: precioDescuento,
      }
    }
  }
  return { precioDescuento: null, porcentajeDescuento: null, precioVigente: base }
}

/** Precio que se cobra por el ítem (sin extras): el del descuento si lo tiene, si no el base. */
export function precioVigente(item: { precioBase: unknown; precioDescuento?: number | null }): number {
  return derivarDescuento(item.precioBase, item.precioDescuento).precioVigente
}

/**
 * Cambiar el precio base de un ítem con descuento activo: el descuento tiene que seguir siendo válido.
 * Lanza 400 si el nuevo precio base es menor o igual al precio con descuento, o si el porcentaje
 * resultante quedaría por debajo del 1% o en 100%. Sin descuento activo no valida nada.
 */
export function assertPrecioBaseCompatible(
  nuevoPrecioBase: number,
  precioDescuento: number | null | undefined,
): void {
  if (precioDescuento == null) return

  if (aCentavos(nuevoPrecioBase) <= precioDescuento * 100) {
    throw new BadRequestException(
      `El precio base (${formatearPesos(nuevoPrecioBase)}) tiene que ser mayor al precio con descuento (${formatearPesos(precioDescuento)}). Quitá o cambiá el descuento antes de bajar el precio.`,
    )
  }
  const evaluacion = evaluarPrecioConDescuento(nuevoPrecioBase, precioDescuento)
  if (!evaluacion.valido) {
    throw new BadRequestException(
      `Con ese precio base el descuento actual (${formatearPesos(precioDescuento)}) dejaría de ser válido. Quitá el descuento o cargá otro antes de cambiar el precio.`,
    )
  }
}
