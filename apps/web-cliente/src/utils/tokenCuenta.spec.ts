import { crearTokenJwt } from '../test/fixtures'
import { borrarTokensDeCuenta, leerTokenDeCuenta } from './tokenCuenta'

const AHORA = Date.UTC(2026, 9, 15, 12, 0, 0)
const segundos = (ms: number) => Math.floor(ms / 1000)
const guardar = (token: string) => localStorage.setItem('menyu_access_token', token)

describe('leerTokenDeCuenta', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('sin una cuenta iniciada no hay token', () => {
    expect(leerTokenDeCuenta(AHORA)).toBeUndefined()
  })

  it('con una cuenta iniciada devuelve su token tal cual', () => {
    const token = crearTokenJwt({ sub: 'cli-1', tipo: 'cliente', nombre: 'Ana', exp: segundos(AHORA) + 3600 })
    guardar(token)

    expect(leerTokenDeCuenta(AHORA)).toBe(token)
  })

  it('un token vencido no sirve: se entra como invitado', () => {
    guardar(crearTokenJwt({ sub: 'cli-1', tipo: 'cliente', exp: segundos(AHORA) - 60 }))

    expect(leerTokenDeCuenta(AHORA)).toBeUndefined()
  })

  it('un token que vence justo en este instante ya no sirve', () => {
    guardar(crearTokenJwt({ sub: 'cli-1', tipo: 'cliente', exp: segundos(AHORA) }))

    expect(leerTokenDeCuenta(AHORA)).toBeUndefined()
  })

  it('un token que vence un segundo después todavía sirve', () => {
    const token = crearTokenJwt({ sub: 'cli-1', tipo: 'cliente', exp: segundos(AHORA) + 1 })
    guardar(token)

    expect(leerTokenDeCuenta(AHORA)).toBe(token)
  })

  it('un token sin fecha de vencimiento se manda: lo decide el servidor', () => {
    const token = crearTokenJwt({ sub: 'cli-1', tipo: 'cliente' })
    guardar(token)

    expect(leerTokenDeCuenta(AHORA)).toBe(token)
  })

  it.each([
    ['de un administrador', { sub: 'adm-1', tipo: 'admin', exp: segundos(AHORA) + 3600 }],
    ['de un mozo', { sub: 'moz-1', tipo: 'mozo', exp: segundos(AHORA) + 3600 }],
    ['sin tipo', { sub: 'cli-1', exp: segundos(AHORA) + 3600 }],
  ])('un token %s no sirve', (_descripcion, contenido) => {
    guardar(crearTokenJwt(contenido))

    expect(leerTokenDeCuenta(AHORA)).toBeUndefined()
  })

  it.each([
    ['con una sola parte', 'solo-un-tramo'],
    ['con el contenido roto', 'a.%%%.c'],
    ['con un contenido que no es JSON', `a.${btoa('hola')}.c`],
    ['con un contenido nulo', `a.${btoa('null')}.c`],
  ])('un token %s no sirve', (_descripcion, token) => {
    guardar(token)

    expect(leerTokenDeCuenta(AHORA)).toBeUndefined()
  })

  it('si no se puede leer el almacenamiento del navegador, no hay token y no se rompe nada', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })

    expect(leerTokenDeCuenta(AHORA)).toBeUndefined()
  })

  it('sin pasarle la hora usa la actual', () => {
    vi.useFakeTimers()
    vi.setSystemTime(AHORA)
    const vigente = crearTokenJwt({ sub: 'cli-1', tipo: 'cliente', exp: segundos(AHORA) + 60 })
    guardar(vigente)
    expect(leerTokenDeCuenta()).toBe(vigente)

    vi.setSystemTime(AHORA + 61_000)
    expect(leerTokenDeCuenta()).toBeUndefined()
  })
})

describe('borrarTokensDeCuenta', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('cierra la sesión de la cuenta: borra el token y el de renovación', () => {
    guardar(crearTokenJwt({ sub: 'cli-1', tipo: 'cliente' }))
    localStorage.setItem('menyu_refresh_token', 'refresh')
    localStorage.setItem('menyu_sesion_otra_cosa', 'queda')

    borrarTokensDeCuenta()

    expect(localStorage.getItem('menyu_access_token')).toBeNull()
    expect(localStorage.getItem('menyu_refresh_token')).toBeNull()
    expect(localStorage.getItem('menyu_sesion_otra_cosa')).toBe('queda')
  })

  it('sin almacenamiento del navegador no se rompe', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })

    expect(() => borrarTokensDeCuenta()).not.toThrow()
  })
})
