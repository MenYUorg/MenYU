import { parsearFondo } from './fondo'

describe('parsearFondo', () => {
  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
  ])('%s es un error: el fondo es obligatorio', (_caso, texto) => {
    expect(parsearFondo(texto)).toEqual({ ok: false, mensaje: 'Ingresá el fondo inicial (0 si no hay)' })
  })

  it.each([
    ['0', 0],
    ['0,00', 0],
  ])('%s es válido y se manda como 0', (texto, valor) => {
    expect(parsearFondo(texto)).toEqual({ ok: true, valor })
  })

  it.each([
    ['un entero', '5000', 5000],
    ['con coma decimal', '5000,5', 5000.5],
    ['con punto decimal', '5000.25', 5000.25],
    ['el tope', '99999999,99', 99_999_999.99],
  ])('%s es válido', (_caso, texto, valor) => {
    expect(parsearFondo(texto)).toEqual({ ok: true, valor })
  })

  it.each([
    ['negativo', '-1', 'El fondo inicial no puede ser negativo'],
    ['con 3 decimales', '1,234', 'El fondo inicial admite hasta 2 decimales'],
    ['con letras', 'mil', 'Escribí el fondo inicial solo con números, con coma o punto para los decimales'],
    ['con separador de miles', '1.000,00', 'Escribí el fondo inicial solo con números, con coma o punto para los decimales'],
    ['por encima del tope', '100000000', 'El fondo inicial no puede superar $99.999.999,99'],
  ])('%s es inválido, con su mensaje', (_caso, texto, mensaje) => {
    expect(parsearFondo(texto)).toEqual({ ok: false, mensaje })
  })
})
