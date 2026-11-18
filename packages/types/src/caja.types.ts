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
