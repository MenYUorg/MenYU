import { Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { errors } from 'jose'
import { AccesoService } from '../auth/supabase/acceso.service'
import { SupabaseNoConfiguradoError, VerificadorTokenSupabase } from '../auth/supabase/verificador-token.service'
import { PrismaService } from '../prisma/prisma.service'
import { accesoDeTest, CUENTAS, MUNDO } from '../test/acceso-de-test'
import { AccesoDelSocket } from './acceso-del-socket.service'

// Quién se une a qué sala del gateway (DT-08). El verificador de Supabase y la base son dobles; los roles salen de
// `accesoDeTest()`, que resuelve OWNER de la marca igual que AccesoService.

const jwt = new JwtService({ secret: 'secreto-de-test' })

/** El token de prueba de cada cuenta: el verificador doble lo cambia por su supabaseUserId. */
const tokenDe = (cuenta: { supabaseUserId: string }) => `token-${cuenta.supabaseUserId}`

const INACTIVO = { id: 'usuario-inactivo', supabaseUserId: '6f1c2a40-2222-4a1b-9c3d-000000000099' }
/** Verifica en Supabase, pero no tiene `Usuario` en la base. */
const SIN_USUARIO = { supabaseUserId: '6f1c2a40-2222-4a1b-9c3d-000000000098' }

const USUARIOS = [...Object.values(CUENTAS).map((c) => ({ ...c, activo: true })), { ...INACTIVO, activo: false }]

let verificar: jest.Mock
let buscarUsuario: jest.Mock
let rolesEnRestaurante: jest.SpyInstance
let errorDelLog: jest.SpyInstance
let socket: AccesoDelSocket

beforeEach(() => {
  verificar = jest.fn(async (token: string) => {
    const supabaseUserId = token.replace(/^token-/, '')
    if ([...USUARIOS, SIN_USUARIO].some((u) => u.supabaseUserId === supabaseUserId)) return supabaseUserId
    throw new errors.JWSSignatureVerificationFailed()
  })
  buscarUsuario = jest.fn(async ({ where }: { where: { supabaseUserId?: string; id?: string } }) => {
    const usuario = USUARIOS.find((u) => u.supabaseUserId === where.supabaseUserId || u.id === where.id)
    return usuario ? { id: usuario.id, activo: usuario.activo } : null
  })
  const acceso: AccesoService = accesoDeTest()
  rolesEnRestaurante = jest.spyOn(acceso, 'rolesEnRestaurante')
  errorDelLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {})

  socket = new AccesoDelSocket(
    { verificar } as unknown as VerificadorTokenSupabase,
    { usuario: { findUnique: buscarUsuario } } as unknown as PrismaService,
    acceso,
    jwt,
  )
})

afterEach(() => jest.restoreAllMocks())

