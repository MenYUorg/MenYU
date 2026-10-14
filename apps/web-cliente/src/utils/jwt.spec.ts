import { crearTokenJwt } from '../test/fixtures'
import { decodificarPayloadJwt } from './jwt'

describe('decodificarPayloadJwt', () => {
  it('devuelve el contenido del token', () => {
    expect(decodificarPayloadJwt(crearTokenJwt({ sub: 'cli-1', tipo: 'cliente' }))).toEqual({ sub: 'cli-1', tipo: 'cliente' })
  })

  it('conserva los acentos y la Ñ (el contenido es UTF-8)', () => {
    expect(decodificarPayloadJwt(crearTokenJwt({ nombre: 'Marina González Ñandú' }))).toEqual({ nombre: 'Marina González Ñandú' })
  })

  it('conserva los emojis', () => {
    expect(decodificarPayloadJwt(crearTokenJwt({ nombre: 'Lucía 🍕' }))).toEqual({ nombre: 'Lucía 🍕' })
  })

  it.each([
    ['vacío', ''],
    ['sin contenido', 'solo-un-tramo'],
    ['con el contenido roto', 'a.%%%.c'],
    ['con un contenido que no es JSON', `a.${btoa('hola')}.c`],
    ['con un contenido que es un número', `a.${btoa('42')}.c`],
    ['con un contenido nulo', `a.${btoa('null')}.c`],
  ])('un token %s devuelve null', (_descripcion, token) => {
    expect(decodificarPayloadJwt(token)).toBeNull()
  })
})
