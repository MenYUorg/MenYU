import 'reflect-metadata'
import * as request from 'supertest'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { JwtService } from '@nestjs/jwt'
import { AppModule } from '../app.module'
import { PrismaService } from '../prisma/prisma.service'

// ── Helpers de seed ──────────────────────────────────────────────────────────
// Todos los objetos de test se crean con slug prefijado 'e2e-test-' para poder
// limpiarlos sin tocar datos reales de la base Supabase compartida.

const E2E_PREFIX = 'e2e-test-'

async function seedMesa(prisma: PrismaService, opts: { modoSesion?: string } = {}) {
  const marca = await prisma.marca.create({
    data: { nombre: 'E2E Test Marca', slug: `${E2E_PREFIX}${Date.now()}-${Math.random()}` },
  })
  const restaurante = await prisma.restaurante.create({
    data: { nombre: 'E2E Restaurante', marcaId: marca.id, modoSesion: opts.modoSesion ?? 'abierto' },
  })
  const mesa = await prisma.mesa.create({
    data: { numero: '1', qrToken: `e2e-qr-${Date.now()}-${Math.random()}`, pin: '0001', restauranteId: restaurante.id },
  })
  return { marca, restaurante, mesa }
}

async function clearE2eData(prisma: PrismaService) {
  // 1. Identificar todos los clientes de test
  const guestIds = (await prisma.cliente.findMany({
    where: { email: null, passwordHash: null },
    select: { id: true },
  })).map((c) => c.id)
  const testEmailIds = (await prisma.cliente.findMany({
    where: { email: { startsWith: E2E_PREFIX } },
    select: { id: true },
  })).map((c) => c.id)
  const testClienteIds = [...new Set([...guestIds, ...testEmailIds])]

  // 2. Reunir todos los sesionIds relevantes: por jerarquía de marca Y por clienteId
  //    (hay que cubrir sesiones huérfanas de runs anteriores fallidos)
  const marcas = await prisma.marca.findMany({ where: { slug: { startsWith: E2E_PREFIX } } })
  const marcaIds = marcas.map((m) => m.id)
  const restauranteIds = marcaIds.length
    ? (await prisma.restaurante.findMany({ where: { marcaId: { in: marcaIds } }, select: { id: true } })).map((r) => r.id)
    : []
  const mesaIds = restauranteIds.length
    ? (await prisma.mesa.findMany({ where: { restauranteId: { in: restauranteIds } }, select: { id: true } })).map((m) => m.id)
    : []
  const sesionIdsByMesa = mesaIds.length
    ? (await prisma.sesionMesa.findMany({ where: { mesaId: { in: mesaIds } }, select: { id: true } })).map((s) => s.id)
    : []
  // sesion_mesa.cliente_id → FK que impide borrar cliente si la sesión sobrevive
  const sesionIdsByCliente = testClienteIds.length
    ? (await prisma.sesionMesa.findMany({ where: { clienteId: { in: testClienteIds } }, select: { id: true } })).map((s) => s.id)
    : []
  const allSesionIds = [...new Set([...sesionIdsByMesa, ...sesionIdsByCliente])]

  // 3. Borrar en orden FK: SesionMesaCliente → SesionMesa → Cliente → Mesa → Restaurante → Marca
  if (allSesionIds.length) {
    await prisma.sesionMesaCliente.deleteMany({ where: { sesionId: { in: allSesionIds } } })
  }
  if (testClienteIds.length) {
    await prisma.sesionMesaCliente.deleteMany({ where: { clienteId: { in: testClienteIds } } })
  }
  if (allSesionIds.length) {
    await prisma.sesionMesa.deleteMany({ where: { id: { in: allSesionIds } } })
  }
  if (testClienteIds.length) {
    await prisma.cliente.deleteMany({ where: { id: { in: testClienteIds } } })
  }
  if (mesaIds.length) {
    await prisma.mesa.deleteMany({ where: { id: { in: mesaIds } } })
  }
  if (restauranteIds.length) {
    await prisma.restaurante.deleteMany({ where: { id: { in: restauranteIds } } })
  }
  if (marcaIds.length) {
    await prisma.marca.deleteMany({ where: { id: { in: marcaIds } } })
  }
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('POST /api/sessions/open (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  // JwtService instanciado directamente con el secret de test para firmar tokens
  const testJwt = new JwtService({ secret: process.env.JWT_SECRET })

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
    prisma = moduleRef.get(PrismaService)
  })

  afterAll(async () => {
    await clearE2eData(prisma)
    await app.close()
  })

  beforeEach(async () => {
    await clearE2eData(prisma)
  })

  // ── Casos básicos ─────────────────────────────────────────────────────

  it('tableCode válido → 200, sesión creada, esAnfitrion: true', async () => {
    const { mesa } = await seedMesa(prisma)

    const res = await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({ tableCode: mesa.qrToken })

    expect(res.status).toBe(200)
    expect(res.body.esAnfitrion).toBe(true)
    expect(res.body.sesionId).toBeDefined()
    expect(res.body.codigoSesion).toMatch(/^\d{3}$/)
  })

  it('pin válido con sesión activa preexistente → 200, mismo sesionId, esAnfitrion: false', async () => {
    const { mesa, restaurante } = await seedMesa(prisma)

    // Primer cliente abre sesión (anfitrión)
    const firstRes = await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({ tableCode: mesa.qrToken })
    expect(firstRes.status).toBe(200)

    // Segundo cliente se une por PIN
    const res = await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({ restaurantId: restaurante.id, pin: mesa.pin })

    expect(res.status).toBe(200)
    expect(res.body.sesionId).toBe(firstRes.body.sesionId)
    expect(res.body.esAnfitrion).toBe(false)
  })

  it('sin parámetros → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({})

    expect(res.status).toBe(400)
  })

  it('tableCode inexistente → 404', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({ tableCode: 'qr-que-no-existe-jamas' })

    expect(res.status).toBe(404)
  })

  // ── Modo seguro ───────────────────────────────────────────────────────

  it('modo seguro sin código → 403', async () => {
    const { mesa } = await seedMesa(prisma, { modoSesion: 'seguro' })

    // Primer cliente abre sesión (no necesita código para ser anfitrión)
    await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({ tableCode: mesa.qrToken })

    // Segundo cliente intenta unirse sin código
    const res = await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({ tableCode: mesa.qrToken })

    expect(res.status).toBe(403)
    expect(res.body.message).toBe('Esta mesa requiere código de sesión para unirse')
  })

  it('modo seguro con código incorrecto → 403', async () => {
    const { mesa } = await seedMesa(prisma, { modoSesion: 'seguro' })

    await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({ tableCode: mesa.qrToken })

    const res = await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({ tableCode: mesa.qrToken, codigoSesion: '000' })

    expect(res.status).toBe(403)
  })

  it('modo seguro con código correcto → 200', async () => {
    const { mesa } = await seedMesa(prisma, { modoSesion: 'seguro' })

    const firstRes = await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({ tableCode: mesa.qrToken })
    const { codigoSesion, sesionId } = firstRes.body

    const res = await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({ tableCode: mesa.qrToken, codigoSesion })

    expect(res.status).toBe(200)
    expect(res.body.sesionId).toBe(sesionId)
    expect(res.body.esAnfitrion).toBe(false)
  })

  // ── Idempotencia ──────────────────────────────────────────────────────

  it('mismo cliente llama open dos veces → no duplica SesionMesaCliente', async () => {
    const { mesa } = await seedMesa(prisma)
    const cliente = await prisma.cliente.create({
      data: { nombre: 'E2E Cliente', email: `${E2E_PREFIX}idem@test.com` },
    })
    const token = testJwt.sign({ sub: cliente.id, tipo: 'cliente' })

    await request(app.getHttpServer())
      .post('/api/sessions/open')
      .set('Authorization', `Bearer ${token}`)
      .send({ tableCode: mesa.qrToken })

    await request(app.getHttpServer())
      .post('/api/sessions/open')
      .set('Authorization', `Bearer ${token}`)
      .send({ tableCode: mesa.qrToken })

    const count = await prisma.sesionMesaCliente.count()
    expect(count).toBe(1)
  })

  // ── JWT reutiliza clienteId ───────────────────────────────────────────

  it('JWT válido en header → reutiliza clienteId, no crea invitado', async () => {
    const { mesa } = await seedMesa(prisma)
    const cliente = await prisma.cliente.create({
      data: { nombre: 'E2E Cliente JWT', email: `${E2E_PREFIX}jwt@test.com` },
    })
    const token = testJwt.sign({ sub: cliente.id, tipo: 'cliente' })

    const res = await request(app.getHttpServer())
      .post('/api/sessions/open')
      .set('Authorization', `Bearer ${token}`)
      .send({ tableCode: mesa.qrToken })

    expect(res.status).toBe(200)
    expect(res.body.clienteId).toBe(cliente.id)

    // Solo el cliente que creamos — ningún invitado nuevo
    const totalClientes = await prisma.cliente.count({
      where: { OR: [{ email: { startsWith: E2E_PREFIX } }, { email: null, passwordHash: null }] },
    })
    expect(totalClientes).toBe(1)
  })
})
