import { leerNombre, type NombreLeido } from '../abm/nombre'
import { CONFIG_DE_CAJAS, MAXIMO_NOMBRE_DE_CAJA } from './config'

export type { NombreLeido }
export { MAXIMO_NOMBRE_DE_CAJA }

/** El nombre de una caja como se manda (#360): recortado, no vacío y de hasta MAXIMO_NOMBRE_DE_CAJA caracteres. */
export function leerNombreDeCaja(texto: string): NombreLeido {
  return leerNombre(texto, MAXIMO_NOMBRE_DE_CAJA, CONFIG_DE_CAJAS.mensajeNombreVacio)
}
