// Una caja abierta del turno abierto del restaurante (GET /cajas/abiertas, #359). `cajaId` es el id de la Caja: el que
// acepta `cajaId` en el cobro (PATCH /sessions/:id/cobro).
export interface CajaAbierta {
  cajaId: string
  nombre: string
}

// La respuesta de GET /cajas/abiertas: por nombre de la caja. Vacía = no hay un turno abierto.
export interface CajasAbiertas {
  cajas: CajaAbierta[]
}
