import type { DiscoveryBusquedaResponse, DiscoveryResponse } from '@menyu/types'
import { api } from '../services/api'
import { crearOferta, crearRestaurante } from '../test/fixtures'
import { cantidadDeCaracteres, reiniciarDiscoveryStore, useDiscoveryStore } from './discoveryStore'

vi.mock('../services/api', () => ({
  api: { discovery: { listar: vi.fn(), buscar: vi.fn() } },
}))

const listar = vi.mocked(api.discovery.listar)
const buscarEnApi = vi.mocked(api.discovery.buscar)
const store = () => useDiscoveryStore.getState()

const LISTADO: DiscoveryResponse = {
  restaurantes: [crearRestaurante({ id: 'a', nombre: 'Alfa' }), crearRestaurante({ id: 'b', nombre: 'Beta' })],
  ofertas: [crearOferta({ id: 'o1' })],
}

const busqueda = (nombre: string): DiscoveryBusquedaResponse => ({
  ofertas: [crearOferta({ id: `o-${nombre}`, nombre })],
  restaurantes: [],
  restaurantesConPlatos: [],
})

/** Una promesa que se resuelve o rechaza cuando el test lo decide (para que las respuestas lleguen fuera de orden). */
function pendiente<T>() {
  let resolver!: (valor: T) => void
  let rechazar!: (error: unknown) => void
  const promesa = new Promise<T>((res, rej) => { resolver = res; rechazar = rej })
  return { promesa, resolver, rechazar }
}

