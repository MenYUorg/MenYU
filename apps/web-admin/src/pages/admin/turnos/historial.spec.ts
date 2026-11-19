import type { FilaDeArqueo } from '@menyu/types'
import { diferenciasDelArqueo, textoDeMovimientos } from './historial'

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
