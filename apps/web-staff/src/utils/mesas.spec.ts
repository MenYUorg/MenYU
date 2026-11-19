import { ordenarMesas } from './mesas'

const numeros = (mesas: { numero: string }[]) => mesas.map((m) => m.numero)
const mesas = (...lista: string[]) => lista.map((numero, i) => ({ id: `m${i}`, numero }))

describe('ordenarMesas', () => {
  it('ordena los números de forma natural: 2 antes que 10', () => {
    expect(numeros(ordenarMesas(mesas('10', '2', '1', '21', '3')))).toEqual(['1', '2', '3', '10', '21'])
  })

  it('con letras y números, por la letra y después por el número', () => {
    expect(numeros(ordenarMesas(mesas('B1', 'A10', 'A2', '5', 'a1')))).toEqual(['5', 'a1', 'A2', 'A10', 'B1'])
  })

  it('no cambia la lista original y conserva los demás campos', () => {
    const original = mesas('10', '2')

    const ordenadas = ordenarMesas(original)

    expect(numeros(original)).toEqual(['10', '2'])
    expect(ordenadas).toEqual([{ id: 'm1', numero: '2' }, { id: 'm0', numero: '10' }])
  })

  it('una lista vacía queda vacía', () => {
    expect(ordenarMesas([])).toEqual([])
  })
})
