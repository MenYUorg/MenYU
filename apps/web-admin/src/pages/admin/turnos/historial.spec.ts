import type { AsignacionDelTurno, FilaDeArqueo, MovimientoDeCaja, TipoDeMovimiento } from '@menyu/types'
import { diferenciasDelArqueo, mensajeDeError, mesasPorMozo, textoDeMovimientos, totalesDeMovimientos } from './historial'

const fila = (metodo: FilaDeArqueo['metodo'], diferencia: number): FilaDeArqueo => ({ metodo, esperado: 1000, declarado: 1000 + diferencia, diferencia })

describe('diferenciasDelArqueo', () => {
  it('dice cada diferencia con palabras, en el orden del backend, y deja afuera las que son cero', () => {
    const arqueo = [fila('efectivo', -500), fila('debito', 0), fila('credito', 120.5), fila('transferencia', -0.01)]

    expect(diferenciasDelArqueo(arqueo)).toEqual(['Efectivo: Faltan $500', 'Crédito: Sobran $120,50', 'Transferencia: Faltan $0,01'])
  })

  it('una diferencia de menos de medio centavo cuenta como cero', () => {
    expect(diferenciasDelArqueo([fila('efectivo', 0.004), fila('debito', -0.004)])).toEqual([])
  })

  it('sin diferencias (o sin filas) no hay nada que decir', () => {
    expect(diferenciasDelArqueo([fila('efectivo', 0), fila('debito', 0), fila('credito', 0), fila('transferencia', 0)])).toEqual([])
    expect(diferenciasDelArqueo([])).toEqual([])
  })
})

describe('textoDeMovimientos', () => {
  it.each([
    [{ cantidad: 0, ingresos: 0, egresos: 0 }, 'Sin movimientos'],
    [{ cantidad: 1, ingresos: 0, egresos: 250 }, '1 movimiento: ingresos $0, egresos $250'],
    [{ cantidad: 3, ingresos: 1500.5, egresos: 200 }, '3 movimientos: ingresos $1.500,50, egresos $200'],
  ])('%o se dice "%s"', (totales, texto) => {
    expect(textoDeMovimientos(totales)).toBe(texto)
  })
})

describe('totalesDeMovimientos', () => {
  const movimiento = (tipo: TipoDeMovimiento, monto: number): MovimientoDeCaja => ({
    id: `m-${tipo}-${monto}`, cajaId: 'c-barra', cajaNombre: 'Barra', tipo, monto, motivo: 'x', usuario: { id: 'u', nombre: 'Ana' }, createdAt: '2026-11-18T12:00:00.000Z',
  })

  it('suma los ingresos y los egresos por separado', () => {
    expect(totalesDeMovimientos([movimiento('INGRESO', 1000), movimiento('EGRESO', 250), movimiento('INGRESO', 500.5)])).toEqual({ ingresos: 1500.5, egresos: 250 })
  })

  it('suma en centavos: 0,10 + 0,20 son exactamente 0,30, y lo mismo con los egresos', () => {
    const totales = totalesDeMovimientos([movimiento('INGRESO', 0.1), movimiento('INGRESO', 0.2), movimiento('EGRESO', 0.1), movimiento('EGRESO', 0.2)])

    expect(totales.ingresos).toBe(0.3)
    expect(totales.egresos).toBe(0.3)
  })

  it('sin movimientos, los dos son cero', () => {
    expect(totalesDeMovimientos([])).toEqual({ ingresos: 0, egresos: 0 })
  })
})

describe('mesasPorMozo', () => {
  const asignacion = (mozoId: string, mozoNombre: string, mesaNumero: string): AsignacionDelTurno => ({ mesaId: `mesa-${mesaNumero}`, mesaNumero, mozoId, mozoNombre })

  it('agrupa por mozo, ordena los mozos por nombre (sin distinguir mayúsculas ni acentos) y sus mesas en orden natural', () => {
    const asignaciones = [
      asignacion('m-zoe', 'Zoe', '10'),
      asignacion('m-angel', 'Ángel', '3'),
      asignacion('m-zoe', 'Zoe', '2'),
      asignacion('m-bea', 'bea', '1'),
      asignacion('m-zoe', 'Zoe', 'A1'),
    ]

    expect(mesasPorMozo(asignaciones)).toEqual([
      { mozoId: 'm-angel', mozoNombre: 'Ángel', mesas: ['3'] },
      { mozoId: 'm-bea', mozoNombre: 'bea', mesas: ['1'] },
      { mozoId: 'm-zoe', mozoNombre: 'Zoe', mesas: ['2', '10', 'A1'] },
    ])
  })

  it('dos mozos con el mismo nombre son grupos distintos', () => {
    expect(mesasPorMozo([asignacion('m-1', 'Ana', '1'), asignacion('m-2', 'Ana', '2')]).map((g) => g.mozoId)).toEqual(['m-1', 'm-2'])
  })

  it('sin asignaciones no hay grupos', () => {
    expect(mesasPorMozo([])).toEqual([])
  })
})

describe('mensajeDeError', () => {
  it.each([
    ['un Error con mensaje', new Error('Turno no encontrado'), 'Turno no encontrado'],
    ['un Error sin mensaje', new Error(''), 'No se pudo'],
    ['algo que no es un Error', 'se cortó', 'No se pudo'],
  ])('%s', (_caso, error, mensaje) => {
    expect(mensajeDeError(error, 'No se pudo')).toBe(mensaje)
  })
})
