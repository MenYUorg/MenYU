import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { SessionAuthGuard, verificarSesionDeMesa } from './session-auth.guard'

// El token de la sesión de mesa del comensal. La cuenta de cliente y el invitado (POST /auth/guest) firman con el mismo
// secreto y también son tipo cliente: sin sesión no son un token de mesa (hotfix del token de invitado).

const jwt = new JwtService({ secret: 'secreto-de-test' })
const bearer = (payload: object) => `Bearer ${jwt.sign(payload)}`

const SESION = { sub: 'cliente-1', tipo: 'cliente', sesionId: 'sesion-1', mesaId: 'mesa-1', restauranteId: 'rest-1' }
const INVITADO = { sub: 'cliente-invitado', tipo: 'cliente', nombre: 'Invitado' }
const CUENTA_DE_CLIENTE = { sub: 'cliente-2', tipo: 'cliente', email: 'ana@ejemplo.com', nombre: 'Ana' }

describe('verificarSesionDeMesa', () => {
  it('devuelve el payload de un token de mesa', () => {
    expect(verificarSesionDeMesa(jwt, bearer(SESION))).toEqual(expect.objectContaining(SESION))
  })

  it.each([
    ['sin header', undefined, 'Session JWT requerido'],
    ['con otro esquema', 'Basic abc', 'Session JWT requerido'],
    ['con un token que no verifica', 'Bearer no-es-un-jwt', 'Session JWT inválido o expirado'],
    ['con un token firmado con otro secreto', `Bearer ${new JwtService({ secret: 'otro' }).sign(SESION)}`, 'Session JWT inválido o expirado'],
  ])('%s: 401', (_caso, header, mensaje) => {
    expect(() => verificarSesionDeMesa(jwt, header)).toThrow(new UnauthorizedException(mensaje))
  })

  it.each([
    ['del personal (mozo)', { sub: 'mozo-1', tipo: 'mozo', restauranteId: 'rest-1' }],
    ['de un admin', { sub: 'admin-1', tipo: 'admin', rol: 'OWNER' }],
  ])('un token %s: 401 con el mensaje de quien llama', (_caso, payload) => {
    expect(() => verificarSesionDeMesa(jwt, bearer(payload), 'Solo clientes')).toThrow(new UnauthorizedException('Solo clientes'))
  })

  it.each([
    ['de invitado (POST /auth/guest)', INVITADO],
    ['de una cuenta de cliente (POST /auth/login)', CUENTA_DE_CLIENTE],
    ['con sesionId vacío', { ...SESION, sesionId: '' }],
    ['con sesionId que no es texto', { ...SESION, sesionId: 1 }],
    ['sin mesaId', { ...SESION, mesaId: undefined }],
    ['sin restauranteId', { ...SESION, restauranteId: undefined }],
    ['sin sub', { ...SESION, sub: undefined }],
  ])('un token %s no es de mesa: 401', (_caso, payload) => {
    expect(() => verificarSesionDeMesa(jwt, bearer(payload))).toThrow(new UnauthorizedException('Este recurso requiere una sesión de mesa'))
  })
})

describe('SessionAuthGuard', () => {
  const guard = new SessionAuthGuard(jwt)

  function pedido(payload: object, { params = {}, body = {} }: { params?: object; body?: object } = {}) {
    const request: Record<string, unknown> = { headers: { authorization: bearer(payload) }, params, body }
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext
    return { request, context }
  }

  it('con el token de mesa deja el payload en request.sessionUser', () => {
    const { request, context } = pedido(SESION)

    expect(guard.canActivate(context)).toBe(true)
    expect(request.sessionUser).toEqual(expect.objectContaining(SESION))
  })

  it('con un token de invitado: 401 y no deja nada en la request', () => {
    const { request, context } = pedido(INVITADO)

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException)
    expect(request.sessionUser).toBeUndefined()
  })

  it.each([
    ['la sesión de la ruta (:sesionId)', { params: { sesionId: 'sesion-1' } }],
    ['la sesión del body', { body: { sesionId: 'sesion-1' } }],
    ['las dos', { params: { sesionId: 'sesion-1' }, body: { sesionId: 'sesion-1' } }],
  ])('si %s es la del token, pasa', (_caso, partes) => {
    expect(guard.canActivate(pedido(SESION, partes).context)).toBe(true)
  })

  it.each([
    ['la ruta (:sesionId) nombra otra sesión', { params: { sesionId: 'sesion-de-otra-mesa' } }],
    ['el body nombra otra sesión', { body: { sesionId: 'sesion-de-otra-mesa' } }],
    ['la ruta es la suya pero el body nombra otra', { params: { sesionId: 'sesion-1' }, body: { sesionId: 'sesion-de-otra-mesa' } }],
    ['el body manda la sesión como otro tipo', { body: { sesionId: ['sesion-1'] } }],
  ])('si %s: 403', (_caso, partes) => {
    const { request, context } = pedido(SESION, partes)

    expect(() => guard.canActivate(context)).toThrow(new ForbiddenException('Esa sesión de mesa no es la tuya'))
    expect(request.sessionUser).toBeUndefined()
  })
})
