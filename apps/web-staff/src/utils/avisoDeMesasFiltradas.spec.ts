import type { CajaAbierta, Rol } from '@menyu/types'
import { debeAvisarMesasFiltradas, TEXTO_DE_MESAS_FILTRADAS } from './avisoDeMesasFiltradas'

const CAJAS: CajaAbierta[] = [{ cajaId: 'caja-1', nombre: 'Caja 1' }]

describe('debeAvisarMesasFiltradas', () => {
  it('el texto es el acordado', () => {
    expect(TEXTO_DE_MESAS_FILTRADAS).toBe('Con el turno abierto ves tus mesas y las que no tienen mozo asignado.')
  })

  it('un MOZO solo, con turno abierto: avisa', () => {
    expect(debeAvisarMesasFiltradas(['MOZO'], CAJAS)).toBe(true)
  })

  it.each<Rol>(['OWNER', 'GERENTE', 'JEFE_SALON', 'COCINA'])('%s solo: no avisa', (rol) => {
    expect(debeAvisarMesasFiltradas([rol], CAJAS)).toBe(false)
  })

  it.each<Rol>(['OWNER', 'GERENTE', 'JEFE_SALON'])('MOZO y %s a la vez: no avisa, ve todas las mesas', (otro) => {
    expect(debeAvisarMesasFiltradas(['MOZO', otro], CAJAS)).toBe(false)
    expect(debeAvisarMesasFiltradas([otro, 'MOZO'], CAJAS)).toBe(false)
  })

  it('MOZO y COCINA: avisa, cocina no ve más mesas', () => {
    expect(debeAvisarMesasFiltradas(['MOZO', 'COCINA'], CAJAS)).toBe(true)
  })

  it('sin roles: no avisa', () => {
    expect(debeAvisarMesasFiltradas([], CAJAS)).toBe(false)
  })

  it('con las cajas en null (no se pudieron leer) no avisa', () => {
    expect(debeAvisarMesasFiltradas(['MOZO'], null)).toBe(false)
  })

  it('sin turno abierto ([]) no avisa', () => {
    expect(debeAvisarMesasFiltradas(['MOZO'], [])).toBe(false)
  })

  it('con dos cajas abiertas avisa igual', () => {
    expect(debeAvisarMesasFiltradas(['MOZO'], [...CAJAS, { cajaId: 'caja-2', nombre: 'Caja 2' }])).toBe(true)
  })
})
