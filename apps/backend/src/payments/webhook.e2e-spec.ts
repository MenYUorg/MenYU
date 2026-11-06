import 'reflect-metadata'
import { randomUUID } from 'crypto'
import { INestApplication, Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import * as request from 'supertest'
import { AppModule } from '../app.module'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { ESTADO_PAGO_APROBADO, ESTADO_PAGO_CANCELADO, ESTADO_PAGO_PENDIENTE } from '../common/estado-pago.constant'
import {
  MOTIVO_REVISION_APROBADO_SOBRE_CANCELADO,
  MOTIVO_REVISION_APROBADO_SOBRE_SESION_CERRADA,
} from '../common/motivo-revision.constant'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { PrismaService } from '../prisma/prisma.service'
import { SessionsService } from '../sessions/sessions.service'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'
import { PaymentsService } from './payments.service'
import { MercadoPagoProvider } from './providers/mercado-pago.provider'

// El webhook de Mercado Pago contra la base real, por HTTP: el controller (la respuesta después de procesar y la
// clasificación 200/500), el servicio (las marcas de revisión) y Postgres juntos. Mercado Pago no se llama nunca: el
// provider es un doble y el token del restaurante también (salvo en "MP no conectado", que usa el método real sobre un
// restaurante sin token).
//
// Todo lo que crea esta corrida lleva su marcador (en el slug de la marca y en el email del usuario), como en
// cierre-de-sesion.e2e-spec.ts: la limpieza borra solo eso y lo que cuelga de esa marca.

const E2E_MARCADOR = process.env.GITHUB_RUN_ID
  ? `e2e-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}-webhook-`
  : `e2e-local-${randomUUID().slice(0, 8)}-webhook-`

const DE_LA_CORRIDA = { mesa: { restaurante: { marca: { slug: { startsWith: E2E_MARCADOR } } } } }

const CUERPO_DEL_500 = { statusCode: 500, message: 'No se pudo procesar la notificación', error: 'Internal Server Error' }

describe('Webhook de Mercado Pago (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let sessions: SessionsService
  let payments: PaymentsService
  let gateway: MenyuGateway
  let getAccessTokenReal: (restauranteId: string) => Promise<string>
  let tokenDelRestaurante: jest.SpyInstance

  const mp = { processWebhook: jest.fn(), createPreference: jest.fn(), getPaymentStatus: jest.fn() }

  let marcaId = ''
  let owner: UsuarioAutenticado
  let mesas = 0

  async function crearRestaurante(nombre: string) {
    const restauranteId = (await prisma.restaurante.create({ data: { nombre, marcaId } })).id
    const itemId = (await prisma.itemMenu.create({ data: { restauranteId, nombre: 'Plato', precioBase: 1000 } })).id
    return { restauranteId, itemId }
  }

  let A: Awaited<ReturnType<typeof crearRestaurante>>
  let B: Awaited<ReturnType<typeof crearRestaurante>>

  async function crearMesa(restauranteId = A.restauranteId) {
    mesas += 1
    return prisma.mesa.create({
      data: {
        numero: String(mesas),
        qrToken: `${E2E_MARCADOR}qr-${randomUUID()}`,
        pin: String(mesas).padStart(4, '0'),
        restauranteId,
        estado: 'ocupada',
      },
    })
  }

  /** Una sesión activa con un pedido de `total` (un ítem). */
  async function crearSesion(mesaId: string, total: number, itemId = A.itemId) {
    const sesion = await prisma.sesionMesa.create({ data: { mesaId, codigoSesion: '001', estado: 'activa' } })
    await prisma.pedido.create({
      data: { sesionId: sesion.id, mesaId, items: { create: [{ itemId, cantidad: 1, precioUnitario: total }] } },
    })
    return sesion
  }

  function crearPagoMp(sesionId: string, estado: string, monto: number, extra: object = {}) {
    return prisma.pago.create({ data: { sesionId, metodo: 'mercadopago', estado, monto, ...extra } })
  }

  /** Mesa ocupada, sesión activa de 1000 y un pago de MP pendiente de 1000. */
  async function mesaConPagoPendiente() {
    const m = await crearMesa()
    const s = await crearSesion(m.id, 1000)
    const p = await crearPagoMp(s.id, ESTADO_PAGO_PENDIENTE, 1000)
    return { m, s, p }
  }

  const pago = (id: string) => prisma.pago.findUniqueOrThrow({ where: { id } })
  const sesion = (id: string) => prisma.sesionMesa.findUniqueOrThrow({ where: { id } })
  const mesa = (id: string) => prisma.mesa.findUniqueOrThrow({ where: { id } })

  /** El doble de MP informa la orden `merchantOrderId` de este pago con `status`. */
  function mpInforma(pagoId: string, status: string, merchantOrderId = `mo-${randomUUID().slice(0, 8)}`) {
    mp.processWebhook.mockResolvedValue({ externalId: merchantOrderId, status, externalReference: pagoId })
    return merchantOrderId
  }

  function notificar(restauranteId: string, pagoId: string) {
    return request(app.getHttpServer())
      .post(`/payments/webhook/mercadopago/restaurante/${restauranteId}/pago/${pagoId}`)
      .query({ type: 'payment', 'data.id': '123456' })
  }

  async function limpiar() {
    await prisma.pago.deleteMany({ where: { sesion: DE_LA_CORRIDA } })
    await prisma.pedidoItem.deleteMany({ where: { pedido: { sesion: DE_LA_CORRIDA } } })
    await prisma.pedido.deleteMany({ where: { sesion: DE_LA_CORRIDA } })
    await prisma.sesionMesa.deleteMany({ where: DE_LA_CORRIDA })
    const marcaIds = (await prisma.marca.findMany({ where: { slug: { startsWith: E2E_MARCADOR } }, select: { id: true } })).map(
      (m) => m.id,
    )
    const restaurantes = { restaurante: { marcaId: { in: marcaIds } } }
    await prisma.mesa.deleteMany({ where: restaurantes })
    await prisma.itemMenu.deleteMany({ where: restaurantes })
    await prisma.membresia.deleteMany({ where: { usuario: { email: { startsWith: E2E_MARCADOR } } } })
    await prisma.usuario.deleteMany({ where: { email: { startsWith: E2E_MARCADOR } } })
    await prisma.restaurante.deleteMany({ where: { marcaId: { in: marcaIds } } })
    await prisma.marca.deleteMany({ where: { id: { in: marcaIds } } })
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MercadoPagoProvider)
      .useValue(mp)
      .compile()
    app = moduleRef.createNestApplication()
    // init y no listen: supertest usa el server sin abrir un puerto, y el gateway necesita su server para los emit.
    await app.init()
    prisma = moduleRef.get(PrismaService)
    sessions = moduleRef.get(SessionsService)
    payments = moduleRef.get(PaymentsService)
    gateway = moduleRef.get(MenyuGateway)

    const oauth = moduleRef.get(MercadoPagoOAuthService)
    getAccessTokenReal = oauth.getAccessTokenDecrypted.bind(oauth)
    tokenDelRestaurante = jest.spyOn(oauth, 'getAccessTokenDecrypted')

    marcaId = (await prisma.marca.create({ data: { nombre: 'E2E Webhook', slug: `${E2E_MARCADOR}${randomUUID()}` } })).id
    A = await crearRestaurante('E2E Webhook A')
    B = await crearRestaurante('E2E Webhook B')
    const usuario = await prisma.usuario.create({
      data: { supabaseUserId: randomUUID(), email: `${E2E_MARCADOR}owner@menyu.test`, nombre: 'Owner E2E' },
    })
    await prisma.membresia.create({ data: { usuarioId: usuario.id, rol: 'OWNER', marcaId } })
    owner = { id: usuario.id, supabaseUserId: usuario.supabaseUserId, email: usuario.email, nombre: usuario.nombre, esRoot: false }
  })

  beforeEach(() => {
    jest.clearAllMocks()
    // Los logs del webhook (warn y error) son esperables acá: se silencian para que la salida muestre los tests.
    for (const nivel of ['log', 'warn', 'error'] as const) jest.spyOn(Logger.prototype, nivel).mockImplementation(() => undefined)
    tokenDelRestaurante.mockResolvedValue('token-e2e')
    mp.processWebhook.mockRejectedValue(new Error('el doble de MP no tiene respuesta preparada'))
  })

  afterEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockRestore()
    jest.spyOn(Logger.prototype, 'warn').mockRestore()
    jest.spyOn(Logger.prototype, 'error').mockRestore()
  })

  afterAll(async () => {
    if (prisma) await limpiar()
    if (app) await app.close()
  })

  it('1) aprobado sobre una sesión activa que cubre el total: 200, pago aprobado, sesión cerrada y mesa libre', async () => {
    const { m, s, p } = await mesaConPagoPendiente()
    const orden = mpInforma(p.id, 'APROBADO')
    const emit = jest.spyOn(gateway, 'emitSesionCobrada')

    const res = await notificar(A.restauranteId, p.id)

    expect([res.status, res.text]).toEqual([200, 'OK'])
    const aprobado = await pago(p.id)
    expect(aprobado).toMatchObject({ estado: ESTADO_PAGO_APROBADO, referenciaExterna: orden, requiereRevision: false, motivoRevision: null })
    expect(aprobado.fechaCobro).not.toBeNull()
    expect(await sesion(s.id)).toMatchObject({ estado: 'cerrada' })
    expect((await sesion(s.id)).cerradaEn).not.toBeNull()
    expect((await mesa(m.id)).estado).toBe('libre')
    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('2) aprobado sobre un pago cancelado por el cierre a mano: sigue cancelado, marcado y con la referencia; la repetida no cambia nada', async () => {
    const { m, s, p } = await mesaConPagoPendiente()
    await expect(sessions.cerrarMesaAdmin(m.id, owner)).resolves.toEqual({ ok: true })
    expect((await pago(p.id)).estado).toBe(ESTADO_PAGO_CANCELADO)
    const sesionCerrada = await sesion(s.id)
    const orden = mpInforma(p.id, 'APROBADO')

    const primera = await notificar(A.restauranteId, p.id)

    expect([primera.status, primera.text]).toEqual([200, 'OK'])
    const marcado = await pago(p.id)
    expect(marcado).toMatchObject({
      estado: ESTADO_PAGO_CANCELADO,
      requiereRevision: true,
      motivoRevision: MOTIVO_REVISION_APROBADO_SOBRE_CANCELADO,
      referenciaExterna: orden,
      fechaCobro: null,
    })

    const segunda = await notificar(A.restauranteId, p.id)

    expect([segunda.status, segunda.text]).toEqual([200, 'OK'])
    expect(await pago(p.id)).toEqual(marcado)
    expect(await sesion(s.id)).toEqual(sesionCerrada)
    expect((await mesa(m.id)).estado).toBe('libre')
  })

  it('3) aprobado sobre una sesión ya cerrada, con la mesa ya en otra sesión activa: aprobado y marcado; la sesión nueva y la mesa intactas', async () => {
    const m = await crearMesa()
    const vieja = await crearSesion(m.id, 1000)
    const rechazado = await crearPagoMp(vieja.id, 'rechazado', 1000)
    await expect(sessions.cerrarMesaAdmin(m.id, owner)).resolves.toEqual({ ok: true })
    expect((await pago(rechazado.id)).estado).toBe('rechazado') // el cierre solo cancela los pendientes
    const viejaCerrada = await sesion(vieja.id)
    // La mesa se vuelve a ocupar con otra sesión.
    await prisma.mesa.update({ where: { id: m.id }, data: { estado: 'ocupada' } })
    const nueva = await crearSesion(m.id, 2000)
    const orden = mpInforma(rechazado.id, 'APROBADO')
    const emit = jest.spyOn(gateway, 'emitSesionCobrada')

    const res = await notificar(A.restauranteId, rechazado.id)

    expect([res.status, res.text]).toEqual([200, 'OK'])
    expect(await pago(rechazado.id)).toMatchObject({
      estado: ESTADO_PAGO_APROBADO,
      referenciaExterna: orden,
      requiereRevision: true,
      motivoRevision: MOTIVO_REVISION_APROBADO_SOBRE_SESION_CERRADA,
    })
    expect(await sesion(vieja.id)).toEqual(viejaCerrada)
    expect(await sesion(nueva.id)).toMatchObject({ estado: 'activa', cerradaEn: null })
    expect((await mesa(m.id)).estado).toBe('ocupada')
    expect(emit).not.toHaveBeenCalled()
  })

  describe('4) fallas transitorias: 500 con cuerpo genérico y nada escrito', () => {
    it.each([
      ['MP responde 503', () => mp.processWebhook.mockRejectedValue({ message: 'internal error', status: 503 })],
      ['error de red', () => mp.processWebhook.mockRejectedValue(new TypeError('fetch failed'))],
      // El restaurante de prueba no tiene token: el método real tira el BadRequest de "no tiene Mercado Pago conectado".
      ['MP no conectado (getAccessTokenDecrypted real)', () => tokenDelRestaurante.mockImplementation(getAccessTokenReal)],
    ])('%s', async (_caso, preparar) => {
      const { m, s, p } = await mesaConPagoPendiente()
      const antes = { pago: await pago(p.id), sesion: await sesion(s.id), mesa: await mesa(m.id) }
      preparar()

      const res = await notificar(A.restauranteId, p.id)

      expect(res.status).toBe(500)
      expect(res.body).toEqual(CUERPO_DEL_500)
      expect({ pago: await pago(p.id), sesion: await sesion(s.id), mesa: await mesa(m.id) }).toEqual(antes)
      expect(antes.pago).toMatchObject({ estado: ESTADO_PAGO_PENDIENTE, requiereRevision: false, motivoRevision: null })
    })
  })

  it('5) MP responde 400: 200 y nada escrito', async () => {
    const { m, s, p } = await mesaConPagoPendiente()
    const antes = { pago: await pago(p.id), sesion: await sesion(s.id), mesa: await mesa(m.id) }
    mp.processWebhook.mockRejectedValue({ message: 'bad request', status: 400 })

    const res = await notificar(A.restauranteId, p.id)

    expect([res.status, res.text]).toEqual([200, 'OK'])
    expect({ pago: await pago(p.id), sesion: await sesion(s.id), mesa: await mesa(m.id) }).toEqual(antes)
  })

  it('6) el restaurante de la URL no es el del pago: 200, sin pedir el token ni llamar a MP, y nada escrito', async () => {
    const { m, s, p } = await mesaConPagoPendiente()
    const antes = { pago: await pago(p.id), sesion: await sesion(s.id), mesa: await mesa(m.id) }
    mpInforma(p.id, 'APROBADO')

    const res = await notificar(B.restauranteId, p.id)

    expect([res.status, res.text]).toEqual([200, 'OK'])
    expect(mp.processWebhook).not.toHaveBeenCalled()
    expect(tokenDelRestaurante).not.toHaveBeenCalled()
    expect({ pago: await pago(p.id), sesion: await sesion(s.id), mesa: await mesa(m.id) }).toEqual(antes)
  })

  it('7) aislamiento: cada restaurante ve solo sus pagos marcados, más nuevos primero', async () => {
    // Dos restaurantes propios de este caso: los de A y B ya tienen pagos marcados por los casos de arriba.
    const C = await crearRestaurante('E2E Webhook C')
    const D = await crearRestaurante('E2E Webhook D')
    const sesionDe = async (r: typeof C) => (await crearSesion((await crearMesa(r.restauranteId)).id, 1000, r.itemId)).id
    const sC = await sesionDe(C)
    const sD = await sesionDe(D)
    const marcado = { requiereRevision: true, motivoRevision: MOTIVO_REVISION_APROBADO_SOBRE_SESION_CERRADA }
    const viejoC = await crearPagoMp(sC, ESTADO_PAGO_APROBADO, 300, { ...marcado, createdAt: new Date('2026-11-01T10:00:00Z') })
    const nuevoC = await crearPagoMp(sC, ESTADO_PAGO_APROBADO, 700, { ...marcado, createdAt: new Date('2026-11-03T10:00:00Z') })
    await crearPagoMp(sC, ESTADO_PAGO_APROBADO, 1000, { createdAt: new Date('2026-11-04T10:00:00Z') }) // sin marca
    const deD = await crearPagoMp(sD, ESTADO_PAGO_CANCELADO, 500, {
      requiereRevision: true,
      motivoRevision: MOTIVO_REVISION_APROBADO_SOBRE_CANCELADO,
      createdAt: new Date('2026-11-02T10:00:00Z'),
    })

    const deC = await payments.listarPagosParaRevision(C.restauranteId)
    const deDe = await payments.listarPagosParaRevision(D.restauranteId)

    expect(deC.map((p) => p.pagoId)).toEqual([nuevoC.id, viejoC.id])
    expect(deC[0]).toEqual({
      pagoId: nuevoC.id,
      sesionId: sC,
      mesaNumero: expect.any(String),
      monto: 700,
      metodo: 'mercadopago',
      estado: ESTADO_PAGO_APROBADO,
      motivo: MOTIVO_REVISION_APROBADO_SOBRE_SESION_CERRADA,
      referenciaExterna: null,
      fechaCobro: null,
      creadoEn: '2026-11-03T10:00:00.000Z',
    })
    expect(deDe.map((p) => p.pagoId)).toEqual([deD.id])
    expect(deDe[0]).toMatchObject({ monto: 500, estado: ESTADO_PAGO_CANCELADO, motivo: MOTIVO_REVISION_APROBADO_SOBRE_CANCELADO })
  })

  it('8) dos notificaciones idénticas en paralelo: las dos 200, un solo pago aprobado y la sesión cerrada una vez', async () => {
    const { m, s, p } = await mesaConPagoPendiente()
    const orden = mpInforma(p.id, 'APROBADO')
    const emit = jest.spyOn(gateway, 'emitSesionCobrada')

    const respuestas = await Promise.all([notificar(A.restauranteId, p.id), notificar(A.restauranteId, p.id)])

    expect(respuestas.map((r) => [r.status, r.text])).toEqual([
      [200, 'OK'],
      [200, 'OK'],
    ])
    const pagos = await prisma.pago.findMany({ where: { sesionId: s.id } })
    expect(pagos).toHaveLength(1)
    expect(pagos[0]).toMatchObject({ id: p.id, estado: ESTADO_PAGO_APROBADO, referenciaExterna: orden, requiereRevision: false })
    expect((await sesion(s.id)).estado).toBe('cerrada')
    expect((await mesa(m.id)).estado).toBe('libre')
    expect(emit).toHaveBeenCalledTimes(1)
  })
})
