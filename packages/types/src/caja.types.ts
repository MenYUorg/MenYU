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

// Una caja del restaurante (GET /cajas, #359), activa o dada de baja. Las crea web-admin (#360).
export interface CajaDelRestaurante {
  id: string
  restauranteId: string
  nombre: string
  activa: boolean
  createdAt: string
}

// Una caja abierta en un turno, con su fondo inicial. `id` es el de la caja del turno; `cajaId`, el de la Caja.
export interface TurnoCajaApi {
  id: string
  cajaId: string
  nombre: string
  fondoInicial: number
  abiertoEn: string
}

// Una mesa asignada a un mozo durante el turno. Una mesa sin asignación la ven todos los mozos.
export interface AsignacionDelTurno {
  mesaId: string
  mesaNumero: string
  mozoId: string
  mozoNombre: string
}

// Un turno de caja como lo devuelve la API (POST /turnos, GET /turnos/actual, PUT /turnos/:id/asignaciones). Las
// fechas viajan como string ISO.
export interface TurnoDeCaja {
  id: string
  restauranteId: string
  abiertoEn: string
  abiertoPor: { id: string; nombre: string }
  cerradoEn: string | null
  observaciones: string | null
  cajas: TurnoCajaApi[]
  asignaciones: AsignacionDelTurno[]
}

// La respuesta de GET /turnos/actual: `null` = no hay un turno abierto.
export interface TurnoActual {
  turno: TurnoDeCaja | null
}

// Por qué la precarga dejó una mesa sin asignar.
export type MotivoSinAsignar = 'varios-mozos' | 'mozo-inactivo' | 'mozo-sin-cuenta'

export interface AvisoDePrecarga {
  mesaId: string
  mesaNumero: string
  motivo: MotivoSinAsignar
}

// Una mesa y el mozo que la atiende, como viaja en los bodies y en la precarga.
export interface AsignacionDeMesa {
  mesaId: string
  mozoId: string
}

// La respuesta de GET /turnos/preparacion: los mozos y las mesas activos, y la propuesta de asignaciones que sale de la
// plantilla de cada mozo. `mesas` viene ordenada como texto ("10" antes que "2").
export interface PreparacionDeTurno {
  mozos: { id: string; nombre: string }[]
  mesas: { id: string; numero: string }[]
  precarga: {
    asignaciones: AsignacionDeMesa[]
    avisos: AvisoDePrecarga[]
  }
}

// El body de POST /turnos. `cajas`: 1 o 2, sin repetir. `asignaciones` omitida = el servidor precarga; [] = ninguna.
export interface AbrirTurnoBody {
  restauranteId: string
  cajas: { cajaId: string; fondoInicial: number }[]
  asignaciones?: AsignacionDeMesa[]
  observaciones?: string
}

// La respuesta de POST /turnos.
export interface AperturaDeTurno {
  turno: TurnoDeCaja
  avisos: AvisoDePrecarga[]
}

// El body de PUT /turnos/:id/asignaciones: reemplaza la lista entera.
export interface ReasignarMesasBody {
  asignaciones: AsignacionDeMesa[]
}

// La respuesta de PUT /turnos/:id/asignaciones.
export interface TurnoReasignado {
  turno: TurnoDeCaja
}

// El tipo de un movimiento de caja: entra o sale efectivo.
export type TipoDeMovimiento = 'INGRESO' | 'EGRESO'

// Un ingreso o un egreso de efectivo de una caja del turno (#357). Es inmutable: no se edita ni se borra. `cajaId` es
// el id de la Caja; `usuario`, la cuenta que lo cargó.
export interface MovimientoDeCaja {
  id: string
  cajaId: string
  cajaNombre: string
  tipo: TipoDeMovimiento
  monto: number
  motivo: string
  usuario: { id: string; nombre: string }
  createdAt: string
}

// El body de POST /turnos/:id/movimientos. `monto`: mayor a 0, hasta 2 decimales; `motivo`: obligatorio, hasta 200.
export interface RegistrarMovimientoBody {
  cajaId: string
  tipo: TipoDeMovimiento
  monto: number
  motivo: string
}

// La respuesta de POST /turnos/:id/movimientos.
export interface MovimientoRegistrado {
  movimiento: MovimientoDeCaja
}

// Una fila del arqueo de una caja al cerrar el turno, por método de pago.
export interface FilaDeArqueo {
  metodo: 'efectivo' | 'debito' | 'credito' | 'transferencia'
  esperado: number
  declarado: number
  diferencia: number
}

// Una caja en el detalle del turno: `arqueo` es null mientras el turno está abierto; `movimientos`, del más viejo al
// más nuevo.
export interface CajaDelDetalle {
  id: string
  cajaId: string
  nombre: string
  fondoInicial: number
  arqueo: FilaDeArqueo[] | null
  movimientos: MovimientoDeCaja[]
}

