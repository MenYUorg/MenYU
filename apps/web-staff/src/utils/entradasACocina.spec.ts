import { MAXIMO_DE_ENTRADAS_RECORDADAS, marcarEntrada, sembrarEntradas } from './entradasACocina'

describe('marcarEntrada', () => {
  it('la primera vez devuelve true y la segunda false', () => {
    const vistos = new Set<string>()
    expect(marcarEntrada(vistos, 'a')).toBe(true)
    expect(marcarEntrada(vistos, 'a')).toBe(false)
    expect(vistos.has('a')).toBe(true)
    expect(vistos.size).toBe(1)
  })

  it('ids distintos son independientes', () => {
    const vistos = new Set<string>()
    expect(marcarEntrada(vistos, 'a')).toBe(true)
    expect(marcarEntrada(vistos, 'b')).toBe(true)
    expect(marcarEntrada(vistos, 'a')).toBe(false)
    expect(marcarEntrada(vistos, 'b')).toBe(false)
    expect(vistos.size).toBe(2)
  })

  it('un id repetido no cambia el orden: el orden es de primera inserción', () => {
    const vistos = new Set<string>()
    marcarEntrada(vistos, 'a', 3)
    marcarEntrada(vistos, 'b', 3)
    marcarEntrada(vistos, 'c', 3)
    expect(marcarEntrada(vistos, 'a', 3)).toBe(false)
    expect([...vistos]).toEqual(['a', 'b', 'c'])
    expect(marcarEntrada(vistos, 'd', 3)).toBe(true)
    expect([...vistos]).toEqual(['b', 'c', 'd'])
  })

  it('al pasarse del máximo descarta el más viejo, y ese id vuelve a parecer nuevo', () => {
    const vistos = new Set<string>()
    for (const id of ['a', 'b', 'c', 'd']) marcarEntrada(vistos, id, 3)
    expect(vistos.has('a')).toBe(false)
    expect([...vistos]).toEqual(['b', 'c', 'd'])
    // a vuelve como nuevo y, al entrar, descarta a b (ahora el más viejo)
    expect(marcarEntrada(vistos, 'a', 3)).toBe(true)
    expect(vistos.has('b')).toBe(false)
    expect([...vistos]).toEqual(['c', 'd', 'a'])
  })

  it('nunca supera el máximo', () => {
    const vistos = new Set<string>()
    for (let i = 0; i < 20; i++) {
      marcarEntrada(vistos, `p${i}`, 5)
      expect(vistos.size).toBeLessThanOrEqual(5)
    }
    expect(vistos.size).toBe(5)
    expect([...vistos]).toEqual(['p15', 'p16', 'p17', 'p18', 'p19'])
  })

  it('el máximo por defecto es 1000', () => {
    expect(MAXIMO_DE_ENTRADAS_RECORDADAS).toBe(1000)
    const vistos = new Set<string>()
    for (let i = 0; i <= 1000; i++) marcarEntrada(vistos, `p${i}`)
    expect(vistos.size).toBe(1000)
    expect(vistos.has('p0')).toBe(false)
    expect(vistos.has('p1')).toBe(true)
    expect(vistos.has('p1000')).toBe(true)
  })

  it('no toca otro Set', () => {
    const vistos = new Set<string>()
    const otro = new Set<string>(['x'])
    marcarEntrada(vistos, 'a')
    expect([...otro]).toEqual(['x'])
    expect(marcarEntrada(otro, 'a')).toBe(true)
  })
})

describe('sembrarEntradas', () => {
  it('deja marcados los ids: marcar uno después devuelve false', () => {
    const vistos = new Set<string>()
    sembrarEntradas(vistos, ['a', 'b'])
    expect(marcarEntrada(vistos, 'a')).toBe(false)
    expect(marcarEntrada(vistos, 'b')).toBe(false)
    expect(marcarEntrada(vistos, 'c')).toBe(true)
  })

  it('respeta el máximo', () => {
    const vistos = new Set<string>()
    sembrarEntradas(vistos, ['a', 'b', 'c', 'd'], 3)
    expect([...vistos]).toEqual(['b', 'c', 'd'])
  })

  it('con una lista vacía no hace nada', () => {
    const vistos = new Set<string>(['a'])
    sembrarEntradas(vistos, [])
    expect([...vistos]).toEqual(['a'])
  })
})
