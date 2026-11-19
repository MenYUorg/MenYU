import type {
  ArqueoDeCaja,
  AvisosDelCierre,
  CerrarTurnoBody,
  CierreDeTurno,
  DeclaradoPorMetodo,
  MetodoDeArqueo,
  TurnoCajaApi,
  TurnoDetalle,
} from '@menyu/types'
import type { SesionActivaItem } from '../services/api'
import { leerMonto, METODOS_DE_ARQUEO, MONTO_MAXIMO, ordenarMesas, type ErrorDeMonto } from '@menyu/ui/caja'

export type MontoDeclarado = { ok: true; valor: number } | { ok: false; mensaje: string }

const MENSAJES: Record<ErrorDeMonto, string> = {
  negativo: 'Lo que contaste no puede ser negativo',
  decimales: 'Lo que contaste admite hasta 2 decimales',
  formato: 'Escribí lo que contaste solo con números, con coma o punto para los decimales',
  tope: 'Lo que contaste no puede superar $99.999.999,99',
}

/**
 * Lee lo que se contó de un método al cerrar (#359). Es obligatorio: vacío es un error. 0 es válido y se manda. Mismo
 * formato que el fondo y los movimientos: coma o punto decimal, hasta 2 decimales, sin miles.
 */
export function parsearMontoDeclarado(texto: string): MontoDeclarado {
  const monto = leerMonto(texto, MONTO_MAXIMO)
  if (!monto.ok) return { ok: false, mensaje: MENSAJES[monto.error] }
  if (monto.valor === null) return { ok: false, mensaje: 'Ingresá lo que contaste (0 si no hubo)' }
  return { ok: true, valor: monto.valor }
}

/** Lo escrito en el formulario de cierre, o sus errores: por caja (el `cajaId` de la Caja) y por método. */
export type PorCajaYMetodo = Record<string, Partial<Record<MetodoDeArqueo, string>>>

export type CierreLeido = { ok: true; body: CerrarTurnoBody } | { ok: false; errores: PorCajaYMetodo }

/**
 * Arma el body de POST /turnos/:id/cierre: una entrada por caja del turno, en su orden, con su `cajaId` (el de la Caja,
 * no el de la caja del turno) y los 4 métodos. Las observaciones van recortadas y solo si queda algo.
 */
export function leerCierre(cajas: TurnoCajaApi[], valores: PorCajaYMetodo, observaciones: string): CierreLeido {
  const errores: PorCajaYMetodo = {}
  const cajasDelBody: CerrarTurnoBody['cajas'] = []
  for (const caja of cajas) {
    const declarado: Partial<DeclaradoPorMetodo> = {}
    for (const { metodo } of METODOS_DE_ARQUEO) {
      const monto = parsearMontoDeclarado(valores[caja.cajaId]?.[metodo] ?? '')
      if (monto.ok) declarado[metodo] = monto.valor
      else errores[caja.cajaId] = { ...errores[caja.cajaId], [metodo]: monto.mensaje }
    }
    cajasDelBody.push({ cajaId: caja.cajaId, declarado: declarado as DeclaradoPorMetodo })
  }
  if (Object.keys(errores).length > 0) return { ok: false, errores }

  const texto = observaciones.trim()
  return { ok: true, body: { cajas: cajasDelBody, ...(texto ? { observaciones: texto } : {}) } }
}

/** Un campo del formulario de cierre: el método de una caja (por el `cajaId` de la Caja). */
export interface CampoDelCierre {
  cajaId: string
  metodo: MetodoDeArqueo
}

/** El primer campo con error en el orden del formulario: las cajas del turno y, en cada una, los métodos. */
export function primerCampoConError(cajas: TurnoCajaApi[], errores: PorCajaYMetodo): CampoDelCierre | null {
  for (const { cajaId } of cajas) {
    const metodo = METODOS_DE_ARQUEO.find((m) => errores[cajaId]?.[m.metodo])
    if (metodo) return { cajaId, metodo: metodo.metodo }
  }
  return null
}

