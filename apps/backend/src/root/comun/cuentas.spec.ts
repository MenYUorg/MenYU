import { NotFoundException } from '@nestjs/common'
import { IdPipe, comoTextoLiteral } from './cuentas'

describe('comoTextoLiteral', () => {
  it.each([
    ['ana@ejemplo.com', 'ana@ejemplo.com'],
    ['juan_perez@ejemplo.com', 'juan\\_perez@ejemplo.com'],
    ['100%@ejemplo.com', '100\\%@ejemplo.com'],
    ['a\\b@ejemplo.com', 'a\\\\b@ejemplo.com'],
    ['_%\\', '\\_\\%\\\\'],
  ])('%s -> %s', (entrada, esperado) => {
    expect(comoTextoLiteral(entrada)).toBe(esperado)
  })
})

describe('IdPipe', () => {
  const pipe = new IdPipe('Marca no encontrada')

  it.each(['m-001', 'r-001', '11111111-1111-4111-a111-111111111111', 'abc_DEF-123', 'a'.repeat(64)])('deja pasar el id %s (no se exige UUID)', (id) => {
    expect(pipe.transform(id)).toBe(id)
  })

  it.each(['', 'a b', 'a/b', '../x', 'a.b', "m'1", 'm\u0000-1', 'a'.repeat(65), 'ñandú'])('responde 404 para %j, sin llegar a la base', (id) => {
    expect(() => pipe.transform(id)).toThrow(new NotFoundException('Marca no encontrada'))
  })

  it('sin mensaje propio, dice "No encontrado"', () => {
    expect(() => new IdPipe().transform('a.b')).toThrow(new NotFoundException('No encontrado'))
  })
})
