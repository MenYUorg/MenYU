import type { DiscoveryBusquedaResponse } from '@menyu/types'
import { crearOferta, crearRestaurante } from '../test/fixtures'
import { textoDeResultados } from './textoDeResultados'

const oferta = (id: string) => crearOferta({ id })
const restaurante = (id: string) => crearRestaurante({ id })

const resultados = (parcial: Partial<DiscoveryBusquedaResponse>): DiscoveryBusquedaResponse => ({
  ofertas: [],
  restaurantes: [],
  restaurantesConPlatos: [],
  ...parcial,
})

describe('textoDeResultados', () => {
  it('dice cuántas ofertas y cuántos restaurantes: "2 ofertas y 3 restaurantes"', () => {
    const r = resultados({ ofertas: [oferta('a'), oferta('b')], restaurantes: [restaurante('1'), restaurante('2'), restaurante('3')] })

    expect(textoDeResultados(r, 'pizza')).toBe('2 ofertas y 3 restaurantes')
  })

  it('usa el singular con uno: "1 oferta y 1 restaurante"', () => {
    const r = resultados({ ofertas: [oferta('a')], restaurantes: [restaurante('1')] })

    expect(textoDeResultados(r, 'pizza')).toBe('1 oferta y 1 restaurante')
  })

  it('con solo ofertas o solo restaurantes no nombra lo que no hay', () => {
    expect(textoDeResultados(resultados({ ofertas: [oferta('a'), oferta('b')] }), 'pizza')).toBe('2 ofertas')
    expect(textoDeResultados(resultados({ restaurantes: [restaurante('1')] }), 'pizza')).toBe('1 restaurante')
  })

  it('suma los restaurantes por nombre y los que tienen platos que coinciden (en pantalla se ven igual)', () => {
    const r = resultados({ restaurantes: [restaurante('1')], restaurantesConPlatos: [restaurante('2'), restaurante('3')] })

    expect(textoDeResultados(r, 'pizza')).toBe('3 restaurantes')
  })

  it('sin resultados lo dice con lo que se buscó', () => {
    expect(textoDeResultados(resultados({}), 'xyz')).toBe('No encontramos nada para “xyz”')
  })
})