describe('discoveryStore', () => {
  beforeEach(() => {
    reiniciarDiscoveryStore()
    listar.mockReset()
    buscarEnApi.mockReset()
  })

  describe('cargar', () => {
    it('trae los restaurantes y las ofertas', async () => {
      listar.mockResolvedValue(LISTADO)

      await store().cargar()

      expect(store().estado).toBe('listo')
      expect(store().restaurantes.map((r) => r.id)).toEqual(['a', 'b'])
      expect(store().ofertas.map((o) => o.id)).toEqual(['o1'])
    })

    it('mientras llega la primera respuesta está cargando', async () => {
      const { promesa, resolver } = pendiente<DiscoveryResponse>()
      listar.mockReturnValue(promesa)

      const carga = store().cargar()
      expect(store().estado).toBe('cargando')

      resolver(LISTADO)
      await carga
      expect(store().estado).toBe('listo')
    })

    it('si falla y no hay nada de antes, queda en error', async () => {
      listar.mockRejectedValue(new Error('sin conexión'))

      await store().cargar()

      expect(store().estado).toBe('error')
      expect(store().restaurantes).toEqual([])
    })

    it('se puede reintentar después de un error', async () => {
      listar.mockRejectedValueOnce(new Error('sin conexión'))
      await store().cargar()

      listar.mockResolvedValueOnce(LISTADO)
      await store().cargar()

      expect(store().estado).toBe('listo')
      expect(store().restaurantes).toHaveLength(2)
    })

    it('al volver a cargar, lo de antes queda a la vista mientras se actualiza', async () => {
      listar.mockResolvedValueOnce(LISTADO)
      await store().cargar()
      const { promesa, resolver } = pendiente<DiscoveryResponse>()
      listar.mockReturnValueOnce(promesa)

      const carga = store().cargar()

      expect(store().estado).toBe('listo')
      expect(store().restaurantes).toHaveLength(2)

      resolver({ restaurantes: [crearRestaurante({ id: 'c' })], ofertas: [] })
      await carga
      expect(store().restaurantes.map((r) => r.id)).toEqual(['c'])
      expect(store().ofertas).toEqual([])
    })

    it('si la actualización falla, siguen los datos de antes', async () => {
      listar.mockResolvedValueOnce(LISTADO)
      await store().cargar()
      listar.mockRejectedValueOnce(new Error('sin conexión'))

      await store().cargar()

      expect(store().estado).toBe('listo')
      expect(store().restaurantes).toHaveLength(2)
    })

    it('si llegan dos cargas fuera de orden, vale la última pedida', async () => {
      const primera = pendiente<DiscoveryResponse>()
      const segunda = pendiente<DiscoveryResponse>()
      listar.mockReturnValueOnce(primera.promesa).mockReturnValueOnce(segunda.promesa)

      const cargaVieja = store().cargar()
      const cargaNueva = store().cargar()
      segunda.resolver({ restaurantes: [crearRestaurante({ id: 'nueva' })], ofertas: [] })
      await cargaNueva
      primera.resolver(LISTADO)
      await cargaVieja

      expect(store().restaurantes.map((r) => r.id)).toEqual(['nueva'])
    })
  })

  describe('buscar', () => {
    it('busca el texto recortado y guarda los resultados', async () => {
      buscarEnApi.mockResolvedValue(busqueda('café'))

      await store().buscar('  café  ')

      expect(buscarEnApi).toHaveBeenCalledWith('café')
      expect(store().textoBuscado).toBe('café')
      expect(store().estadoBusqueda).toBe('listo')
      expect(store().resultados?.ofertas[0]?.nombre).toBe('café')
    })

    it.each(['', ' ', 'a', '  a  ', '🍕'])('con "%s" (menos de 2 caracteres) no llama al servidor y no hay búsqueda', async (texto) => {
      await store().buscar(texto)

      expect(buscarEnApi).not.toHaveBeenCalled()
      expect(store().estadoBusqueda).toBe('inactiva')
      expect(store().resultados).toBeNull()
    })

    it('dos letras ya buscan, y dos emojis también (se cuentan caracteres, no unidades de UTF-16)', async () => {
      buscarEnApi.mockResolvedValue(busqueda('x'))

      await store().buscar('ca')
      await store().buscar('🍕🍕')

      expect(buscarEnApi).toHaveBeenCalledTimes(2)
    })

    it('mientras llega la respuesta está buscando y los resultados anteriores siguen', async () => {
      buscarEnApi.mockResolvedValueOnce(busqueda('primera'))
      await store().buscar('pr')
      const { promesa, resolver } = pendiente<DiscoveryBusquedaResponse>()
      buscarEnApi.mockReturnValueOnce(promesa)

      const segunda = store().buscar('prim')

      expect(store().estadoBusqueda).toBe('buscando')
      expect(store().textoBuscado).toBe('prim')
      expect(store().resultados?.ofertas[0]?.nombre).toBe('primera')

      resolver(busqueda('segunda'))
      await segunda
      expect(store().estadoBusqueda).toBe('listo')
      expect(store().resultados?.ofertas[0]?.nombre).toBe('segunda')
    })

    it('ignora una respuesta vieja que llega después de una más nueva', async () => {
      const vieja = pendiente<DiscoveryBusquedaResponse>()
      const nueva = pendiente<DiscoveryBusquedaResponse>()
      buscarEnApi.mockReturnValueOnce(vieja.promesa).mockReturnValueOnce(nueva.promesa)

      const busquedaVieja = store().buscar('ca')
      const busquedaNueva = store().buscar('cafe')
      nueva.resolver(busqueda('cafe'))
      await busquedaNueva
      vieja.resolver(busqueda('ca'))
      await busquedaVieja

      expect(store().textoBuscado).toBe('cafe')
      expect(store().resultados?.ofertas[0]?.nombre).toBe('cafe')
    })

    it('un error viejo no pisa los resultados nuevos', async () => {
      const vieja = pendiente<DiscoveryBusquedaResponse>()
      buscarEnApi.mockReturnValueOnce(vieja.promesa).mockResolvedValueOnce(busqueda('cafe'))

      const busquedaVieja = store().buscar('ca')
      await store().buscar('cafe')
      vieja.rechazar(new Error('sin conexión'))
      await busquedaVieja

      expect(store().estadoBusqueda).toBe('listo')
    })

    it('si se borra la búsqueda mientras llega la respuesta, la respuesta se descarta', async () => {
      const { promesa, resolver } = pendiente<DiscoveryBusquedaResponse>()
      buscarEnApi.mockReturnValueOnce(promesa)

      const enCurso = store().buscar('cafe')
      store().limpiarBusqueda()
      resolver(busqueda('cafe'))
      await enCurso

      expect(store().estadoBusqueda).toBe('inactiva')
      expect(store().resultados).toBeNull()
      expect(store().textoBuscado).toBe('')
    })

    it('borrar el texto hasta menos de 2 caracteres también descarta la respuesta en curso', async () => {
      const { promesa, resolver } = pendiente<DiscoveryBusquedaResponse>()
      buscarEnApi.mockReturnValueOnce(promesa)

      const enCurso = store().buscar('cafe')
      await store().buscar('c')
      resolver(busqueda('cafe'))
      await enCurso

      expect(store().resultados).toBeNull()
      expect(store().estadoBusqueda).toBe('inactiva')
    })

    it('limpiarBusqueda borra el texto y los resultados de una búsqueda ya terminada', async () => {
      buscarEnApi.mockResolvedValue(busqueda('cafe'))
      await store().buscar('cafe')
      expect(store().resultados).not.toBeNull()

      store().limpiarBusqueda()

      expect(store().resultados).toBeNull()
      expect(store().textoBuscado).toBe('')
      expect(store().estadoBusqueda).toBe('inactiva')
    })

    it('si falla, queda en error y se puede volver a buscar', async () => {
      buscarEnApi.mockRejectedValueOnce(new Error('sin conexión'))
      await store().buscar('cafe')
      expect(store().estadoBusqueda).toBe('error')

      buscarEnApi.mockResolvedValueOnce(busqueda('cafe'))
      await store().buscar('cafe')

      expect(store().estadoBusqueda).toBe('listo')
    })
  })

  describe('cantidadDeCaracteres', () => {
    it('recorta los espacios y cuenta caracteres', () => {
      expect(cantidadDeCaracteres('  ab ')).toBe(2)
      expect(cantidadDeCaracteres('ñandú')).toBe(5)
      expect(cantidadDeCaracteres('🍕🍕')).toBe(2)
      expect(cantidadDeCaracteres('   ')).toBe(0)
    })
  })
})
