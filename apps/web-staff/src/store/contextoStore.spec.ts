import {
  preferenciaDeLaUrl,
  puedeAtenderLlamados,
  puedeEditarPedidos,
  puedeVerCocina,
  puedeVerMozo,
  restaurantesDelPerfil,
  rolesEnElRestaurante,
  useContextoStore,
} from './contextoStore'
import {
  membresiaDeMarca,
  membresiaDeRestaurante,
  perfilDeCocina,
  perfilDeGerente,
  perfilDeMozo,
  perfilDeOwner,
  perfilDePrueba,
  perfilMixto,
} from '../test/authClient'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useContextoStore.setState({ restaurantes: [], restauranteId: null, perfil: null })
})

describe('los restaurantes salen del perfil, no de la API', () => {
  it('una membresía de restaurante trae el suyo, con el nombre de su marca', () => {
    expect(restaurantesDelPerfil(perfilDeMozo('rest-1'))).toEqual([
      { id: 'rest-1', nombre: 'Restaurante rest-1', marcaNombre: 'Marca marca-1' },
    ])
  })

  it('una membresía OWNER trae todas las sucursales de la marca', () => {
    const perfil = perfilDePrueba({
      membresias: [
        membresiaDeMarca('marca-1', [
          { id: 'rest-2', nombre: 'Palermo' },
          { id: 'rest-1', nombre: 'Centro' },
        ], 'Marca Pruebas'),
      ],
    })

    expect(restaurantesDelPerfil(perfil)).toEqual([
      { id: 'rest-1', nombre: 'Centro', marcaNombre: 'Marca Pruebas' },
      { id: 'rest-2', nombre: 'Palermo', marcaNombre: 'Marca Pruebas' },
    ])
  })

  it('el mismo restaurante por dos membresías aparece una sola vez', () => {
    expect(restaurantesDelPerfil(perfilMixto('rest-1'))).toHaveLength(1)
  })

  it('sin perfil, o con un OWNER de una marca sin sucursales, la lista queda vacía', () => {
    expect(restaurantesDelPerfil(null)).toEqual([])
    expect(restaurantesDelPerfil(perfilDePrueba({ membresias: [membresiaDeMarca('marca-1', [])] }))).toEqual([])
  })
})

describe('los roles en el restaurante elegido', () => {
  it('la membresía del restaurante da su rol', () => {
    expect(rolesEnElRestaurante(perfilDeCocina('rest-1'), 'rest-1')).toEqual(['COCINA'])
  })

  it('la membresía OWNER cubre cada sucursal de su marca', () => {
    expect(rolesEnElRestaurante(perfilDeOwner('rest-1'), 'rest-1')).toEqual(['OWNER'])
  })

  it('la cuenta mixta suma los dos roles, y de ahí salen todos sus permisos', () => {
    const roles = rolesEnElRestaurante(perfilMixto('rest-1'), 'rest-1')

    expect(roles).toEqual(expect.arrayContaining(['OWNER', 'MOZO']))
    expect(roles).toHaveLength(2)
    expect(puedeAtenderLlamados(roles)).toBe(true)
    expect(puedeEditarPedidos(roles)).toBe(true)
  })

  it('en un restaurante ajeno, o sin restaurante elegido, no hay ningún rol', () => {
    expect(rolesEnElRestaurante(perfilDeMozo('rest-1'), 'rest-9')).toEqual([])
    expect(rolesEnElRestaurante(perfilDeMozo('rest-1'), null)).toEqual([])
    expect(rolesEnElRestaurante(null, 'rest-1')).toEqual([])
  })
})

describe('qué puede cada rol en la interfaz', () => {
  it.each([
    ['COCINA', true, false, false, false],
    ['MOZO', false, true, true, true],
    ['JEFE_SALON', false, true, true, true],
    ['GERENTE', true, true, false, true],
    ['OWNER', true, true, false, false],
  ] as const)('%s', (rol, cocina, mozo, atender, editar) => {
    const roles = [rol]

    expect(puedeVerCocina(roles)).toBe(cocina)
    expect(puedeVerMozo(roles)).toBe(mozo)
    // Atender un llamado necesita el `Mozo` de la cuenta y editar un pedido no es del OWNER (matriz de la 4.3).
    expect(puedeAtenderLlamados(roles)).toBe(atender)
    expect(puedeEditarPedidos(roles)).toBe(editar)
  })
})

describe('cargarContexto', () => {
  it('con un solo restaurante entra directo y lo recuerda', () => {
    useContextoStore.getState().cargarContexto(perfilDeMozo('rest-1'))

    expect(useContextoStore.getState().restauranteId).toBe('rest-1')
    expect(localStorage.getItem('menyu-staff-restaurante-id')).toBe('rest-1')
  })

  it('con varios y sin preferencia queda sin elegir, para que elija la persona', () => {
    const perfil = perfilDePrueba({
      membresias: [membresiaDeMarca('marca-1', [{ id: 'rest-1', nombre: 'Centro' }, { id: 'rest-2', nombre: 'Palermo' }])],
    })

    useContextoStore.getState().cargarContexto(perfil)

    expect(useContextoStore.getState().restaurantes).toHaveLength(2)
    expect(useContextoStore.getState().restauranteId).toBeNull()
  })

  it('la preferencia de la URL manda sobre el último elegido', () => {
    localStorage.setItem('menyu-staff-restaurante-id', 'rest-1')
    const perfil = perfilDePrueba({
      membresias: [membresiaDeMarca('marca-1', [{ id: 'rest-1', nombre: 'Centro' }, { id: 'rest-2', nombre: 'Palermo' }])],
    })

    useContextoStore.getState().cargarContexto(perfil, preferenciaDeLaUrl('?restauranteId=rest-2'))

    expect(useContextoStore.getState().restauranteId).toBe('rest-2')
  })

  it('sin preferencia usa el último elegido', () => {
    localStorage.setItem('menyu-staff-restaurante-id', 'rest-2')
    const perfil = perfilDePrueba({
      membresias: [membresiaDeMarca('marca-1', [{ id: 'rest-1', nombre: 'Centro' }, { id: 'rest-2', nombre: 'Palermo' }])],
    })

    useContextoStore.getState().cargarContexto(perfil, preferenciaDeLaUrl(''))

    expect(useContextoStore.getState().restauranteId).toBe('rest-2')
  })

  it('una preferencia de un restaurante ajeno se ignora: es una preferencia, no un permiso', () => {
    useContextoStore.getState().cargarContexto(
      perfilDeGerente('rest-1'),
      preferenciaDeLaUrl('?restauranteId=rest-de-otra-marca'),
    )

    expect(useContextoStore.getState().restauranteId).toBe('rest-1')
  })

  it('el restaurante guardado que ya no está en el perfil no se usa', () => {
    localStorage.setItem('menyu-staff-restaurante-id', 'rest-viejo')
    const perfil = perfilDePrueba({
      membresias: [
        membresiaDeRestaurante('MOZO', 'rest-1'),
        membresiaDeRestaurante('COCINA', 'rest-2'),
      ],
    })

    useContextoStore.getState().cargarContexto(perfil)

    expect(useContextoStore.getState().restauranteId).toBeNull()
  })

  it('setRestaurante cambia el elegido y lo recuerda', () => {
    useContextoStore.getState().setRestaurante('rest-7')

    expect(useContextoStore.getState().restauranteId).toBe('rest-7')
    expect(localStorage.getItem('menyu-staff-restaurante-id')).toBe('rest-7')
  })

})
