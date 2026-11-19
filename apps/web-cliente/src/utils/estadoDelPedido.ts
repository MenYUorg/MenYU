/** Los estados de un pedido, como los llama el backend. */
export type EstadoDelPedido = 'pendiente' | 'en_preparacion' | 'listo' | 'entregado' | 'anulado'

/**
 * Lo que ve (y escucha) el comensal de cada estado. Es el texto del distintivo de "Mis pedidos" y, en minúscula, lo que
 * anuncia el lector cuando cocina cambia el pedido ("Tu pedido de Hamburguesa está listo para servir").
 */
export const TEXTO_DEL_ESTADO: Record<EstadoDelPedido, string> = {
  pendiente: 'Enviado a cocina',
  en_preparacion: 'En preparación',
  listo: 'Listo para servir',
  entregado: 'Entregado',
  anulado: 'Cancelado',
}

/** Cómo se dice el estado en medio de una frase: "Tu pedido de … está {estado}". */
export function estadoEnUnaFrase(estado: EstadoDelPedido): string {
  const texto = TEXTO_DEL_ESTADO[estado]
  // "Enviado a cocina" empieza con mayúscula por ser un título; en la frase va en minúscula.
  return texto.charAt(0).toLowerCase() + texto.slice(1)
}

/**
 * De qué es el pedido, para decirlo en voz alta: un plato por su nombre, dos con "y", y desde tres, el primero y cuántos
 * más ("Hamburguesa y 2 más"). Un pedido sin platos (no debería pasar) es "tu pedido" a secas.
 */
export function platosDelPedido(items: ReadonlyArray<{ item: { nombre: string } }>): string {
  const nombres = items.map((i) => i.item.nombre)
  if (nombres.length === 0) return ''
  if (nombres.length === 1) return nombres[0]
  if (nombres.length === 2) return `${nombres[0]} y ${nombres[1]}`
  return `${nombres[0]} y ${nombres.length - 1} más`
}

/** La frase que se anuncia cuando cambia el estado de un pedido. */
export function anuncioDelCambioDeEstado(
  items: ReadonlyArray<{ item: { nombre: string } }>,
  estado: EstadoDelPedido,
): string {
  const platos = platosDelPedido(items)
  return `${platos ? `Tu pedido de ${platos}` : 'Tu pedido'} está ${estadoEnUnaFrase(estado)}`
}
