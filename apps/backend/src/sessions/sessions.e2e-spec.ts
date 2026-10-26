import 'reflect-metadata'
import { randomUUID } from 'crypto'
import * as request from 'supertest'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { JwtService } from '@nestjs/jwt'
import { AppModule } from '../app.module'
import { PrismaService } from '../prisma/prisma.service'

// ── Helpers de seed ──────────────────────────────────────────────────────────
// Todo lo que crea esta corrida lleva su marcador: en el slug de la marca y en el email de los clientes
// creados a mano. La limpieza borra solo eso y lo que cuelga de esas marcas (restaurantes, mesas, sesiones y
// los clientes que solo aparecen en ellas), nunca filas de otra corrida ni de otros datos de la base. Igual,
// jest.e2e.config.js no deja correr los e2e contra una base que no sea local o la del CI.
//
// El marcador cambia en cada corrida: en CI lleva el id y el intento del run; en local, un sufijo aleatorio.

const E2E_MARCADOR = process.env.GITHUB_RUN_ID
  ? `e2e-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}-`
  : `e2e-local-${randomUUID().slice(0, 8)}-`

/** Filtro de Prisma: sesiones de mesas de las marcas de esta corrida. */
const SESION_DE_LA_CORRIDA = { mesa: { restaurante: { marca: { slug: { startsWith: E2E_MARCADOR } } } } }

async function seedMesa(prisma: PrismaService, opts: { modoSesion?: string } = {}) {
  const marca = await prisma.marca.create({
    data: { nombre: 'E2E Test Marca', slug: `${E2E_MARCADOR}${Date.now()}-${Math.random()}` },
  })
  const restaurante = await prisma.restaurante.create({
    data: { nombre: 'E2E Restaurante', marcaId: marca.id, modoSesion: opts.modoSesion ?? 'abierto' },
  })
  const mesa = await prisma.mesa.create({
    data: { numero: '1', qrToken: `${E2E_MARCADOR}qr-${Date.now()}-${Math.random()}`, pin: '0001', restauranteId: restaurante.id },
  })
  return { marca, restaurante, mesa }
}

