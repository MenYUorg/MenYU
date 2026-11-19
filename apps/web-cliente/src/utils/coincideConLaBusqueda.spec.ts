import { describe, expect, it } from 'vitest'
import { coincideConLaBusqueda } from './coincideConLaBusqueda'

describe('coincideConLaBusqueda', () => {
  it('una búsqueda vacía o de solo espacios deja pasar todo', () => {
    expect(coincideConLaBusqueda('Milanesa napolitana', '')).toBe(true)
    expect(coincideConLaBusqueda('Milanesa napolitana', '   ')).toBe(true)
  })

  it('una palabra es el comienzo de alguna palabra del nombre, sin importar mayúsculas', () => {
    expect(coincideConLaBusqueda('Milanesa napolitana', 'mil')).toBe(true)
    expect(coincideConLaBusqueda('Milanesa napolitana', 'NAPO')).toBe(true)
    expect(coincideConLaBusqueda('Milanesa napolitana', 'lanesa')).toBe(false)
  })

  it('con más de una palabra, cada una tiene que estar al comienzo de alguna palabra del nombre', () => {
    expect(coincideConLaBusqueda('Plato 1', 'plato 1')).toBe(true)
    expect(coincideConLaBusqueda('Milanesa napolitana', 'milanesa napolitana')).toBe(true)
    expect(coincideConLaBusqueda('Milanesa napolitana', 'mil napo')).toBe(true)
    expect(coincideConLaBusqueda('Milanesa napolitana', 'milanesa fugazzeta')).toBe(false)
  })

  it('las palabras pueden ir en otro orden y los espacios de más no importan', () => {
    expect(coincideConLaBusqueda('Milanesa napolitana', 'napolitana milanesa')).toBe(true)
    expect(coincideConLaBusqueda('Milanesa napolitana', '  milanesa    napo  ')).toBe(true)
  })

  it('un número es el comienzo de un número: "1" encuentra "Plato 10"', () => {
    expect(coincideConLaBusqueda('Plato 10', 'plato 1')).toBe(true)
    expect(coincideConLaBusqueda('Plato 2', 'plato 1')).toBe(false)
  })
})
