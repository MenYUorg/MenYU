import type { PerfilUsuario } from '@menyu/types'
import {
  membresiaDeMarca,
  membresiaDeRestaurante,
  perfilDePrueba,
} from '../test/authClient'
import { preferenciaDeLaUrl, rolEnElRestaurante, useContextStore } from './contextStore'

vi.mock('@menyu/auth-client', async () => (await import('../test/authClient')).moduloSimulado())

vi.mock('../services/api', () => ({
  api: {
    marcas: { list: vi.fn() },
    restaurantes: { list: vi.fn() },
  },
}))

const RESTAURANTE_KEY = 'menyu-admin-restaurante-id'

const MARCA_X = {
  id: 'marca-1',
  nombre: 'Marca X',
  slug: 'marca-x',
  logoUrl: null,
  activo: true,
  createdAt: '2024-01-01',
}
const MARCA_Y = { ...MARCA_X, id: 'marca-2', nombre: 'Marca Y', slug: 'marca-y' }

const RESTAURANTE_BASE = {
  marcaId: 'marca-1',
  direccion: null,
  logoUrl: null,
  modoSesion: 'abierto',
  activo: true,
  createdAt: '2024-01-01',
  nombreSeccionRecomendados: 'Recomendaciones del chef',
  marca: MARCA_X,
}

const RESTAURANTE_A = { ...RESTAURANTE_BASE, id: 'rest-1', nombre: 'Resto A' }
const RESTAURANTE_B = { ...RESTAURANTE_BASE, id: 'rest-2', nombre: 'Resto B' }
const RESTAURANTE_C = { ...RESTAURANTE_BASE, id: 'rest-3', nombre: 'Resto C', marcaId: 'marca-2', marca: MARCA_Y }

const OWNER: PerfilUsuario = perfilDePrueba({ membresias: [membresiaDeMarca('marca-1')] })
const GERENTE: PerfilUsuario = perfilDePrueba({ membresias: [membresiaDeRestaurante('GERENTE', 'rest-1')] })

async function apiFalsa() {
  const { api } = await import('../services/api')
  return { marcas: vi.mocked(api.marcas.list), restaurantes: vi.mocked(api.restaurantes.list) }
}

