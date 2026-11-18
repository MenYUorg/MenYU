import type { AsignacionDeMesa, AsignacionDelTurno, AvisoDePrecarga, MotivoSinAsignar } from '@menyu/types'

/** Lo que muestra el editor: el mozo de cada mesa, o `''` si está sin asignar. */
export type ValoresDeAsignacion = Record<string, string>

/**
 * El valor inicial del editor: cada mesa de `mesas` con el mozo de `asignaciones` (la precarga al abrir, las del turno
 * al reasignar) o `''`. Solo cuenta un mozo de `mozos`: los que no están (dado de baja, sin cuenta) el backend no los
 * acepta, así que esa mesa arranca sin asignar.
 */
export function asignacionesIniciales(
  mesas: readonly { id: string }[],
  mozos: readonly { id: string }[],
  asignaciones: readonly AsignacionDeMesa[],
): ValoresDeAsignacion {
  const mozosValidos = new Set(mozos.map((m) => m.id))
  const mozoDeLaMesa = new Map(asignaciones.map((a) => [a.mesaId, a.mozoId]))
  const valores: ValoresDeAsignacion = {}
  for (const mesa of mesas) {
    const mozoId = mozoDeLaMesa.get(mesa.id)
    valores[mesa.id] = mozoId !== undefined && mozosValidos.has(mozoId) ? mozoId : ''
  }
  return valores
}

/** La lista que se manda a la API: solo las mesas con mozo. Sin ninguna asignada, `[]`. */
export function asignacionesAEnviar(valores: ValoresDeAsignacion): AsignacionDeMesa[] {
  return Object.entries(valores)
    .filter(([, mozoId]) => mozoId !== '')
    .map(([mesaId, mozoId]) => ({ mesaId, mozoId }))
}

const MOTIVOS: Record<MotivoSinAsignar, string> = {
  'varios-mozos': 'tiene varios mozos en su plantilla; elegí uno.',
  'mozo-inactivo': 'su mozo está dado de baja; elegí otro.',
  'mozo-sin-cuenta': 'su mozo todavía no tiene cuenta; elegí otro.',
}

/** Por qué la precarga dejó una mesa sin asignar, como lo lee el personal. */
export function textoDelAviso(aviso: AvisoDePrecarga): string {
  return `Mesa ${aviso.mesaNumero}: ${MOTIVOS[aviso.motivo]}`
}

/**
 * Las asignaciones del turno que el editor no puede conservar: la mesa ya no está activa o su mozo ya no se puede
 * asignar (dado de baja o sin cuenta). Al reasignar, esas mesas quedan sin asignar; la pantalla lo avisa.
 */
export function asignacionesQueNoSiguen(
  asignaciones: readonly AsignacionDelTurno[],
  mesas: readonly { id: string }[],
  mozos: readonly { id: string }[],
): AsignacionDelTurno[] {
  const mesasValidas = new Set(mesas.map((m) => m.id))
  const mozosValidos = new Set(mozos.map((m) => m.id))
  return asignaciones.filter((a) => !mesasValidas.has(a.mesaId) || !mozosValidos.has(a.mozoId))
}

/** El aviso de una asignación del turno que no sigue al reasignar. */
export function textoDeAsignacionQueNoSigue(asignacion: AsignacionDelTurno): string {
  return `Mesa ${asignacion.mesaNumero}: ${asignacion.mozoNombre} ya no se puede asignar; queda sin asignar.`
}
