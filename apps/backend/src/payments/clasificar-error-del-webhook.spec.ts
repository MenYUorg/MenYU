import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { MercadoPagoNoConectadoError, clasificarErrorDelWebhook, mensajeDelError } from './clasificar-error-del-webhook'

// El SDK de Mercado Pago tira el cuerpo de la respuesta parseado: un objeto plano con el status adentro.
const deMercadoPago = (status: number, message = 'error de MP') => ({ message, error: 'error', status, cause: [] })
const abortError = () => Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })
const VERSION = '6.19.3'

describe('clasificarErrorDelWebhook', () => {
  it.each([
    // [caso, error, respuesta, codigo, status]
    ['restaurante sin MP conectado', new MercadoPagoNoConectadoError(), 500, 'mp-no-conectado', undefined],
    ['MP 400: no se puede procesar nunca', deMercadoPago(400), 200, 'mp-solicitud-invalida', 400],
    ['MP 401: token vencido o revocado', deMercadoPago(401), 500, 'mp-token-invalido', 401],
    ['MP 403: token sin permiso', deMercadoPago(403), 500, 'mp-token-invalido', 403],
    ['MP 404', deMercadoPago(404), 500, 'mp-no-encontrado', 404],
    ['MP 429', deMercadoPago(429), 500, 'mp-limite', 429],
    ['MP 500', deMercadoPago(500), 500, 'mp-servidor', 500],
    ['MP 503', deMercadoPago(503), 500, 'mp-servidor', 503],
    ['MP otro 4xx (409)', deMercadoPago(409), 500, 'mp-otro', 409],
    ['MP con el status como texto', { message: 'x', status: '404' }, 500, 'mp-no-encontrado', 404],
    ['fallo de red (TypeError "fetch failed")', new TypeError('fetch failed'), 500, 'red', undefined],
    ['fallo de red con causa', Object.assign(new TypeError('otro texto'), { cause: { code: 'ECONNRESET' } }), 500, 'red', undefined],
    ['timeout (AbortError del AbortController del SDK)', abortError(), 500, 'timeout', undefined],
    ['timeout (DOMException AbortError)', new DOMException('This operation was aborted', 'AbortError'), 500, 'timeout', undefined],
    ['Prisma conocido', new Prisma.PrismaClientKnownRequestError('x', { code: 'P2034', clientVersion: VERSION }), 500, 'prisma', undefined],
    ['Prisma desconocido', new Prisma.PrismaClientUnknownRequestError('x', { clientVersion: VERSION }), 500, 'prisma', undefined],
    ['Prisma sin conexión', new Prisma.PrismaClientInitializationError('x', VERSION), 500, 'prisma', undefined],
    ['Prisma de validación', new Prisma.PrismaClientValidationError('x', { clientVersion: VERSION }), 500, 'prisma', undefined],
    ['Prisma panic', new Prisma.PrismaClientRustPanicError('x', VERSION), 500, 'prisma', undefined],
    ['TypeError de un bug (no es de red)', new TypeError("Cannot read properties of undefined (reading 'id')"), 500, 'desconocido', undefined],
    ['Error cualquiera', new Error('algo'), 500, 'desconocido', undefined],
    ['HttpException 400 de Nest: no es de MP', new BadRequestException('x'), 500, 'desconocido', undefined],
    ['un string', 'falló', 500, 'desconocido', undefined],
    ['undefined', undefined, 500, 'desconocido', undefined],
    ['null', null, 500, 'desconocido', undefined],
  ])('%s → %s', (_caso, err, respuesta, codigo, status) => {
    // Act
    const clasificacion = clasificarErrorDelWebhook(err)

    // Assert
    expect(clasificacion).toMatchObject({ respuesta, codigo })
    expect(clasificacion.status).toBe(status)
  })

  it.each([
    ['sin MP conectado', new MercadoPagoNoConectadoError()],
    ['MP 401', deMercadoPago(401)],
    ['MP 403', deMercadoPago(403)],
  ])('%s trae una acción para reconectar Mercado Pago', (_caso, err) => {
    expect(clasificarErrorDelWebhook(err).accion).toMatch(/reconectar Mercado Pago/)
  })

  it.each([deMercadoPago(404), deMercadoPago(503), new TypeError('fetch failed'), abortError(), new Error('x')])(
    'una falla que se arregla sola no trae acción (%#)',
    (err) => {
      expect(clasificarErrorDelWebhook(err).accion).toBeUndefined()
    },
  )
})

describe('mensajeDelError', () => {
  it.each([
    ['un Error', new Error('se cayó'), 'se cayó'],
    ['un error de MP (objeto con message)', deMercadoPago(401, 'invalid access token'), 'invalid access token'],
    ['varias líneas (Prisma)', new Error('Invalid `prisma.pago.findUnique()`\n\n  invocation:\n   falló'), 'Invalid `prisma.pago.findUnique()` invocation: falló'],
    ['algo sin message', { status: 500 }, ''],
    ['un string', 'texto suelto', ''],
    ['undefined', undefined, ''],
  ])('%s', (_caso, err, esperado) => {
    expect(mensajeDelError(err)).toBe(esperado)
  })

  it('recorta a 300 caracteres', () => {
    expect(mensajeDelError(new Error('x'.repeat(500)))).toHaveLength(300)
  })

  it('no incluye nada del objeto que no sea el mensaje (headers, token)', () => {
    // Arrange
    const err = { message: 'unauthorized', status: 401, headers: { authorization: 'Bearer APP_USR-secreto' } }

    // Act
    const mensaje = mensajeDelError(err)

    // Assert
    expect(mensaje).toBe('unauthorized')
    expect(mensaje).not.toContain('APP_USR')
  })
})
