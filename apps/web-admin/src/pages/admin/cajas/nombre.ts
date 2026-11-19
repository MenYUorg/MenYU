/**
 * El largo máximo del nombre de una caja: `MAX_NOMBRE_CAJA` de apps/backend/src/caja/dto/crear-caja.dto.ts. El backend
 * lo cuenta con `isLength` de validator, que resta los pares sustitutos (un emoji cuenta uno); acá se cuenta con
 * `.length` (unidades UTF-16), que es igual o más estricto: la pantalla nunca acepta un nombre que el backend rechace.
 */
export const MAXIMO_NOMBRE_DE_CAJA = 60

export type NombreLeido = { ok: true; valor: string } | { ok: false; mensaje: string }

/** El nombre de una caja como se manda (#360): recortado, no vacío y de hasta MAXIMO_NOMBRE_DE_CAJA caracteres. */
export function leerNombreDeCaja(texto: string): NombreLeido {
  const nombre = texto.trim()
  if (nombre === '') return { ok: false, mensaje: 'Escribí el nombre de la caja' }
  if (nombre.length > MAXIMO_NOMBRE_DE_CAJA) {
    return { ok: false, mensaje: `El nombre admite hasta ${MAXIMO_NOMBRE_DE_CAJA} caracteres` }
  }
  return { ok: true, valor: nombre }
}
