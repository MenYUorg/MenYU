import { formatearFechaHora, formatearMonto } from './formato'

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
  ])('%s se muestra como %s', (valor, texto) => {
    expect(formatearMonto(valor)).toBe(texto)
  })
})

describe('formatearFechaHora', () => {
  it('muestra día, mes, hora y minutos con dos cifras, en la hora local', () => {
    expect(formatearFechaHora(new Date(2026, 10, 8, 9, 5).toISOString())).toBe('08/11 09:05')
    expect(formatearFechaHora(new Date(2026, 11, 31, 23, 59).toISOString())).toBe('31/12 23:59')
  })
})
