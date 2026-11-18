import { ApiError } from '../../../services/api'
import { errorDeCaja, MENSAJE_CAJA_ABIERTA, MENSAJE_NOMBRE_REPETIDO } from './errores'

describe('errorDeCaja', () => {
  it('los textos son los del backend (cajas.service.ts)', () => {
    expect(MENSAJE_NOMBRE_REPETIDO).toBe('Ya hay una caja con ese nombre en este restaurante')
    expect(MENSAJE_CAJA_ABIERTA).toBe('No se puede desactivar una caja con el turno abierto')
  })

  it('el 409 de nombre repetido va junto al campo del nombre, sin releer', () => {
    expect(errorDeCaja(new ApiError(409, MENSAJE_NOMBRE_REPETIDO), 'x')).toEqual({ mensaje: MENSAJE_NOMBRE_REPETIDO, delNombre: true, releer: false })
  })

  it('el 409 de caja abierta es de la fila y hace releer la lista', () => {
    expect(errorDeCaja(new ApiError(409, MENSAJE_CAJA_ABIERTA), 'x')).toEqual({ mensaje: MENSAJE_CAJA_ABIERTA, delNombre: false, releer: true })
  })

  it('un 404 dice "Caja no encontrada" y hace releer la lista', () => {
    expect(errorDeCaja(new ApiError(404, 'Not Found'), 'x')).toEqual({ mensaje: 'Caja no encontrada', delNombre: false, releer: true })
  })

  it('el 409 de operación simultánea es un error común, que se puede reintentar', () => {
    const mensaje = 'Otra operación modificó esto al mismo tiempo; probá de nuevo'

    expect(errorDeCaja(new ApiError(409, mensaje), 'x')).toEqual({ mensaje, delNombre: false, releer: false })
  })

  it('el texto de nombre repetido con otro status no es del campo', () => {
    expect(errorDeCaja(new ApiError(400, MENSAJE_NOMBRE_REPETIDO), 'x').delNombre).toBe(false)
    expect(errorDeCaja(new ApiError(400, MENSAJE_CAJA_ABIERTA), 'x').releer).toBe(false)
  })

  it('un error del servidor sin texto, o sin respuesta, usa el texto por defecto', () => {
    expect(errorDeCaja(new ApiError(500, ''), 'No se pudo guardar')).toEqual({ mensaje: 'No se pudo guardar', delNombre: false, releer: false })
    expect(errorDeCaja(new TypeError('Failed to fetch'), 'No se pudo guardar')).toEqual({ mensaje: 'No se pudo guardar', delNombre: false, releer: false })
  })
})