describe('contextStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useContextStore.setState({
      marcas: [],
      restaurantes: [],
      selectedMarcaId: null,
      selectedRestauranteId: null,
      perfil: null,
    })
    vi.clearAllMocks()
  })

  describe('loadContext con un perfil de GERENTE', () => {
    it('solo pide los restaurantes: GET /marcas es del OWNER y al GERENTE le da 403', async () => {
      const api = await apiFalsa()
      api.restaurantes.mockResolvedValue([RESTAURANTE_A])

      await useContextStore.getState().loadContext(GERENTE)

      expect(api.restaurantes).toHaveBeenCalled()
      expect(api.marcas).not.toHaveBeenCalled()
      // Su marca sale del restaurante, que ya la trae.
      expect(useContextStore.getState().marcas).toEqual([MARCA_X])
      expect(useContextStore.getState().selectedMarcaId).toBe('marca-1')
    })

    it('elige el primero si no hay nada guardado, y respeta lo guardado si sigue en la lista', async () => {
      const api = await apiFalsa()
      api.restaurantes.mockResolvedValue([RESTAURANTE_A, RESTAURANTE_B])

      await useContextStore.getState().loadContext(GERENTE)
      expect(useContextStore.getState().selectedRestauranteId).toBe('rest-1')

      localStorage.setItem(RESTAURANTE_KEY, 'rest-2')
      useContextStore.setState({ selectedRestauranteId: null })
      await useContextStore.getState().loadContext(GERENTE)
      expect(useContextStore.getState().selectedRestauranteId).toBe('rest-2')
    })

    it('un restaurante guardado que ya no está en la lista se descarta', async () => {
      const api = await apiFalsa()
      localStorage.setItem(RESTAURANTE_KEY, 'rest-borrado')
      api.restaurantes.mockResolvedValue([RESTAURANTE_B])

      await useContextStore.getState().loadContext(GERENTE)

      expect(useContextStore.getState().selectedRestauranteId).toBe('rest-2')
    })
  })

  describe('loadContext con un perfil de OWNER', () => {
    it('pide marcas y restaurantes a la vez y los guarda', async () => {
      const api = await apiFalsa()
      api.marcas.mockResolvedValue([MARCA_X])
      api.restaurantes.mockResolvedValue([RESTAURANTE_A, RESTAURANTE_B])

      await useContextStore.getState().loadContext(OWNER)

      expect(api.marcas).toHaveBeenCalled()
      expect(api.restaurantes).toHaveBeenCalled()
      expect(useContextStore.getState().marcas).toEqual([MARCA_X])
      expect(useContextStore.getState().restaurantes).toHaveLength(2)
    })

    it('la marca elegida es la del restaurante elegido', async () => {
      const api = await apiFalsa()
      api.marcas.mockResolvedValue([MARCA_X, MARCA_Y])
      api.restaurantes.mockResolvedValue([RESTAURANTE_C, RESTAURANTE_A])

      await useContextStore.getState().loadContext(OWNER)

      expect(useContextStore.getState().selectedRestauranteId).toBe('rest-3')
      expect(useContextStore.getState().selectedMarcaId).toBe('marca-2')
    })

    it('sin restaurantes queda la primera marca y nada elegido', async () => {
      const api = await apiFalsa()
      api.marcas.mockResolvedValue([MARCA_X])
      api.restaurantes.mockResolvedValue([])

      await useContextStore.getState().loadContext(OWNER)

      expect(useContextStore.getState().selectedRestauranteId).toBeNull()
      expect(useContextStore.getState().selectedMarcaId).toBe('marca-1')
    })

    it('si la API falla, el contexto queda como estaba y no rompe', async () => {
      const api = await apiFalsa()
      api.marcas.mockRejectedValue(new Error('403'))
      api.restaurantes.mockRejectedValue(new Error('403'))

      await expect(useContextStore.getState().loadContext(OWNER)).resolves.toBeUndefined()

      expect(useContextStore.getState().restaurantes).toEqual([])
    })
  })

  describe('la preferencia que manda web-auth en la URL', () => {
    it('?restauranteId= le gana a lo guardado, si ese restaurante está en la lista', async () => {
      const api = await apiFalsa()
      localStorage.setItem(RESTAURANTE_KEY, 'rest-1')
      api.marcas.mockResolvedValue([MARCA_X, MARCA_Y])
      api.restaurantes.mockResolvedValue([RESTAURANTE_A, RESTAURANTE_B])

      await useContextStore.getState().loadContext(OWNER, { restauranteId: 'rest-2' })

      expect(useContextStore.getState().selectedRestauranteId).toBe('rest-2')
      // Queda guardado: al volver sin la URL se mantiene.
      expect(localStorage.getItem(RESTAURANTE_KEY)).toBe('rest-2')
    })

    it('?marcaId= elige el primer restaurante de esa marca', async () => {
      const api = await apiFalsa()
      api.marcas.mockResolvedValue([MARCA_X, MARCA_Y])
      api.restaurantes.mockResolvedValue([RESTAURANTE_A, RESTAURANTE_C])

      await useContextStore.getState().loadContext(OWNER, { marcaId: 'marca-2' })

      expect(useContextStore.getState().selectedRestauranteId).toBe('rest-3')
      expect(useContextStore.getState().selectedMarcaId).toBe('marca-2')
    })

    it('un id que no está en la lista se ignora: es una preferencia, no un permiso', async () => {
      const api = await apiFalsa()
      api.marcas.mockResolvedValue([MARCA_X])
      api.restaurantes.mockResolvedValue([RESTAURANTE_A])

      await useContextStore.getState().loadContext(OWNER, { restauranteId: 'rest-de-otra-marca' })

      expect(useContextStore.getState().selectedRestauranteId).toBe('rest-1')
    })

    it('una marca sin restaurantes en la lista deja la marca elegida y el primer restaurante que haya', async () => {
      const api = await apiFalsa()
      api.marcas.mockResolvedValue([MARCA_X, MARCA_Y])
      api.restaurantes.mockResolvedValue([])

      await useContextStore.getState().loadContext(OWNER, { marcaId: 'marca-2' })

      expect(useContextStore.getState().selectedRestauranteId).toBeNull()
      expect(useContextStore.getState().selectedMarcaId).toBe('marca-2')
    })

    it('preferenciaDeLaUrl lee los dos parámetros y tolera que no estén', () => {
      expect(preferenciaDeLaUrl('?marcaId=m1&restauranteId=r1')).toEqual({ marcaId: 'm1', restauranteId: 'r1' })
      expect(preferenciaDeLaUrl('')).toEqual({ marcaId: null, restauranteId: null })
      expect(preferenciaDeLaUrl('?otra=cosa')).toEqual({ marcaId: null, restauranteId: null })
    })
  })

  describe('refreshContext', () => {
    it('vuelve a pedir los datos con el perfil de la última carga', async () => {
      const api = await apiFalsa()
      api.restaurantes.mockResolvedValue([RESTAURANTE_A])
      await useContextStore.getState().loadContext(GERENTE)

      api.restaurantes.mockResolvedValue([RESTAURANTE_A, RESTAURANTE_B])
      await useContextStore.getState().refreshContext()

      expect(useContextStore.getState().restaurantes).toHaveLength(2)
      expect(useContextStore.getState().selectedRestauranteId).toBe('rest-1')
    })

    it('sin una carga previa no pide nada', async () => {
      const api = await apiFalsa()

      await useContextStore.getState().refreshContext()

      expect(api.restaurantes).not.toHaveBeenCalled()
    })
  })

  describe('dos cargas a la vez y las marcas ajenas', () => {
    it('el layout y una pantalla que carga a la par comparten los pedidos', async () => {
      const api = await apiFalsa()
      api.restaurantes.mockResolvedValue([RESTAURANTE_A])
      api.marcas.mockResolvedValue([MARCA_X])

      await Promise.all([
        useContextStore.getState().loadContext(OWNER),
        useContextStore.getState().loadContext(OWNER),
      ])

      expect(api.restaurantes).toHaveBeenCalledTimes(1)
      expect(api.marcas).toHaveBeenCalledTimes(1)
      expect(useContextStore.getState().restaurantes).toHaveLength(1)
    })

    it('una carga nueva después de la anterior sí vuelve a pedir', async () => {
      const api = await apiFalsa()
      api.restaurantes.mockResolvedValue([RESTAURANTE_A])
      api.marcas.mockResolvedValue([MARCA_X])

      await useContextStore.getState().loadContext(OWNER)
      await useContextStore.getState().loadContext(OWNER)

      expect(api.restaurantes).toHaveBeenCalledTimes(2)
    })

    it('la marca de un restaurante que no es suyo se suma, para poder nombrarla', async () => {
      const api = await apiFalsa()
      // Dueña de la marca 1 y gerente de un restaurante de la marca 2: GET /marcas solo trae la suya.
      api.marcas.mockResolvedValue([MARCA_X])
      api.restaurantes.mockResolvedValue([RESTAURANTE_A, RESTAURANTE_C])
      const mixto = perfilDePrueba({
        membresias: [membresiaDeMarca('marca-1'), membresiaDeRestaurante('GERENTE', 'rest-3', 'marca-2')],
      })

      await useContextStore.getState().loadContext(mixto, { restauranteId: 'rest-3' })

      expect(useContextStore.getState().marcas.map((m) => m.id)).toEqual(['marca-1', 'marca-2'])
      expect(useContextStore.getState().selectedMarcaId).toBe('marca-2')
    })
  })

  describe('setRestaurante y setMarca', () => {
    it('setRestaurante guarda la elección en el store y en localStorage', () => {
      useContextStore.getState().setRestaurante('rest-99')

      expect(useContextStore.getState().selectedRestauranteId).toBe('rest-99')
      expect(localStorage.getItem(RESTAURANTE_KEY)).toBe('rest-99')
    })

    it('setRestaurante lleva la marca del restaurante elegido, así el encabezado queda coherente', () => {
      useContextStore.setState({
        restaurantes: [RESTAURANTE_A, RESTAURANTE_C],
        selectedRestauranteId: 'rest-1',
        selectedMarcaId: 'marca-1',
      })

      useContextStore.getState().setRestaurante('rest-3')

      expect(useContextStore.getState().selectedMarcaId).toBe('marca-2')
    })

    it('un restaurante que no está en la lista no cambia la marca elegida', () => {
      useContextStore.setState({ restaurantes: [RESTAURANTE_A], selectedMarcaId: 'marca-1' })

      useContextStore.getState().setRestaurante('rest-desconocido')

      expect(useContextStore.getState().selectedMarcaId).toBe('marca-1')
    })

    it('setMarca actualiza la marca elegida', () => {
      useContextStore.getState().setMarca('marca-42')

      expect(useContextStore.getState().selectedMarcaId).toBe('marca-42')
    })
  })
})

