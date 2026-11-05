// Por qué un pago quedó con `requiereRevision` (lo marca el webhook de Mercado Pago). Se guarda el primero.

/** MP aprobó un pago que ya estaba cancelado: el pago sigue cancelado y hay que devolver la plata a mano. */
export const MOTIVO_REVISION_APROBADO_SOBRE_CANCELADO = 'aprobado-sobre-cancelado' as const
/** MP aprobó un pago de una sesión ya cerrada, cubra o no el total: queda aprobado, sin tocar la sesión ni la mesa. */
export const MOTIVO_REVISION_APROBADO_SOBRE_SESION_CERRADA = 'aprobado-sobre-sesion-cerrada' as const

export type MotivoRevision =
  | typeof MOTIVO_REVISION_APROBADO_SOBRE_CANCELADO
  | typeof MOTIVO_REVISION_APROBADO_SOBRE_SESION_CERRADA
