// @menyu/types — tipos compartidos del dominio MenYu
// Se irán completando sprint a sprint

export type EstadoPedido = 'PENDIENTE' | 'EN_PREPARACION' | 'LISTO' | 'ENTREGADO' | 'CANCELADO'
export type EstadoSesion = 'ABIERTA' | 'CERRADA' | 'PAGANDO'
export type EstadoLlamado = 'PENDIENTE' | 'ATENDIDO'
export type RolUsuario = 'ADMIN' | 'MOZO' | 'COCINA' | 'CLIENTE'