describe('rolEnElRestaurante', () => {
  const restaurantes = [RESTAURANTE_A, RESTAURANTE_C]

  it('el dueño de la marca es OWNER en los restaurantes de esa marca', () => {
    expect(rolEnElRestaurante(OWNER, restaurantes, 'rest-1')).toBe('OWNER')
  })

  it('el gerente es GERENTE solo en su restaurante', () => {
    expect(rolEnElRestaurante(GERENTE, restaurantes, 'rest-1')).toBe('GERENTE')
    expect(rolEnElRestaurante(GERENTE, restaurantes, 'rest-3')).toBeNull()
  })

  it('una persona puede ser OWNER de una marca y GERENTE de un restaurante de otra', () => {
    const mixto = perfilDePrueba({
      membresias: [membresiaDeMarca('marca-1'), membresiaDeRestaurante('GERENTE', 'rest-3', 'marca-2')],
    })

    expect(rolEnElRestaurante(mixto, restaurantes, 'rest-1')).toBe('OWNER')
    expect(rolEnElRestaurante(mixto, restaurantes, 'rest-3')).toBe('GERENTE')
  })

  it('mientras no hay restaurante elegido, el rol sale de las membresías', () => {
    expect(rolEnElRestaurante(OWNER, [], null)).toBe('OWNER')
    expect(rolEnElRestaurante(GERENTE, [], null)).toBe('GERENTE')
    expect(rolEnElRestaurante(OWNER, restaurantes, 'rest-que-no-esta')).toBe('OWNER')
  })

  it('una cuenta ROOT sin membresías no tiene rol en ningún restaurante', () => {
    const root = perfilDePrueba({ esRoot: true })

    expect(rolEnElRestaurante(root, restaurantes, 'rest-1')).toBeNull()
    expect(rolEnElRestaurante(root, [], null)).toBeNull()
  })

  it('las membresías del salón y la cocina no dan rol en web-admin', () => {
    const mozo = perfilDePrueba({ membresias: [membresiaDeRestaurante('MOZO', 'rest-1')] })

    expect(rolEnElRestaurante(mozo, restaurantes, 'rest-1')).toBeNull()
    expect(rolEnElRestaurante(mozo, [], null)).toBeNull()
  })

  it('sin perfil no hay rol', () => {
    expect(rolEnElRestaurante(null, restaurantes, 'rest-1')).toBeNull()
  })
})
