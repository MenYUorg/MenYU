import { NotFoundException } from '@nestjs/common'
import { FORMA_ID_RESTAURANTE, IdRestaurantePipe } from './id-restaurante.pipe'

describe('IdRestaurantePipe', () => {
  const pipe = new IdRestaurantePipe()

  describe('los ids que pasan, tal cual', () => {
    it.each([
      ['un UUID', '22222222-2222-4222-a222-222222222222'],
      ['un UUID en mayúsculas', '22222222-2222-4222-A222-222222222222'],
      ['un UUID de cualquier versión', '11111111-1111-1111-1111-111111111111'],
      ['un id viejo como r-001', 'r-001'],
      ['guiones bajos y mayúsculas', 'Burger_Lab-2'],
      ['un solo carácter', 'a'],
      ['solo números', '123'],
      ['el máximo, 64 caracteres', 'a'.repeat(64)],
    ])('%s', (_descripcion, id) => {
      expect(pipe.transform(id)).toBe(id)
    })
  })

  describe('los ids que no pueden ser de ningún restaurante: 404 "Restaurante no encontrado"', () => {
    it.each([
      ['vacío', ''],
      ['el carácter nulo', 'ab\u0000c'],
      ['un salto de línea al final', 'r-001\n'],
      ['un espacio', 'r 001'],
      ['comillas y operadores de SQL', "' OR 1=1 --"],
      ['una barra', 'a/b'],
      ['una barra invertida', 'a\\b'],
      ['un punto', 'a.b'],
      ['letras con acento', 'ñandú'],
      ['un emoji', 'r-🍕'],
      ['65 caracteres, uno más del máximo', 'a'.repeat(65)],
      ['un texto larguísimo', 'a'.repeat(5000)],
    ])('%s', (_descripcion, id) => {
      expect(() => pipe.transform(id)).toThrow(NotFoundException)
      expect(() => pipe.transform(id)).toThrow('Restaurante no encontrado')
    })

    it.each([
      ['undefined', undefined],
      ['un número', 123],
      ['null', null],
      ['un arreglo', ['r-001']],
    ])('algo que no es un texto: %s', (_descripcion, valor) => {
      expect(() => pipe.transform(valor as unknown as string)).toThrow(NotFoundException)
    })
  })

  it('la forma que se exige es la que se documenta: de 1 a 64 letras, números, guiones o guiones bajos', () => {
    expect(FORMA_ID_RESTAURANTE.source).toBe('^[A-Za-z0-9_-]{1,64}$')
  })
})