/** Una mesa con una sesión abierta antes de cerrar (GET /sessions/activas): para avisar, no para bloquear. */
export interface MesaAbiertaPrevia {
  mesaId: string
  mesaNumero: string
  /** Desde que se abrió su sesión más antigua. */
  minutos: number
  /** Si alguna de sus sesiones pidió pagar. */
  quierePagar: boolean
}

/**
 * Las sesiones activas, una vez por mesa (con los minutos de la más antigua; pidió pagar si alguna pidió), en orden
 * natural.
 */
export function mesasAbiertasDeSesiones(sesiones: SesionActivaItem[]): MesaAbiertaPrevia[] {
  const porMesa = new Map<string, MesaAbiertaPrevia>()
  for (const s of sesiones) {
    const anterior = porMesa.get(s.mesaId)
    porMesa.set(s.mesaId, {
      mesaId: s.mesaId,
      mesaNumero: s.mesaNumero,
      minutos: Math.max(anterior?.minutos ?? 0, s.tiempoTranscurrido),
      quierePagar: (anterior?.quierePagar ?? false) || s.quierePagar,
    })
  }
  return ordenarMesas([...porMesa.values()].map((mesa) => ({ numero: mesa.mesaNumero, mesa }))).map(({ mesa }) => mesa)
}

/** Cuánto hace: "menos de 1 min", "12 min", "2 h" o "2 h 5 min". Un valor no finito o negativo cuenta como 0. */
export function textoDeTiempoTranscurrido(minutos: number): string {
  const enteros = Number.isFinite(minutos) && minutos > 0 ? Math.floor(minutos) : 0
  if (enteros < 1) return 'menos de 1 min'
  if (enteros < 60) return `${enteros} min`
  const horas = Math.floor(enteros / 60)
  const resto = enteros % 60
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`
}

/** "Mesa 7 (hace 12 min)", o "Mesa 7 (hace 12 min, pidió pagar)". */
export function textoDeMesaAbiertaPrevia(mesa: MesaAbiertaPrevia): string {
  const pidio = mesa.quierePagar ? ', pidió pagar' : ''
  return `Mesa ${mesa.mesaNumero} (hace ${textoDeTiempoTranscurrido(mesa.minutos)}${pidio})`
}

/**
 * Lo que muestra la pantalla después de cerrar: el arqueo de cada caja y las mesas que quedaron abiertas. Sale de la
 * respuesta del cierre o, si esa respuesta no llegó, del detalle del turno ya cerrado. `mesasAbiertas` en null: no se
 * pudo saber (el detalle no las trae).
 */
export interface ResultadoDelCierre {
  turnoId: string
  cerradoEn: string
  arqueos: ArqueoDeCaja[]
  mesasAbiertas: AvisosDelCierre['mesasAbiertas'] | null
}

/** El resultado desde la respuesta de POST /turnos/:id/cierre. */
export function resultadoDesdeElCierre({ turno, arqueos, avisos }: CierreDeTurno): ResultadoDelCierre {
  if (turno.cerradoEn === null) throw new Error('La respuesta del cierre trae el turno abierto')
  return { turnoId: turno.id, cerradoEn: turno.cerradoEn, arqueos, mesasAbiertas: avisos.mesasAbiertas }
}

/**
 * El resultado desde GET /turnos/:id, con el turno ya cerrado. Las cajas del detalle vienen por nombre, como los
 * arqueos del cierre (los dos ordenan por `caja.nombre` en el backend): el resultado es el mismo por los dos caminos.
 * Sin las mesas abiertas (null). Un turno abierto o una caja sin arqueo es un error.
 */
export function resultadoDesdeElDetalle(detalle: TurnoDetalle): ResultadoDelCierre {
  if (detalle.cerradoEn === null) throw new Error('El turno sigue abierto')
  const arqueos = detalle.cajas.map((caja) => {
    if (caja.arqueo === null) throw new Error(`El turno no tiene el arqueo de la caja «${caja.nombre}»`)
    return { cajaId: caja.cajaId, cajaNombre: caja.nombre, fondoInicial: caja.fondoInicial, metodos: caja.arqueo }
  })
  return { turnoId: detalle.id, cerradoEn: detalle.cerradoEn, arqueos, mesasAbiertas: null }
}
