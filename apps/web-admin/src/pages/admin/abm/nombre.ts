export type NombreLeido = { ok: true; valor: string } | { ok: false; mensaje: string }

/**
 * El nombre de un ítem como se manda: recortado, no vacío y de hasta `maximo` caracteres. Se cuenta con `.length`
 * (unidades UTF-16), que es igual o más estricto que el `isLength` del backend: la pantalla nunca acepta un nombre que
 * el backend rechace.
 */
export function leerNombre(texto: string, maximo: number, mensajeVacio: string): NombreLeido {
  const nombre = texto.trim()
  if (nombre === '') return { ok: false, mensaje: mensajeVacio }
  if (nombre.length > maximo) {
    return { ok: false, mensaje: `El nombre admite hasta ${maximo} caracteres` }
  }
  return { ok: true, valor: nombre }
}
