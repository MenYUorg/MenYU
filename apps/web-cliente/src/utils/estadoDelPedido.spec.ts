import { describe, expect, it } from 'vitest'
import { anuncioDelCambioDeEstado, estadoEnUnaFrase, platosDelPedido, TEXTO_DEL_ESTADO } from './estadoDelPedido'

const plato = (nombre: string) => ({ item: { nombre } })

describe('TEXTO_DEL_ESTADO', () => {
  it('cada estado del backend tiene su texto, y "listo" no se confunde con "en preparación"', () => {
    expect(TEXTO_DEL_ESTADO).toEqual({
      pendiente: 'Enviado a cocina',
      en_preparacion: 'En preparación',
      listo: 'Listo para servir',
      entregado: 'Entregado',
      anulado: 'Cancelado',
    })
  })
})

describe('estadoEnUnaFrase', () => {
  it('es el mismo texto, en minúscula para ir en medio de una frase', () => {
    expect(estadoEnUnaFrase('pendiente')).toBe('enviado a cocina')
    expect(estadoEnUnaFrase('listo')).toBe('listo para servir')
    expect(estadoEnUnaFrase('anulado')).toBe('cancelado')
  })
})

describe('platosDelPedido', () => {
  it.each([
    [[], ''],
    [[plato('Hamburguesa')], 'Hamburguesa'],
    [[plato('Hamburguesa'), plato('Agua')], 'Hamburguesa y Agua'],
    [[plato('Hamburguesa'), plato('Agua'), plato('Flan')], 'Hamburguesa y 2 más'],
    [[plato('Hamburguesa'), plato('Agua'), plato('Flan'), plato('Café')], 'Hamburguesa y 3 más'],
  ])('%j → "%s"', (items, esperado) => {
    expect(platosDelPedido(items)).toBe(esperado)
  })
})

describe('anuncioDelCambioDeEstado', () => {
  it('"Tu pedido de {plato} está {estado}"', () => {
    expect(anuncioDelCambioDeEstado([plato('Hamburguesa doble')], 'listo')).toBe('Tu pedido de Hamburguesa doble está listo para servir')
    expect(anuncioDelCambioDeEstado([plato('Milanesa'), plato('Agua')], 'en_preparacion')).toBe('Tu pedido de Milanesa y Agua está en preparación')
  })

  it('un pedido sin platos (no debería pasar) es "Tu pedido" a secas', () => {
    expect(anuncioDelCambioDeEstado([], 'entregado')).toBe('Tu pedido está entregado')
  })
})
