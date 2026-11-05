import { createHmac } from 'crypto'
import { Logger } from '@nestjs/common'
import { AppDeEndpoints, crearAppDeEndpoints } from '../test/app-endpoints'
import * as firmaDelWebhook from './firma-del-webhook'
import { PaymentsController } from './payments.controller'
import { PaymentsService } from './payments.service'

// La firma del webhook en modo observación (DT-02): una línea de log por notificación y la respuesta de siempre.
// Las URLs van armadas a mano (`?data.id=…`) para probar que la clave con punto llega así del query de Express.
const SECRET = 'secreto-del-webhook-de-test'
const REQUEST_ID = '2066ca19-c6f1-498a-be75-1923005edd06'
const TS = '1742505638683'
const RUTA = '/payments/webhook/mercadopago/restaurante/rest-1/pago/pago-1'
const PREFIJO = 'webhook MP: restauranteId=rest-1 pagoId=pago-1'

function firmar(manifest: string, secret = SECRET) {
  return createHmac('sha256', secret).update(manifest).digest('hex')
}

const V1 = firmar(`id:123;request-id:${REQUEST_ID};ts:${TS};`)
const V1_OTRO_SECRETO = firmar(`id:123;request-id:${REQUEST_ID};ts:${TS};`, 'otro-secreto')
// Una IPN firmada con su `id` como si fuera `data.id`: si el controller tomara el `id`, daría válida.
const V1_IPN = firmar(`id:987654;request-id:${REQUEST_ID};ts:${TS};`)

const NIVELES = ['log', 'warn', 'error', 'debug', 'verbose'] as const

