import { describe, expect, it } from 'vitest'
import { razonDeContraste } from './contraste'

describe('razonDeContraste', () => {
  it('negro sobre blanco es 21 y un color contra sí mismo es 1', () => {
    expect(razonDeContraste('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(razonDeContraste('#CC4A31', '#CC4A31')).toBeCloseTo(1, 5)
  })

  it('no depende del orden ni de las mayúsculas', () => {
    expect(razonDeContraste('#ffffff', '#cc4a31')).toBeCloseTo(razonDeContraste('#CC4A31', '#FFFFFF'), 10)
  })

  it('da los valores que usa el plan: el coral viejo no llega a 4,5 con blanco y el nuevo sí', () => {
    expect(razonDeContraste('#E8563A', '#FFFFFF')).toBeCloseTo(3.61, 2)
    expect(razonDeContraste('#CC4A31', '#FFFFFF')).toBeCloseTo(4.57, 2)
    expect(razonDeContraste('#9CA3AF', '#FFFFFF')).toBeCloseTo(2.54, 2)
    expect(razonDeContraste('#6B7280', '#FFFFFF')).toBeCloseTo(4.83, 2)
  })

  it('un color que no es #RRGGBB es un error (no un contraste inventado)', () => {
    expect(() => razonDeContraste('rojo', '#FFFFFF')).toThrow('Color no válido')
    expect(() => razonDeContraste('#FFF', '#000000')).toThrow('Color no válido')
  })
})
