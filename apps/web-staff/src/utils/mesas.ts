const COMPARADOR = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })

/**
 * Las mesas por número en orden natural: "2" antes que "10", y "A2" antes que "A10". La API las ordena como texto
 * ("10" antes que "2"). Devuelve una copia; con números iguales respeta el orden de entrada.
 */
export function ordenarMesas<T extends { numero: string }>(mesas: readonly T[]): T[] {
  return [...mesas].sort((a, b) => COMPARADOR.compare(a.numero, b.numero))
}
