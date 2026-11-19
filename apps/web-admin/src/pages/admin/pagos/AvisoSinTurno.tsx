/**
 * El aviso de la caja cuando no hay un turno abierto (#360): el backend rechaza cualquier cobro hasta que se abra uno, y
 * el turno se abre desde la app del personal (web-staff), no desde acá.
 */
export function AvisoSinTurno() {
  return (
    <div
      role="alert"
      style={{
        background: '#FDF0ED', border: '1px solid #E8563A', borderRadius: 8,
        padding: '10px 14px', marginBottom: 20,
        fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#2D3561',
      }}
    >
      No hay un turno abierto. Mientras no haya uno no se pueden registrar cobros: el turno se abre desde la app del
      personal, en Caja.
    </div>
  )
}