// La respuesta de GET /turnos/:id: el turno, abierto o cerrado, con sus cajas y las mesas asignadas.
export interface TurnoDetalle {
  id: string
  abiertoEn: string
  abiertoPor: { id: string; nombre: string }
  cerradoEn: string | null
  cerradoPor: { id: string; nombre: string } | null
  observaciones: string | null
  cajas: CajaDelDetalle[]
  asignaciones: AsignacionDelTurno[]
}

// Un método de pago que entra al arqueo. Mercado Pago no: se acredita en la cuenta, no en la caja.
export type MetodoDeArqueo = FilaDeArqueo['metodo']

// Lo que se contó en una caja al cerrar, por método. Los 4 son obligatorios; 0 si no hubo.
export type DeclaradoPorMetodo = Record<MetodoDeArqueo, number>

// El body de POST /turnos/:id/cierre: una entrada por cada caja abierta del turno. `cajaId` es el id de la Caja
// (TurnoCajaApi.cajaId), no el de la caja del turno. `observaciones` se suman a las del turno.
export interface CerrarTurnoBody {
  cajas: { cajaId: string; declarado: DeclaradoPorMetodo }[]
  observaciones?: string
}

// El arqueo de una caja al cerrar: los 4 métodos en el orden efectivo, debito, credito, transferencia. El esperado y
// la diferencia los calcula el backend; el esperado de efectivo puede ser negativo.
export interface ArqueoDeCaja {
  cajaId: string
  cajaNombre: string
  fondoInicial: number
  metodos: FilaDeArqueo[]
}

// Lo que el cierre avisa sin bloquear: las mesas que quedaron con una sesión abierta (una vez cada una).
export interface AvisosDelCierre {
  mesasAbiertas: { mesaId: string; mesaNumero: string; iniciadaEn: string }[]
}

// La respuesta de POST /turnos/:id/cierre: el turno cerrado, el arqueo de cada caja (por nombre) y los avisos.
export interface CierreDeTurno {
  turno: TurnoDeCaja
  arqueos: ArqueoDeCaja[]
  avisos: AvisosDelCierre
}

// Cuántos cobros y cuánto suman. La propina va siempre aparte: nunca se suma al monto.
export interface FilaDeResumen {
  cantidad: number
  monto: number
  propina: number
}

// Lo cobrado por quien cobró. `mozoId` y `mozoNombre` en null: los cobros sin mozo (van al final).
export interface ResumenPorMozo extends FilaDeResumen {
  mozoId: string | null
  mozoNombre: string | null
}

// Un pago aprobado de Mercado Pago. `cajaId` y `cajaNombre` en null: un pago sin caja de la franja del turno.
export interface PagoMercadoPago {
  id: string
  mesaNumero: string
  cajaId: string | null
  cajaNombre: string | null
  monto: number
  propina: number
  fechaCobro: string
  requiereRevision: boolean
}

// Mercado Pago del turno: informativo, no entra al arqueo. `hasta` es el cierre, o el momento de la consulta.
export interface ResumenMercadoPago extends FilaDeResumen {
  desde: string
  hasta: string
  pagos: PagoMercadoPago[]
}

// La respuesta de GET /turnos/:id/resumen: lo cobrado en las cajas del turno (siempre los 4 métodos del arqueo) y
// Mercado Pago aparte.
export interface ResumenDeTurno {
  turno: { id: string; abiertoEn: string; cerradoEn: string | null }
  porMetodo: (FilaDeResumen & { metodo: MetodoDeArqueo })[]
  porMozo: ResumenPorMozo[]
  total: FilaDeResumen
  mercadoPago: ResumenMercadoPago
}

// Cuántos movimientos tuvo una caja del turno y cuánto suman los ingresos y los egresos, por separado.
export interface TotalesDeMovimientos {
  cantidad: number
  ingresos: number
  egresos: number
}

// Una caja de un turno del historial: como en el detalle, pero con los totales de sus movimientos en lugar de la lista.
// `arqueo` es null mientras el turno está abierto.
export interface CajaDelHistorial {
  id: string
  cajaId: string
  nombre: string
  fondoInicial: number
  arqueo: FilaDeArqueo[] | null
  movimientos: TotalesDeMovimientos
}

// Un turno del historial (GET /turnos), abierto o cerrado, con sus cajas por nombre. Sin las mesas asignadas.
export interface TurnoDelHistorial {
  id: string
  abiertoEn: string
  abiertoPor: { id: string; nombre: string }
  cerradoEn: string | null
  cerradoPor: { id: string; nombre: string } | null
  observaciones: string | null
  cajas: CajaDelHistorial[]
}

// La respuesta de GET /turnos: del más nuevo al más viejo. `siguiente` es el id del primer turno de la página que sigue
// (el cursor es inclusivo); null = no hay más.
export interface PaginaDeTurnos {
  items: TurnoDelHistorial[]
  siguiente: string | null
}