describe('webhook de Mercado Pago: firma en modo observación', () => {
  const payments = { procesarWebhookMercadoPago: jest.fn() }
  const crearApp = () => crearAppDeEndpoints(PaymentsController, [{ provide: PaymentsService, useValue: payments }])
  let espias: jest.SpyInstance[]
  const secretOriginal = process.env.MP_WEBHOOK_SECRET

  /** Todos los mensajes que pasaron por el Logger de Nest, con su nivel. */
  const mensajes = () =>
    espias.flatMap((espia, i) => espia.mock.calls.map((args) => ({ nivel: NIVELES[i], texto: args.map(String).join(' ') })))
  const lineasDelWebhook = () => mensajes().filter((m) => m.texto.startsWith('webhook MP:'))

  beforeEach(() => {
    payments.procesarWebhookMercadoPago.mockReset().mockResolvedValue(undefined)
    espias = NIVELES.map((nivel) => jest.spyOn(Logger.prototype, nivel).mockImplementation(() => undefined))
  })

  afterEach(() => {
    jest.restoreAllMocks()
    if (secretOriginal === undefined) delete process.env.MP_WEBHOOK_SECRET
    else process.env.MP_WEBHOOK_SECRET = secretOriginal
  })

  describe('al arrancar', () => {
    it('sin MP_WEBHOOK_SECRET avisa una sola vez y la app arranca igual', async () => {
      // Arrange
      delete process.env.MP_WEBHOOK_SECRET

      // Act
      const api = await crearApp()
      await api.pedir('post', `${RUTA}?data.id=123&type=payment`)
      await api.cerrar()

      // Assert
      const avisos = mensajes().filter((m) => m.texto.includes('MP_WEBHOOK_SECRET no está definida'))
      expect(avisos).toEqual([{ nivel: 'warn', texto: expect.any(String) }])
    })

    it('con MP_WEBHOOK_SECRET no avisa', async () => {
      // Arrange
      process.env.MP_WEBHOOK_SECRET = SECRET

      // Act
      const api = await crearApp()
      await api.cerrar()

      // Assert
      expect(mensajes().filter((m) => m.texto.includes('MP_WEBHOOK_SECRET'))).toEqual([])
    })
  })

  describe('una línea por notificación', () => {
    let api: AppDeEndpoints

    beforeAll(async () => {
      api = await crearApp()
    })

    afterAll(() => api.cerrar())

    const CASOS = [
      {
        caso: 'firma válida',
        secreto: SECRET,
        url: `${RUTA}?data.id=123&type=payment`,
        headers: { 'x-signature': `ts=${TS},v1=${V1}`, 'x-request-id': REQUEST_ID },
        nivel: 'log',
        linea: `${PREFIJO} x-signature=sí x-request-id=sí query=[data.id,type] tipo=payment firma=valida`,
      },
      {
        caso: 'firma inválida (otro secreto)',
        secreto: SECRET,
        url: `${RUTA}?data.id=123&type=payment`,
        headers: { 'x-signature': `ts=${TS},v1=${V1_OTRO_SECRETO}`, 'x-request-id': REQUEST_ID },
        nivel: 'warn',
        linea: `${PREFIJO} x-signature=sí x-request-id=sí query=[data.id,type] tipo=payment firma=invalida`,
      },
      {
        caso: 'sin header x-signature',
        secreto: SECRET,
        url: `${RUTA}?data.id=123&type=payment`,
        headers: { 'x-request-id': REQUEST_ID },
        nivel: 'warn',
        linea: `${PREFIJO} x-signature=no x-request-id=sí query=[data.id,type] tipo=payment firma=sin-header`,
      },
      {
        caso: 'sin MP_WEBHOOK_SECRET, aunque la firma esté bien',
        secreto: undefined,
        url: `${RUTA}?data.id=123&type=payment`,
        headers: { 'x-signature': `ts=${TS},v1=${V1}`, 'x-request-id': REQUEST_ID },
        nivel: 'warn',
        linea: `${PREFIJO} x-signature=sí x-request-id=sí query=[data.id,type] tipo=payment firma=sin-secreto`,
      },
      {
        caso: 'IPN (topic + id, sin data.id): el id no se usa para la firma',
        secreto: SECRET,
        url: `${RUTA}?topic=merchant_order&id=987654`,
        headers: { 'x-signature': `ts=${TS},v1=${V1_IPN}`, 'x-request-id': REQUEST_ID },
        nivel: 'warn',
        linea: `${PREFIJO} x-signature=sí x-request-id=sí query=[topic,id] tipo=merchant_order firma=invalida`,
      },
      {
        caso: 'sin topic ni type: tipo=sin-tipo',
        secreto: SECRET,
        url: `${RUTA}?data.id=123`,
        headers: { 'x-signature': `ts=${TS},v1=${V1}`, 'x-request-id': REQUEST_ID },
        nivel: 'log',
        linea: `${PREFIJO} x-signature=sí x-request-id=sí query=[data.id] tipo=sin-tipo firma=valida`,
      },
      {
        caso: 'topic y type: manda topic, como en el provider',
        secreto: SECRET,
        url: `${RUTA}?data.id=123&topic=merchant_order&type=payment`,
        headers: { 'x-signature': `ts=${TS},v1=${V1}`, 'x-request-id': REQUEST_ID },
        nivel: 'log',
        linea: `${PREFIJO} x-signature=sí x-request-id=sí query=[data.id,topic,type] tipo=merchant_order firma=valida`,
      },
      {
        caso: 'tipo con caracteres raros y muy largo: llega filtrado y recortado a 40',
        secreto: SECRET,
        url: `${RUTA}?data.id=123&type=pay%0Ament%3Cx%3E${'y'.repeat(50)}`,
        headers: { 'x-signature': `ts=${TS},v1=${V1}`, 'x-request-id': REQUEST_ID },
        nivel: 'log',
        linea: `${PREFIJO} x-signature=sí x-request-id=sí query=[data.id,type] tipo=paymentx${'y'.repeat(32)} firma=valida`,
      },
    ]

    it.each(CASOS)('$caso: loguea firma y responde 200 "OK"', async ({ secreto, url, headers, nivel, linea }) => {
      // Arrange
      if (secreto) process.env.MP_WEBHOOK_SECRET = secreto
      else delete process.env.MP_WEBHOOK_SECRET

      // Act
      const res = await api.pedir('post', url).set(headers)

      // Assert
      expect(res.status).toBe(200)
      expect(res.text).toBe('OK')
      expect(lineasDelWebhook()).toEqual([{ nivel, texto: linea }])
      expect(payments.procesarWebhookMercadoPago).toHaveBeenCalledTimes(1)
    })

    it('ningún mensaje de log tiene el secreto, el v1 ni los valores de la query salvo el tipo', async () => {
      // Arrange
      process.env.MP_WEBHOOK_SECRET = SECRET

      // Act
      for (const { headers, url } of CASOS) await api.pedir('post', url).set(headers)

      // Assert
      const todo = mensajes().map((m) => m.texto).join('\n')
      expect(lineasDelWebhook()).toHaveLength(CASOS.length)
      for (const prohibido of [SECRET, V1, V1_OTRO_SECRETO, V1_IPN, '123', '987654', REQUEST_ID, TS]) {
        expect(todo).not.toContain(prohibido)
      }
    })

    it('los nombres de la query van filtrados a [\\w.-] y hasta 10', async () => {
      // Arrange
      process.env.MP_WEBHOOK_SECRET = SECRET
      const muchos = Array.from({ length: 12 }, (_, i) => `p${i}=x`).join('&')

      // Act
      const res = await api.pedir('post', `${RUTA}?na%0Ame%3Cs%3E=1&${muchos}`)

      // Assert
      expect(res.status).toBe(200)
      expect(lineasDelWebhook()).toEqual([
        { nivel: 'warn', texto: `${PREFIJO} x-signature=no x-request-id=no query=[names,p0,p1,p2,p3,p4,p5,p6,p7,p8] tipo=sin-tipo firma=sin-header` },
      ])
    })

    it('si evaluar la firma falla, responde 200 "OK", procesa igual y no lanza ni aunque el aviso falle', async () => {
      // Arrange
      process.env.MP_WEBHOOK_SECRET = SECRET
      jest.spyOn(firmaDelWebhook, 'evaluarFirmaDelWebhook').mockImplementation(() => {
        throw new Error('se rompió')
      })
      const warn = espias[NIVELES.indexOf('warn')]

      // Act
      const conAviso = await api.pedir('post', `${RUTA}?data.id=123`).set({ 'x-signature': `ts=${TS},v1=${V1}` })
      warn.mockImplementation(() => {
        throw new Error('tampoco el log')
      })
      const sinAviso = await api.pedir('post', `${RUTA}?data.id=123`).set({ 'x-signature': `ts=${TS},v1=${V1}` })

      // Assert
      expect([conAviso.status, conAviso.text, sinAviso.status, sinAviso.text]).toEqual([200, 'OK', 200, 'OK'])
      expect(warn).toHaveBeenCalledWith('webhook MP: no se pudo registrar la firma de la notificación')
      expect(payments.procesarWebhookMercadoPago).toHaveBeenCalledTimes(2)
    })
  })
})
