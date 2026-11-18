import { leerMonto, MONTO_MAXIMO } from './monto'

describe('leerMonto', () => {
  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
  ])('%s es válido y sin valor', (_caso, texto) => {
    expect(leerMonto(texto)).toEqual({ ok: true, valor: null })
  })

  it.each([
    ['cero', '0', 0],
    ['cero con decimales', '0,00', 0],
    ['un entero', '150', 150],
    ['con coma decimal', '150,5', 150.5],
    ['con punto decimal', '150.5', 150.5],
    ['con 2 decimales', '1234,75', 1234.75],
    ['con espacios alrededor', '  20  ', 20],
    ['el tope', '99999999,99', MONTO_MAXIMO],
  ])('%s es válido', (_caso, texto, valor) => {
    expect(leerMonto(texto)).toEqual({ ok: true, valor })
  })

  it.each([
    ['negativo', '-5', 'negativo'],
    ['con 3 decimales', '10,555', 'decimales'],
    ['con letras', '10a', 'formato'],
    ['con separador de miles', '1.000,50', 'formato'],
    ['sin parte entera', ',5', 'formato'],
    ['por encima del tope', '100000000', 'tope'],
  ])('%s es inválido', (_caso, texto, error) => {
    expect(leerMonto(texto)).toEqual({ ok: false, error })
  })

  it('el tope se puede cambiar', () => {
    expect(leerMonto('101', 100)).toEqual({ ok: false, error: 'tope' })
    expect(leerMonto('100', 100)).toEqual({ ok: true, valor: 100 })
  })
})
