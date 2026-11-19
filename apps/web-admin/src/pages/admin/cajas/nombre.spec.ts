import { leerNombreDeCaja, MAXIMO_NOMBRE_DE_CAJA } from './nombre'

describe('leerNombreDeCaja', () => {
  it('el máximo es el de MAX_NOMBRE_CAJA del backend', () => {
    expect(MAXIMO_NOMBRE_DE_CAJA).toBe(60)
  })

  it.each([
    ['vacío', ''],
    ['solo espacios', '   \n '],
  ])('%s es un error', (_caso, texto) => {
    expect(leerNombreDeCaja(texto)).toEqual({ ok: false, mensaje: 'Escribí el nombre de la caja' })
  })

  it('se manda recortado', () => {
    expect(leerNombreDeCaja('  Caja principal  ')).toEqual({ ok: true, valor: 'Caja principal' })
  })

  it('con tildes y ñ es válido tal cual', () => {
    expect(leerNombreDeCaja('Señoría del salón')).toEqual({ ok: true, valor: 'Señoría del salón' })
  })

  it('60 caracteres es válido, contados después de recortar', () => {
    const nombre = 'a'.repeat(60)

    expect(leerNombreDeCaja(`  ${nombre}  `)).toEqual({ ok: true, valor: nombre })
  })

  it('61 caracteres es un error', () => {
    expect(leerNombreDeCaja('a'.repeat(61))).toEqual({ ok: false, mensaje: 'El nombre admite hasta 60 caracteres' })
  })
})