async function clearE2eData(prisma: PrismaService) {
  // 1. Lo que cuelga de las marcas de esta corrida
  const marcaIds = (await prisma.marca.findMany({
    where: { slug: { startsWith: E2E_MARCADOR } },
    select: { id: true },
  })).map((m) => m.id)
  const restauranteIds = (await prisma.restaurante.findMany({
    where: { marcaId: { in: marcaIds } },
    select: { id: true },
  })).map((r) => r.id)
  const mesaIds = (await prisma.mesa.findMany({
    where: { restauranteId: { in: restauranteIds } },
    select: { id: true },
  })).map((m) => m.id)
  const sesiones = await prisma.sesionMesa.findMany({
    where: { mesaId: { in: mesaIds } },
    select: { id: true, clienteId: true, participantes: { select: { clienteId: true } } },
  })
  const sesionIds = sesiones.map((s) => s.id)

  // 2. Clientes candidatos: los de esas sesiones (los invitados que crea /sessions/open) y los creados a mano
  //    con el marcador en el email
  const clientesConMarcador = (await prisma.cliente.findMany({
    where: { email: { startsWith: E2E_MARCADOR } },
    select: { id: true },
  })).map((c) => c.id)
  const clienteIds = [...new Set([
    ...sesiones.flatMap((s) => [s.clienteId, ...s.participantes.map((p) => p.clienteId)]),
    ...clientesConMarcador,
  ])].filter((id): id is string => id !== null)

  // 3. Borrar en orden de FK: SesionMesaCliente → SesionMesa → Cliente → Mesa → Restaurante → Marca
  await prisma.sesionMesaCliente.deleteMany({ where: { sesionId: { in: sesionIds } } })
  await prisma.sesionMesa.deleteMany({ where: { id: { in: sesionIds } } })
  // Un cliente se borra solo si ya no aparece en nada fuera de esta corrida
  await prisma.cliente.deleteMany({
    where: {
      id: { in: clienteIds },
      sesiones: { none: {} },
      sesionClientes: { none: {} },
      pedidoItems: { none: {} },
      comensales: { none: {} },
    },
  })
  await prisma.mesa.deleteMany({ where: { id: { in: mesaIds } } })
  await prisma.restaurante.deleteMany({ where: { id: { in: restauranteIds } } })
  await prisma.marca.deleteMany({ where: { id: { in: marcaIds } } })
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
      .send({ restauranteId: restaurante.id, pin: mesa.pin })

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
    const clientesAntes = await prisma.cliente.count()
    const res = await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({ tableCode: mesa.qrToken })

    expect(res.status).toBe(403)
    expect(res.body.message).toBe('Esta mesa requiere código de sesión para unirse')
    // El rechazo no deja un cliente invitado
    expect(await prisma.cliente.count()).toBe(clientesAntes)
  })

  it('modo seguro con código incorrecto → 403', async () => {
    const { mesa } = await seedMesa(prisma, { modoSesion: 'seguro' })

    await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({ tableCode: mesa.qrToken })

    const clientesAntes = await prisma.cliente.count()
    const res = await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({ tableCode: mesa.qrToken, codigoSesion: '000' })

    expect(res.status).toBe(403)
    // El rechazo no deja un cliente invitado
    expect(await prisma.cliente.count()).toBe(clientesAntes)
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

  // ── Sesión abierta por el staff (caracterización) ─────────────────────
  // La sesión se siembra como la deja POST /sessions/open-staff: activa, clienteId null y sin participantes.

  async function sesionDelStaff(mesa: { id: string }) {
    return prisma.sesionMesa.create({ data: { mesaId: mesa.id, clienteId: null, codigoSesion: '042' } })
  }

  it('sesión del staff en modo seguro: el primer cliente entra sin código como anfitrión y queda como participante 1', async () => {
    // Arrange
    const { mesa } = await seedMesa(prisma, { modoSesion: 'seguro' })
    const sesion = await sesionDelStaff(mesa)

    // Act
    const res = await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({ tableCode: mesa.qrToken })

    // Assert
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ sesionId: sesion.id, esAnfitrion: true, codigoSesion: '042' })
    const participantes = await prisma.sesionMesaCliente.findMany({ where: { sesionId: sesion.id } })
    expect(participantes).toEqual([expect.objectContaining({ clienteId: res.body.clienteId, orden: 1 })])
  })

  it('sesión del staff en modo seguro: el segundo cliente sin código → 403', async () => {
    // Arrange
    const { mesa } = await seedMesa(prisma, { modoSesion: 'seguro' })
    const sesion = await sesionDelStaff(mesa)
    await request(app.getHttpServer()).post('/api/sessions/open').send({ tableCode: mesa.qrToken })

    // Act
    const res = await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({ tableCode: mesa.qrToken })

    // Assert
    expect(res.status).toBe(403)
    expect(res.body.message).toBe('Esta mesa requiere código de sesión para unirse')
    expect(await prisma.sesionMesaCliente.count({ where: { sesionId: sesion.id } })).toBe(1)
  })

  it('sesión del staff en modo seguro: el segundo cliente con el código correcto entra sin ser anfitrión', async () => {
    // Arrange
    const { mesa } = await seedMesa(prisma, { modoSesion: 'seguro' })
    const sesion = await sesionDelStaff(mesa)
    await request(app.getHttpServer()).post('/api/sessions/open').send({ tableCode: mesa.qrToken })

    // Act
    const res = await request(app.getHttpServer())
      .post('/api/sessions/open')
      .send({ tableCode: mesa.qrToken, codigoSesion: '042' })

    // Assert
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ sesionId: sesion.id, esAnfitrion: false })
    expect(await prisma.sesionMesaCliente.count({ where: { sesionId: sesion.id } })).toBe(2)
  })

  // ── Idempotencia ──────────────────────────────────────────────────────

  it('mismo cliente llama open dos veces → no duplica SesionMesaCliente', async () => {
    const { mesa } = await seedMesa(prisma)
    const cliente = await prisma.cliente.create({
      data: { nombre: 'E2E Cliente', email: `${E2E_MARCADOR}idem@test.com` },
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

    const count = await prisma.sesionMesaCliente.count({ where: { sesion: SESION_DE_LA_CORRIDA } })
    expect(count).toBe(1)
  })

  // ── JWT reutiliza clienteId ───────────────────────────────────────────

  it('JWT válido en header → reutiliza clienteId, no crea invitado', async () => {
    const { mesa } = await seedMesa(prisma)
    const cliente = await prisma.cliente.create({
      data: { nombre: 'E2E Cliente JWT', email: `${E2E_MARCADOR}jwt@test.com` },
    })
    const token = testJwt.sign({ sub: cliente.id, tipo: 'cliente' })

    const res = await request(app.getHttpServer())
      .post('/api/sessions/open')
      .set('Authorization', `Bearer ${token}`)
      .send({ tableCode: mesa.qrToken })

    expect(res.status).toBe(200)
    expect(res.body.clienteId).toBe(cliente.id)

    // Solo el cliente que creamos — ningún invitado nuevo en las sesiones de esta corrida
    const totalClientes = await prisma.cliente.count({
      where: {
        OR: [
          { email: { startsWith: E2E_MARCADOR } },
          { sesiones: { some: SESION_DE_LA_CORRIDA } },
          { sesionClientes: { some: { sesion: SESION_DE_LA_CORRIDA } } },
        ],
      },
    })
    expect(totalClientes).toBe(1)
  })

  // ── Limpieza ──────────────────────────────────────────────────────────

  it('la limpieza no borra un comensal invitado ni una sesión que no son de la corrida', async () => {
    // Datos sin el marcador de la corrida: como los de una base de desarrollo o los de otra corrida
    const ajeno = `ajeno-${Date.now()}-${Math.random()}`
    const marca = await prisma.marca.create({ data: { nombre: 'Marca ajena', slug: ajeno } })
    const restaurante = await prisma.restaurante.create({ data: { nombre: 'Restaurante ajeno', marcaId: marca.id } })
    const mesa = await prisma.mesa.create({
      data: { numero: '1', qrToken: `qr-${ajeno}`, pin: '0002', restauranteId: restaurante.id },
    })
    const invitado = await prisma.cliente.create({ data: { nombre: 'Invitado ajeno' } })
    const sesion = await prisma.sesionMesa.create({
      data: { mesaId: mesa.id, clienteId: invitado.id, codigoSesion: '123' },
    })
    await prisma.sesionMesaCliente.create({ data: { sesionId: sesion.id, clienteId: invitado.id, orden: 1 } })

    try {
      await clearE2eData(prisma)

      expect(await prisma.cliente.findUnique({ where: { id: invitado.id } })).not.toBeNull()
      expect(await prisma.sesionMesa.findUnique({ where: { id: sesion.id } })).not.toBeNull()
      expect(await prisma.sesionMesaCliente.count({ where: { sesionId: sesion.id } })).toBe(1)
    } finally {
      await prisma.sesionMesaCliente.deleteMany({ where: { sesionId: sesion.id } })
      await prisma.sesionMesa.deleteMany({ where: { id: sesion.id } })
      await prisma.cliente.deleteMany({ where: { id: invitado.id } })
      await prisma.mesa.deleteMany({ where: { id: mesa.id } })
      await prisma.restaurante.deleteMany({ where: { id: restaurante.id } })
      await prisma.marca.deleteMany({ where: { id: marca.id } })
    }
  })
})
