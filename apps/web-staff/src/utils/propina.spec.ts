import { parsearPropina, PROPINA_MAXIMA } from './propina'

describe('parsearPropina', () => {
  it.each([
    ['vacía', ''],
    ['solo espacios', '   '],
    ['en 0', '0'],
    ['en 0,00', '0,00'],
    ['en 0.0', '0.0'],
  ])('%s es válida y sin valor: no se manda', (_caso, texto) => {
    expect(parsearPropina(texto)).toEqual({ ok: true })
  })

  it.each([
    ['un entero', '150', 150],
    ['con coma decimal', '150,5', 150.5],
    ['con punto decimal', '150.5', 150.5],
    ['con 2 decimales y coma', '1234,75', 1234.75],
    ['con espacios alrededor', '  20  ', 20],
    ['con ceros a la izquierda', '007', 7],
    ['el tope', '99999999,99', PROPINA_MAXIMA],
  ])('%s es válida', (_caso, texto, valor) => {
    expect(parsearPropina(texto)).toEqual({ ok: true, valor })
  })

  it.each([
    ['negativa', '-5', 'La propina no puede ser negativa'],
    ['negativa con decimales', '-0,5', 'La propina no puede ser negativa'],
    ['con 3 decimales', '10,555', 'La propina admite hasta 2 decimales'],
    ['con 3 decimales y punto', '10.001', 'La propina admite hasta 2 decimales'],
    ['con letras', '10a', 'Escribí la propina solo con números, con coma o punto para los decimales'],
    ['con separador de miles', '1.000,50', 'Escribí la propina solo con números, con coma o punto para los decimales'],
    ['con el signo $', '$100', 'Escribí la propina solo con números, con coma o punto para los decimales'],
    ['sin parte entera', ',5', 'Escribí la propina solo con números, con coma o punto para los decimales'],
    ['con la coma al final', '5,', 'Escribí la propina solo con números, con coma o punto para los decimales'],
    ['con un signo +', '+5', 'Escribí la propina solo con números, con coma o punto para los decimales'],
    ['por encima del tope', '100000000', 'La propina no puede superar $99.999.999,99'],
    ['un centavo por encima del tope', '100000000,00', 'La propina no puede superar $99.999.999,99'],
  ])('%s es inválida, con su mensaje', (_caso, texto, mensaje) => {
    expect(parsearPropina(texto)).toEqual({ ok: false, mensaje })
  })
})
