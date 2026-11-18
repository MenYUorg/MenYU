import { MOTIVO_MAXIMO, parsearMontoDeMovimiento, parsearMotivo } from './movimiento'

describe('parsearMontoDeMovimiento', () => {
  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
  ])('%s es un error: el monto es obligatorio', (_caso, texto) => {
    expect(parsearMontoDeMovimiento(texto)).toEqual({ ok: false, mensaje: 'Ingresá el monto' })
  })

  it.each([['0'], ['0,00'], ['0.0']])('%s es un error: tiene que ser mayor a 0', (texto) => {
    expect(parsearMontoDeMovimiento(texto)).toEqual({ ok: false, mensaje: 'El monto tiene que ser mayor a 0' })
  })

  it.each([
    ['el mínimo', '0,01', 0.01],
    ['un entero', '1500', 1500],
    ['con coma decimal', '1500,5', 1500.5],
    ['con punto decimal', '1500.25', 1500.25],
    ['con espacios a los costados', ' 20 ', 20],
    ['el tope', '99999999,99', 99_999_999.99],
  ])('%s es válido', (_caso, texto, valor) => {
    expect(parsearMontoDeMovimiento(texto)).toEqual({ ok: true, valor })
  })

  it.each([
    ['negativo', '-1', 'El monto no puede ser negativo'],
    ['con 3 decimales', '1,234', 'El monto admite hasta 2 decimales'],
    ['con letras', 'mil', 'Escribí el monto solo con números, con coma o punto para los decimales'],
    ['con separador de miles', '1.000,00', 'Escribí el monto solo con números, con coma o punto para los decimales'],
    ['por encima del tope', '100000000', 'El monto no puede superar $99.999.999,99'],
  ])('%s es inválido, con su mensaje', (_caso, texto, mensaje) => {
    expect(parsearMontoDeMovimiento(texto)).toEqual({ ok: false, mensaje })
  })
})

describe('parsearMotivo', () => {
  it('es el de MAX_MOTIVO_MOVIMIENTO del backend', () => {
    expect(MOTIVO_MAXIMO).toBe(200)
  })

  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
  ])('%s es un error: el motivo es obligatorio', (_caso, texto) => {
    expect(parsearMotivo(texto)).toEqual({ ok: false, mensaje: 'Escribí el motivo' })
  })

  it('se manda recortado', () => {
    expect(parsearMotivo('  Compra de hielo \n')).toEqual({ ok: true, valor: 'Compra de hielo' })
  })

  it('200 caracteres es válido, contados después de recortar', () => {
    const motivo = 'a'.repeat(200)

    expect(parsearMotivo(`  ${motivo}  `)).toEqual({ ok: true, valor: motivo })
  })

  it('201 caracteres es un error', () => {
    expect(parsearMotivo('a'.repeat(201))).toEqual({ ok: false, mensaje: 'El motivo admite hasta 200 caracteres' })
  })
})