describe('AccesoDelSocket.personal', () => {
  it.each([
    ['sin token', undefined],
    ['con un token vacío', ''],
    ['con un token que no es texto', 123],
    ['con un objeto como token', { token: 'x' }],
  ])('%s: rechaza sin verificar nada', async (_caso, token) => {
    expect(await socket.personal(token, MUNDO.REST_1, 'salon')).toEqual({ ok: false, motivo: 'sin-token' })
    expect(verificar).not.toHaveBeenCalled()
  })

  it.each([
    ['que no es UUID', 'rest-1'],
    ['vacío', ''],
    ['que no es texto', 42],
    ['ausente', undefined],
  ])('con un restauranteId %s: rechaza antes de tocar el token o la base', async (_caso, restauranteId) => {
    expect(await socket.personal(tokenDe(CUENTAS.MOZO), restauranteId, 'salon')).toEqual({
      ok: false,
      motivo: 'restaurante-invalido',
    })
    expect(verificar).not.toHaveBeenCalled()
    expect(buscarUsuario).not.toHaveBeenCalled()
  })

  it('con un token inválido: rechaza sin buscar el usuario', async () => {
    expect(await socket.personal('token-falso', MUNDO.REST_1, 'salon')).toEqual({ ok: false, motivo: 'token-invalido' })
    expect(buscarUsuario).not.toHaveBeenCalled()
    expect(errorDelLog).not.toHaveBeenCalled()
  })

  it('con un token vencido: rechaza', async () => {
    verificar.mockRejectedValueOnce(new errors.JWTExpired('"exp" claim timestamp check failed', {}))
    expect(await socket.personal(tokenDe(CUENTAS.MOZO), MUNDO.REST_1, 'salon')).toEqual({
      ok: false,
      motivo: 'token-invalido',
    })
  })

  it('si el sub del token no es un UUID: rechaza', async () => {
    verificar.mockResolvedValueOnce('no-es-uuid')
    expect(await socket.personal(tokenDe(CUENTAS.MOZO), MUNDO.REST_1, 'salon')).toEqual({
      ok: false,
      motivo: 'token-invalido',
    })
    expect(buscarUsuario).not.toHaveBeenCalled()
  })

  it.each([
    ['sin `Usuario` en la base', SIN_USUARIO],
    ['con el `Usuario` inactivo', INACTIVO],
  ])('%s: rechaza', async (_caso, cuenta) => {
    expect(await socket.personal(tokenDe(cuenta), MUNDO.REST_1, 'salon')).toEqual({ ok: false, motivo: 'usuario-inactivo' })
    expect(rolesEnRestaurante).not.toHaveBeenCalled()
  })

  it.each([
    ['un usuario sin membresías', CUENTAS.SIN_MEMBRESIAS, MUNDO.REST_1],
    ['ROOT, que no es un bypass', CUENTAS.ROOT, MUNDO.REST_1],
    ['el MOZO, en otro restaurante', CUENTAS.MOZO, MUNDO.REST_B],
    ['el GERENTE, en otra sucursal de su marca', CUENTAS.GERENTE, MUNDO.REST_2],
    ['el OWNER, en un restaurante de otra marca', CUENTAS.OWNER_B, MUNDO.REST_1],
  ])('%s: rechaza por falta de rol', async (_caso, cuenta, restauranteId) => {
    for (const sala of ['salon', 'cocina'] as const) {
      expect(await socket.personal(tokenDe(cuenta), restauranteId, sala)).toEqual({ ok: false, motivo: 'sin-rol' })
    }
  })

  it.each([
    ['OWNER de la marca, en una sucursal sin personal propio', CUENTAS.OWNER_A, MUNDO.REST_2, true, true],
    ['GERENTE', CUENTAS.GERENTE, MUNDO.REST_1, true, true],
    ['JEFE_SALON', CUENTAS.JEFE_SALON, MUNDO.REST_1, true, true],
    ['MOZO (también en cocina: /mozo/pedidos usa cocina:join)', CUENTAS.MOZO, MUNDO.REST_1, true, true],
    ['COCINA', CUENTAS.COCINA, MUNDO.REST_1, false, true],
  ])('%s: salon=%s, cocina=%s', async (_caso, cuenta, restauranteId, enSalon, enCocina) => {
    const salon = await socket.personal(tokenDe(cuenta), restauranteId, 'salon')
    const cocina = await socket.personal(tokenDe(cuenta), restauranteId, 'cocina')

    expect(salon).toEqual(enSalon ? { ok: true, usuarioId: cuenta.id } : { ok: false, motivo: 'sin-rol' })
    expect(cocina).toEqual(enCocina ? { ok: true, usuarioId: cuenta.id } : { ok: false, motivo: 'sin-rol' })
  })

  describe('fallas de infraestructura: rechaza y deja el detalle en el log', () => {
    it.each([
      ['Supabase sin configurar', new SupabaseNoConfiguradoError()],
      ['el JWKS no responde', new errors.JWKSTimeout()],
      ['un error que no es de jose', new Error('ECONNRESET')],
    ])('%s', async (_caso, falla) => {
      verificar.mockRejectedValueOnce(falla)
      const token = tokenDe(CUENTAS.MOZO)

      expect(await socket.personal(token, MUNDO.REST_1, 'salon')).toEqual({ ok: false, motivo: 'error-de-verificacion' })
      expect(errorDelLog).toHaveBeenCalledWith(expect.stringContaining(falla.message))
      expect(String(errorDelLog.mock.calls[0][0])).not.toContain(token)
    })

    it('la base no responde', async () => {
      buscarUsuario.mockRejectedValueOnce(new Error('Can\'t reach database server'))

      expect(await socket.personal(tokenDe(CUENTAS.MOZO), MUNDO.REST_1, 'salon')).toEqual({
        ok: false,
        motivo: 'error-de-verificacion',
      })
      expect(errorDelLog).toHaveBeenCalledWith(expect.stringContaining("Can't reach database server"))
    })
  })
})

