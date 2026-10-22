import { Aviso } from '../ui/piezas'

const TITULO = 'No pudimos completar la acción.'

/**
 * El error general de un diálogo (el que no tiene un campo propio donde mostrarse). El texto genérico de `mensajeDeEnvio` ya
 * empieza con el título: no se repite.
 */
export function AvisoDeError({ texto }: { texto: string }) {
  if (!texto) return null
  const detalle = texto.startsWith(TITULO) ? texto.slice(TITULO.length).trim() : texto
  return (
    <div style={{ marginBottom: 14 }}>
      <Aviso tipo="err">
        <b>{TITULO}</b> {detalle}
      </Aviso>
    </div>
  )
}
