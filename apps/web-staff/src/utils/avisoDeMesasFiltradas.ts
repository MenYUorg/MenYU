import type { CajaAbierta, Rol } from '@menyu/types'

/** El aviso que ve un mozo cuando hay un turno abierto: el backend le filtra las mesas. */
export const TEXTO_DE_MESAS_FILTRADAS = 'Con el turno abierto ves tus mesas y las que no tienen mozo asignado.'

const ROLES_QUE_VEN_TODAS_LAS_MESAS: Rol[] = ['OWNER', 'GERENTE', 'JEFE_SALON']

/**
 * Si hay que avisar que las mesas están filtradas: un MOZO que no sea además OWNER, GERENTE ni JEFE_SALON en el
 * restaurante, y solo con turno abierto (cajas leídas y con al menos una). Con `cajas` en null (no se pudieron leer) no
 * se avisa: es aproximado, el que decide qué mesas ve es el backend.
 */
export function debeAvisarMesasFiltradas(roles: Rol[], cajas: CajaAbierta[] | null): boolean {
  if (cajas === null || cajas.length === 0) return false
  if (!roles.includes('MOZO')) return false
  return !roles.some((rol) => ROLES_QUE_VEN_TODAS_LAS_MESAS.includes(rol))
}
