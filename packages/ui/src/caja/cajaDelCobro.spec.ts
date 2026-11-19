import { describe, expect, it } from 'vitest'
import { cajaDelCobro } from './cajaDelCobro'

const PRINCIPAL = { cajaId: 'caja-1', nombre: 'Principal' }
const BARRA = { cajaId: 'caja-2', nombre: 'Barra' }

describe('cajaDelCobro', () => {
  it('sin poder leer las cajas (null): no bloquea, no hay selector ni cajaId', () => {
    expect(cajaDelCobro(null, null)).toEqual({ sinTurno: false, mostrarSelector: false, falta: false })
    expect(cajaDelCobro(null, 'caja-1')).toEqual({ sinTurno: false, mostrarSelector: false, falta: false })
  })

  it('sin turno abierto ([]): no se puede cobrar', () => {
    expect(cajaDelCobro([], null)).toEqual({ sinTurno: true, mostrarSelector: false, falta: false })
  })

  it('con una caja: sin selector ni cajaId, aunque haya una elegida', () => {
    expect(cajaDelCobro([PRINCIPAL], null)).toEqual({ sinTurno: false, mostrarSelector: false, falta: false })
    expect(cajaDelCobro([PRINCIPAL], 'caja-1')).toEqual({ sinTurno: false, mostrarSelector: false, falta: false })
  })

  it('con dos cajas y una elegida abierta: selector y su cajaId', () => {
    expect(cajaDelCobro([BARRA, PRINCIPAL], 'caja-1')).toEqual({ sinTurno: false, mostrarSelector: true, cajaId: 'caja-1', falta: false })
  })

  it('con dos cajas y ninguna elegida: falta elegir', () => {
    expect(cajaDelCobro([BARRA, PRINCIPAL], null)).toEqual({ sinTurno: false, mostrarSelector: true, falta: true })
  })

  it('con dos cajas y una elegida que ya no está abierta: falta elegir, y no se manda', () => {
    expect(cajaDelCobro([BARRA, PRINCIPAL], 'caja-cerrada')).toEqual({ sinTurno: false, mostrarSelector: true, falta: true })
  })
})
