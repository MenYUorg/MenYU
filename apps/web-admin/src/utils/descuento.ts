// Vista previa en vivo del descuento (precio <-> porcentaje) del formulario de web-admin.
//
// Es el mismo cálculo, con los mismos mensajes, que apps/backend/src/items/descuento.util.ts: lo que se ve en
// la vista previa tiene que ser exactamente lo que guarda el backend. Los casos de descuento.spec.ts son los
// mismos que los de descuento.util.spec.ts del backend. El backend vuelve a validar todo.
//
// Reglas: el descuento es un precio entero en pesos (mayor a 0 y menor al precio base) y el porcentaje es un
// entero de 1 a 99. Se redondea al peso más cercano, con .5 hacia arriba. Las cuentas se hacen en centavos
// enteros para que el .5 se detecte exacto.

export const PORCENTAJE_MIN = 1
export const PORCENTAJE_MAX = 99

export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: string }

const aCentavos = (pesos: number): number => Math.round(pesos * 100)

/** Cociente redondeado al entero más cercano, con .5 hacia arriba (numerador >= 0 y denominador > 0). */
const dividirRedondeado = (numerador: number, denominador: number): number =>
  Math.floor((2 * numerador + denominador) / (2 * denominador))

/** "$1.500" o "$1.234,56". */
export function formatearPesos(valor: number): string {
  return `$${valor.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
}

/** Pasa el texto de un campo numérico a un entero; null si está vacío o no es un entero (sin signo ni decimales). */
export function parsearEntero(texto: string): number | null {
  const limpio = texto.trim()
  return /^\d+$/.test(limpio) ? Number(limpio) : null
}

/** Precio con descuento (pesos enteros) para un porcentaje entero de 1 a 99. */
export function precioDesdePorcentaje(precioBase: number, porcentaje: number): Resultado<number> {
  if (!Number.isInteger(porcentaje) || porcentaje < PORCENTAJE_MIN || porcentaje > PORCENTAJE_MAX) {
    return {
      ok: false,
      motivo: `El porcentaje tiene que ser un número entero entre ${PORCENTAJE_MIN} y ${PORCENTAJE_MAX}`,
    }
  }
  const base = aCentavos(precioBase)
  const precio = dividirRedondeado(base * (100 - porcentaje), 10000)
  if (precio * 100 >= base) {
    return {
      ok: false,
      motivo: `Con ${porcentaje}% el precio no cambia (queda en ${formatearPesos(precioBase)}). Probá con un porcentaje mayor.`,
    }
  }
  if (precio <= 0) {
    return { ok: false, motivo: `Con ${porcentaje}% el precio queda en $0. Probá con un porcentaje menor.` }
  }
  return { ok: true, valor: precio }
}

/** Porcentaje (entero de 1 a 99) que representa un precio con descuento. */
export function porcentajeDesdePrecio(precioBase: number, precioDescuento: number): Resultado<number> {
  const base = aCentavos(precioBase)
  if (!Number.isInteger(precioDescuento) || precioDescuento <= 0 || precioDescuento * 100 >= base) {
    return {
      ok: false,
      motivo: `El precio con descuento tiene que ser un número entero mayor a 0 y menor al precio original (${formatearPesos(precioBase)})`,
    }
  }
  const porcentaje = dividirRedondeado(100 * (base - precioDescuento * 100), base)
  if (porcentaje < PORCENTAJE_MIN) {
    return { ok: false, motivo: 'El descuento es menor al 1%. Cargá un precio más bajo.' }
  }
  if (porcentaje > PORCENTAJE_MAX) {
    return { ok: false, motivo: 'El descuento no puede ser del 100%. Cargá un precio más alto.' }
  }
  return { ok: true, valor: porcentaje }
}

/** true si aplicar el porcentaje al precio base obliga a redondear (para avisarlo en la vista previa). */
export function seRedondea(precioBase: number, porcentaje: number): boolean {
  return (aCentavos(precioBase) * (100 - porcentaje)) % 10000 !== 0
}

/**
 * Cambiar el precio base de un ítem con descuento activo: el descuento tiene que seguir siendo válido.
 * Devuelve el motivo si no lo es, o null si se puede (o si no hay descuento).
 */
export function motivoPrecioBaseIncompatible(
  nuevoPrecioBase: number,
  precioDescuento: number | null | undefined,
): string | null {
  if (precioDescuento == null) return null
  if (aCentavos(nuevoPrecioBase) <= precioDescuento * 100) {
    return `El precio base (${formatearPesos(nuevoPrecioBase)}) tiene que ser mayor al precio con descuento (${formatearPesos(precioDescuento)}). Quitá o cambiá el descuento antes de bajar el precio.`
  }
  const evaluacion = porcentajeDesdePrecio(nuevoPrecioBase, precioDescuento)
  if (!evaluacion.ok) {
    return `Con ese precio base el descuento actual (${formatearPesos(precioDescuento)}) dejaría de ser válido. Quitá el descuento o cargá otro antes de cambiar el precio.`
  }
  return null
}
