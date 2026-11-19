import { describe, expect, it } from 'vitest'
import {
  cajaDelCobro,
  leerMonto,
  MENSAJE_OPERACION_SIMULTANEA,
  MENSAJES_DE_TURNO_CAMBIADO,
  MONTO_MAXIMO,
  parsearPropina,
  PROPINA_MAXIMA,
} from './index'

describe('los mensajes del backend que reconoce el cobro', () => {
  it('el 409 de operación simultánea es el de apps/backend/src/caja/conflictos.ts', () => {
    expect(MENSAJE_OPERACION_SIMULTANEA).toBe('Otra operación modificó esto al mismo tiempo; probá de nuevo')
  })

  it('los 400 de cajas que cambiaron son exactamente estos tres, en este orden', () => {
    expect(MENSAJES_DE_TURNO_CAMBIADO).toEqual([
      'No hay un turno abierto',
      'La caja no está abierta en este turno',
      'Hay más de una caja abierta: indicá en cuál se cobra',
    ])
  })
})

describe('@menyu/ui/caja', () => {
  it('exporta las funciones del cobro y los topes de los montos', () => {
    expect(typeof leerMonto).toBe('function')
    expect(typeof parsearPropina).toBe('function')
    expect(typeof cajaDelCobro).toBe('function')
    expect(MONTO_MAXIMO).toBe(99_999_999.99)
    expect(PROPINA_MAXIMA).toBe(99_999_999.99)
  })
})