describe('AccesoDelSocket.comensal', () => {
  const SESION = { sub: 'cliente-1', tipo: 'cliente', sesionId: 'sesion-1', mesaId: 'mesa-1', restauranteId: MUNDO.REST_1 }

  it('con el JWT de una sesión de mesa devuelve su sesión y su restaurante', () => {
    expect(socket.comensal(jwt.sign(SESION))).toEqual({ sesionId: 'sesion-1', restauranteId: MUNDO.REST_1 })
  })

  it.each([
    ['sin token', undefined],
    ['con un token vacío', ''],
    ['con un token que no es texto', 7],
    ['con un token que no es un JWT', 'no-es-un-jwt'],
    ['con el JWT de un invitado (sin sesión)', jwt.sign({ sub: 'cliente-invitado', tipo: 'cliente', nombre: 'Invitado' })],
    ['con el JWT de una cuenta de cliente (sin sesión)', jwt.sign({ sub: 'cliente-2', tipo: 'cliente', email: 'ana@ejemplo.com' })],
    ['con el JWT de mesa sin restauranteId', jwt.sign({ ...SESION, restauranteId: undefined })],
    ['con el JWT de mesa firmado con otro secreto', new JwtService({ secret: 'otro' }).sign(SESION)],
    [
      'con un access token de Supabase',
      new JwtService({ secret: 'secreto-de-supabase' }).sign({ sub: CUENTAS.MOZO.supabaseUserId, aud: 'authenticated', role: 'authenticated' }),
    ],
    ['con el token de prueba del personal', tokenDe(CUENTAS.MOZO)],
  ])('%s: null', (_caso, token) => {
    expect(socket.comensal(token)).toBeNull()
  })
})

describe('AccesoDelSocket.sigueAutorizado', () => {
  it('el MOZO sigue en el salón y en la cocina de su restaurante', async () => {
    expect(await socket.sigueAutorizado(CUENTAS.MOZO.id, MUNDO.REST_1, 'salon')).toBe(true)
    expect(await socket.sigueAutorizado(CUENTAS.MOZO.id, MUNDO.REST_1, 'cocina')).toBe(true)
  })

  it('la COCINA no está autorizada en el salón', async () => {
    expect(await socket.sigueAutorizado(CUENTAS.COCINA.id, MUNDO.REST_1, 'salon')).toBe(false)
  })

  it('sin el rol (se le quitó la membresía): false', async () => {
    rolesEnRestaurante.mockResolvedValueOnce([])
    expect(await socket.sigueAutorizado(CUENTAS.MOZO.id, MUNDO.REST_1, 'salon')).toBe(false)
  })

  it('con el usuario inactivo: false, sin mirar los roles', async () => {
    expect(await socket.sigueAutorizado(INACTIVO.id, MUNDO.REST_1, 'salon')).toBe(false)
    expect(rolesEnRestaurante).not.toHaveBeenCalled()
  })

  it('si el usuario ya no existe: false', async () => {
    expect(await socket.sigueAutorizado('usuario-borrado', MUNDO.REST_1, 'salon')).toBe(false)
  })

  it('un error de base se propaga: quien llama decide no revocar', async () => {
    buscarUsuario.mockRejectedValueOnce(new Error('Can\'t reach database server'))
    await expect(socket.sigueAutorizado(CUENTAS.MOZO.id, MUNDO.REST_1, 'salon')).rejects.toThrow("Can't reach database server")
  })

  it('un error al leer los roles también se propaga', async () => {
    rolesEnRestaurante.mockRejectedValueOnce(new Error('timeout'))
    await expect(socket.sigueAutorizado(CUENTAS.MOZO.id, MUNDO.REST_1, 'salon')).rejects.toThrow('timeout')
  })
})
