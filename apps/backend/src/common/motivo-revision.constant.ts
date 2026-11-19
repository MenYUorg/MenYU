// Por qué un pago quedó con `requiereRevision` (lo marca el webhook de Mercado Pago). Se guarda el primero.

/** MP aprobó un pago que ya estaba cancelado: el pago sigue cancelado y hay que devolver la plata a mano. */
export const MOTIVO_REVISION_APROBADO_SOBRE_CANCELADO = 'aprobado-sobre-cancelado' as const
/** MP aprobó un pago de una sesión ya cerrada, cubra o no el total: queda aprobado, sin tocar la sesión ni la mesa. */
export const MOTIVO_REVISION_APROBADO_SOBRE_SESION_CERRADA = 'aprobado-sobre-sesion-cerrada' as const
/** MP aprobó un pago sin turno abierto en el restaurante (#358): queda aprobado, pero sin caja. */
export const MOTIVO_REVISION_APROBADO_SIN_TURNO = 'aprobado-sin-turno' as const

export type MotivoRevision =
  | typeof MOTIVO_REVISION_APROBADO_SOBRE_CANCELADO
  | typeof MOTIVO_REVISION_APROBADO_SOBRE_SESION_CERRADA
  | typeof MOTIVO_REVISION_APROBADO_SIN_TURNO
