import { AppDeEndpoints, CUENTAS, MUNDO, SESION_CLIENTE, SIN_USUARIO, USUARIOS, crearAppDeEndpoints } from '../test/app-endpoints'
import { PaymentsController } from './payments.controller'
import { PaymentsService } from './payments.service'
import { Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { MercadoPagoNoConectadoError } from './clasificar-error-del-webhook'

describe('endpoints de pagos', () => {
  let api: AppDeEndpoints
  const payments = {
    solicitarEfectivo: jest.fn(),
    getSesiones: jest.fn(),
    confirmarEfectivo: jest.fn(),
    crearPreferenciaMercadoPago: jest.fn(),
    procesarWebhookMercadoPago: jest.fn(),
  }
  const DE_LA_SESION = { sesionId: SESION_CLIENTE.sesionId }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(PaymentsController, [{ provide: PaymentsService, useValue: payments }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => jest.clearAllMocks())

  describe('comensal (sesión de mesa)', () => {
    it('POST /payments/solicitar-efectivo delega con la sesión (201)', async () => {
      // Arrange
      payments.solicitarEfectivo.mockResolvedValue({ ok: true })

      // Act
      const res = await api.pedir('post', '/payments/solicitar-efectivo', { sesion: SESION_CLIENTE, body: DE_LA_SESION })

      // Assert
      expect(res.status).toBe(201)
      expect(payments.solicitarEfectivo).toHaveBeenCalledWith(SESION_CLIENTE.sesionId)
    })

    it('POST /payments/mercadopago/crear-preferencia pasa el Origin del navegador', async () => {
      // Arrange
      payments.crearPreferenciaMercadoPago.mockResolvedValue({ initPoint: 'https://mp.test/checkout' })

      // Act
      const res = await api
        .pedir('post', '/payments/mercadopago/crear-preferencia', { sesion: SESION_CLIENTE, body: DE_LA_SESION })
        .set('Origin', 'https://menyu-cliente.vercel.app')

      // Assert
      expect(res.status).toBe(201)
      expect(res.body).toEqual({ initPoint: 'https://mp.test/checkout' })
      expect(payments.crearPreferenciaMercadoPago).toHaveBeenCalledWith(SESION_CLIENTE.sesionId, 'https://menyu-cliente.vercel.app')
    })

    it('sin JWT de sesión responde 401', async () => {
      // Act
      const res = await api.pedir('post', '/payments/solicitar-efectivo', { body: DE_LA_SESION })

      // Assert
      expect(res.status).toBe(401)
      expect(payments.solicitarEfectivo).not.toHaveBeenCalled()
    })

    it.each(['/payments/solicitar-efectivo', '/payments/mercadopago/crear-preferencia'])(
      'POST %s con la sesión de otra mesa en el body responde 403',
      async (ruta) => {
        // Act
        const res = await api.pedir('post', ruta, { sesion: SESION_CLIENTE, body: { sesionId: 'sesion-de-otra-mesa' } })

        // Assert
        expect(res.status).toBe(403)
        expect(payments.solicitarEfectivo).not.toHaveBeenCalled()
        expect(payments.crearPreferenciaMercadoPago).not.toHaveBeenCalled()
      },
    )

    it('un token de invitado (tipo cliente, sin sesión de mesa) responde 401', async () => {
      // Act
      const res = await api.pedir('post', '/payments/solicitar-efectivo', { sesion: USUARIOS.CLIENTE, body: DE_LA_SESION })

      // Assert
      expect(res.status).toBe(401)
      expect(payments.solicitarEfectivo).not.toHaveBeenCalled()
    })
  })

  describe('el salón (OWNER, GERENTE, JEFE_SALON y MOZO)', () => {
    const PAGO_ID = '6f1c2a40-5555-4a1b-9c3d-000000000001'

    it('GET /payments/sesiones: el MOZO lista las sesiones del restaurante', async () => {
      // Arrange
      payments.getSesiones.mockResolvedValue([])

      // Act
      const res = await api.pedir('get', '/payments/sesiones', { cuenta: CUENTAS.MOZO, query: { restauranteId: MUNDO.REST_1 } })

      // Assert
      expect(res.status).toBe(200)
      expect(payments.getSesiones).toHaveBeenCalledWith(MUNDO.REST_1)
    })

    it.each([
      ['la COCINA', CUENTAS.COCINA, MUNDO.REST_1],
      ['ROOT', CUENTAS.ROOT, MUNDO.REST_1],
      ['el MOZO de otro restaurante (antes no se chequeaba la pertenencia)', CUENTAS.MOZO, MUNDO.REST_2],
    ])('GET /payments/sesiones: %s recibe 403', async (_caso, cuenta, restauranteId) => {
      // Act
      const res = await api.pedir('get', '/payments/sesiones', { cuenta, query: { restauranteId } })

      // Assert
      expect(res.status).toBe(403)
      expect(payments.getSesiones).not.toHaveBeenCalled()
    })

    it('POST /payments/confirmar-efectivo pasa el body validado y la cuenta (200)', async () => {
      // Arrange
      payments.confirmarEfectivo.mockResolvedValue({ ok: true })

      // Act
      const res = await api.pedir('post', '/payments/confirmar-efectivo', {
        cuenta: CUENTAS.GERENTE,
        body: { pagoId: PAGO_ID, mozoId: 'mozo-1', otroCampo: 'x' },
      })

      // Assert
      expect(res.status).toBe(200)
      expect(payments.confirmarEfectivo).toHaveBeenCalledWith({ pagoId: PAGO_ID, mozoId: 'mozo-1' }, CUENTAS.GERENTE)
    })

    it('POST /payments/confirmar-efectivo sin un pagoId UUID: 400', async () => {
      // Act
      const res = await api.pedir('post', '/payments/confirmar-efectivo', { cuenta: CUENTAS.MOZO, body: { pagoId: 'pago-1' } })

      // Assert
      expect(res.status).toBe(400)
      expect(payments.confirmarEfectivo).not.toHaveBeenCalled()
    })

    it('con el token de la sesión de mesa o sin token no se confirman pagos (401), y sin Usuario 403', async () => {
      // Act
      const comensal = await api.pedir('post', '/payments/confirmar-efectivo', { sesion: SESION_CLIENTE, body: { pagoId: PAGO_ID } })
      const sinUsuario = await api.pedir('post', '/payments/confirmar-efectivo', { cuenta: SIN_USUARIO, body: { pagoId: PAGO_ID } })

      // Assert
      expect([comensal.status, sinUsuario.status]).toEqual([401, 403])
      expect(payments.confirmarEfectivo).not.toHaveBeenCalled()
    })
  })

  describe('webhook de Mercado Pago (sin guard: lo llama Mercado Pago)', () => {
    const RUTA = '/payments/webhook/mercadopago/restaurante/rest-1/pago/pago-1'

    it('responde 200 "OK" y procesa la notificación con los ids de la ruta y la query', async () => {
      // Arrange
      payments.procesarWebhookMercadoPago.mockResolvedValue(undefined)

      // Act
      const res = await api.pedir('post', RUTA, { query: { type: 'payment', 'data.id': '999' } })

      // Assert
      expect(res.status).toBe(200)
      expect(res.text).toBe('OK')
      expect(payments.procesarWebhookMercadoPago).toHaveBeenCalledWith('rest-1', 'pago-1', { type: 'payment', 'data.id': '999' })
    })

    describe('responde después de procesar (DT-11)', () => {
      let warn: jest.SpyInstance
      let error: jest.SpyInstance

      beforeEach(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
      })

      afterEach(() => jest.restoreAllMocks())

      const lineas = (espia: jest.SpyInstance) => espia.mock.calls.map((args) => String(args[0])).filter((l) => l.startsWith('webhook MP: ') && !l.includes('firma='))

      /** El servicio queda colgado hasta que el test lo suelte: así se ve si la respuesta salió antes. */
      function servicioDiferido() {
        let soltar!: () => void
        let fallar!: (err: unknown) => void
        let avisarLlamado!: () => void
        const llamado = new Promise<void>((r) => (avisarLlamado = r))
        payments.procesarWebhookMercadoPago.mockImplementation(() => {
          avisarLlamado()
          return new Promise<void>((resolve, reject) => {
            soltar = resolve
            fallar = reject
          })
        })
        return { llamado, soltar: () => soltar(), fallar: (err: unknown) => fallar(err) }
      }

      function pedirYMarcar() {
        const estado = { respondio: false }
        const respuesta = api.pedir('post', RUTA, { query: { type: 'payment', 'data.id': '999' } }).then((res) => {
          estado.respondio = true
          return res
        })
        return { estado, respuesta }
      }

      it('no responde hasta que el servicio termina, y después 200 "OK"', async () => {
        // Arrange
        const servicio = servicioDiferido()

        // Act
        const { estado, respuesta } = pedirYMarcar()
        await servicio.llamado
        await new Promise((r) => setTimeout(r, 50))
        const antesDeTerminar = estado.respondio
        servicio.soltar()
        const res = await respuesta

        // Assert
        expect(antesDeTerminar).toBe(false)
        expect([res.status, res.text]).toEqual([200, 'OK'])
      })

      it('si el servicio falla, tampoco responde antes: espera y da 500', async () => {
        // Arrange
        const servicio = servicioDiferido()

        // Act
        const { estado, respuesta } = pedirYMarcar()
        await servicio.llamado
        await new Promise((r) => setTimeout(r, 50))
        const antesDeTerminar = estado.respondio
        servicio.fallar({ message: 'internal error', status: 503 })
        const res = await respuesta

        // Assert
        expect(antesDeTerminar).toBe(false)
        expect(res.status).toBe(500)
      })

      it('lo que el servicio da por no procesable (vuelve sin lanzar) es 200 "OK" sin error en el log', async () => {
        // Arrange
        payments.procesarWebhookMercadoPago.mockResolvedValue(undefined)

        // Act
        const res = await api.pedir('post', RUTA, { query: { topic: 'chargebacks' } })

        // Assert
        expect([res.status, res.text]).toEqual([200, 'OK'])
        expect(lineas(error)).toEqual([])
      })

      it('un 400 de Mercado Pago es no procesable: 200 "OK" y un warn con el código', async () => {
        // Arrange
        payments.procesarWebhookMercadoPago.mockRejectedValue({ message: 'bad request', status: 400 })

        // Act
        const res = await api.pedir('post', RUTA, { query: { type: 'payment' } })

        // Assert
        expect([res.status, res.text]).toEqual([200, 'OK'])
        expect(lineas(warn)).toEqual([
          'webhook MP: notificación no procesable (pagoId=pago-1 restauranteId=rest-1 codigo=mp-solicitud-invalida status=400 mensaje="bad request")',
        ])
        expect(lineas(error)).toEqual([])
      })

      it.each([
        ['sin MP conectado', new MercadoPagoNoConectadoError(), 'hay que reconectar Mercado Pago desde el panel del restaurante', 'codigo=mp-no-conectado mensaje="El restaurante no tiene Mercado Pago conectado"'],
        ['MP 401', { message: 'invalid access token', status: 401 }, 'hay que reconectar Mercado Pago desde el panel del restaurante', 'codigo=mp-token-invalido status=401 mensaje="invalid access token"'],
        ['MP 403', { message: 'forbidden', status: 403 }, 'hay que reconectar Mercado Pago desde el panel del restaurante', 'codigo=mp-token-invalido status=403 mensaje="forbidden"'],
        ['MP 404', { message: 'not found', status: 404 }, 'no se pudo procesar, MP va a reintentar', 'codigo=mp-no-encontrado status=404 mensaje="not found"'],
        ['MP 429', { message: 'too many requests', status: 429 }, 'no se pudo procesar, MP va a reintentar', 'codigo=mp-limite status=429 mensaje="too many requests"'],
        ['MP 500', { message: 'internal error', status: 500 }, 'no se pudo procesar, MP va a reintentar', 'codigo=mp-servidor status=500 mensaje="internal error"'],
        ['MP 503', { message: 'unavailable', status: 503 }, 'no se pudo procesar, MP va a reintentar', 'codigo=mp-servidor status=503 mensaje="unavailable"'],
        ['error de red', new TypeError('fetch failed'), 'no se pudo procesar, MP va a reintentar', 'codigo=red mensaje="fetch failed"'],
        ['timeout', Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }), 'no se pudo procesar, MP va a reintentar', 'codigo=timeout mensaje="This operation was aborted"'],
        ['Prisma', new Prisma.PrismaClientKnownRequestError('db caída', { code: 'P1001', clientVersion: '6.19.3' }), 'no se pudo procesar, MP va a reintentar', 'codigo=prisma mensaje="db caída"'],
        ['error desconocido', new Error('algo raro'), 'no se pudo procesar, MP va a reintentar', 'codigo=desconocido mensaje="algo raro"'],
      ])('%s: 500 con cuerpo genérico y un logger.error con el contexto', async (_caso, err, que, detalle) => {
        // Arrange
        payments.procesarWebhookMercadoPago.mockRejectedValue(err)

        // Act
        const res = await api.pedir('post', RUTA, { query: { type: 'payment' } })

        // Assert
        expect(res.status).toBe(500)
        expect(res.body).toEqual({ statusCode: 500, message: 'No se pudo procesar la notificación', error: 'Internal Server Error' })
        expect(lineas(error)).toEqual([`webhook MP: ${que} (pagoId=pago-1 restauranteId=rest-1 ${detalle})`])
      })

      it('el log de error no lleva el objeto de error ni lo que traiga además del mensaje (headers, token)', async () => {
        // Arrange
        payments.procesarWebhookMercadoPago.mockRejectedValue({
          message: 'unauthorized',
          status: 401,
          headers: { authorization: 'Bearer APP_USR-secreto' },
        })

        // Act
        const res = await api.pedir('post', RUTA, { query: { type: 'payment' } })

        // Assert
        expect(res.status).toBe(500)
        const todo = [...error.mock.calls, ...warn.mock.calls].flat().map(String).join('\n')
        expect(todo).not.toContain('APP_USR')
        expect(error.mock.calls.every((args) => args.every((a: unknown) => typeof a === 'string'))).toBe(true)
        expect(JSON.stringify(res.body)).not.toContain('unauthorized')
      })
    })
  })
})
