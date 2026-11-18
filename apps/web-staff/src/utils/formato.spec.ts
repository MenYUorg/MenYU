import { formatearMonto } from './formato'

describe('formatearMonto', () => {
  it.each([
    [0, '$0'],
    [5000, '$5.000'],
    [1234.5, '$1.234,5'],
    [99_999_999.99, '$99.999.999,99'],
    [10.006, '$10,01'],
  ])('%s se muestra como %s', (valor, texto) => {
    expect(formatearMonto(valor)).toBe(texto)
  })
})
