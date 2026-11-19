import { describe, expect, it } from 'vitest'
import { formatearFechaHora, formatearFechaHoraCompleta, formatearMonto } from './formato'

describe('formatearMonto', () => {
  it.each([
    [0, '$0'],
    [5000, '$5.000'],
    [1234.5, '$1.234,50'],
    [1500.5, '$1.500,50'],
    [1200.25, '$1.200,25'],
    [0.01, '$0,01'],
    [99_999_999.99, '$99.999.999,99'],
    [10.006, '$10,01'],
    [4.999, '$5'],
    [-50, '-$50'],
    [-1500.5, '-$1.500,50'],
    [-0.01, '-$0,01'],
    [-0.004, '$0'],
    [-0, '$0'],
  ])('formatea %s', (valor, texto) => {
    expect(formatearMonto(valor)).toBe(texto)
  })
})

describe('formatearFechaHora', () => {
  it('muestra día, mes, hora y minutos con dos cifras, en la hora local', () => {
    expect(formatearFechaHora(new Date(2026, 10, 8, 9, 5).toISOString())).toBe('08/11 09:05')
    expect(formatearFechaHora(new Date(2026, 11, 31, 23, 59).toISOString())).toBe('31/12 23:59')
  })
})

describe('formatearFechaHoraCompleta', () => {
  it('muestra el día, el mes, las horas y los minutos con ceros a la izquierda, en la hora local', () => {
    expect(formatearFechaHoraCompleta(new Date(2026, 2, 4, 7, 5).toISOString())).toBe('04/03/2026 07:05')
  })

  it('el último minuto del año queda en ese año', () => {
    expect(formatearFechaHoraCompleta(new Date(2026, 11, 31, 23, 59).toISOString())).toBe('31/12/2026 23:59')
  })

  it('la medianoche es 00:00 del día que empieza, y el 1 de enero es del año nuevo', () => {
    expect(formatearFechaHoraCompleta(new Date(2027, 0, 1, 0, 0).toISOString())).toBe('01/01/2027 00:00')
  })

  it('un año de cuatro cifras sin recortar y el mes 10 sin ceros de más', () => {
    expect(formatearFechaHoraCompleta(new Date(2025, 9, 15, 12, 30).toISOString())).toBe('15/10/2025 12:30')
  })
})
