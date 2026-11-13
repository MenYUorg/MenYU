import { textoDePlatos } from './textoDePlatos'

describe('textoDePlatos', () => {
  it.each([
    [12, '12 platos'],
    [2, '2 platos'],
    [1, '1 plato'],
    [0, 'Ningún plato coincide'],
  ])('%s es "%s"', (cantidad, esperado) => {
    expect(textoDePlatos(cantidad)).toBe(esperado)
  })

  it('una cantidad negativa (no debería pasar) también es "Ningún plato coincide"', () => {
    expect(textoDePlatos(-1)).toBe('Ningún plato coincide')
  })
})
