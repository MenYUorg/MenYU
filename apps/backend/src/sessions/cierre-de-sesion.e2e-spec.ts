import 'reflect-metadata'
import { randomUUID } from 'crypto'
import { BadRequestException, ConflictException, INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AppModule } from '../app.module'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { cerrarSesionDeMesa } from '../common/cerrar-sesion-de-mesa'
import { ESTADO_PAGO_APROBADO, ESTADO_PAGO_CANCELADO, ESTADO_PAGO_PENDIENTE } from '../common/estado-pago.constant'
import { PaymentsService } from '../payments/payments.service'
import { PrismaService } from '../prisma/prisma.service'
import { SessionsService } from './sessions.service'

// El cierre único de una sesión de mesa (cerrarSesionDeMesa) contra la base real: el helper, el cierre a mano y los
// cobros sobre una sesión ya cerrada, incluido el estado que dejaba el código anterior (una sesión cerrada con un
// efectivo pendiente y la mesa con otra sesión abierta). Los servicios se llaman directo desde el módulo, con un OWNER
// de prueba: el permiso lo decide AccesoService con la base, sin token.
//
// Todo lo que crea esta corrida lleva su marcador (en el slug de la marca y en el email del usuario), como en
// sessions.e2e-spec.ts: la limpieza borra solo eso y lo que cuelga de esa marca.

const E2E_MARCADOR = process.env.GITHUB_RUN_ID
  ? `e2e-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}-cierre-`
  : `e2e-local-${randomUUID().slice(0, 8)}-cierre-`

const DE_LA_CORRIDA = { mesa: { restaurante: { marca: { slug: { startsWith: E2E_MARCADOR } } } } }

describe('Cierre de una sesión de mesa (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let sessions: SessionsService
  let payments: PaymentsService

  let restauranteId = ''
  let itemId = ''
  let owner: UsuarioAutenticado
  let mesas = 0

  async function crearMesa(estado: 'libre' | 'ocupada' = 'ocupada') {
    mesas += 1
    return prisma.mesa.create({
      data: {
        numero: String(mesas),
        qrToken: `${E2E_MARCADOR}qr-${randomUUID()}`,
        pin: String(mesas).padStart(4, '0'),
        restauranteId,
        estado,
      },
    })
  }

  /** Una sesión con un pedido de `total` (un ítem). */
  async function crearSesion(mesaId: string, total: number, cerradaEn: Date | null = null) {
    const sesion = await prisma.sesionMesa.create({
      data: { mesaId, codigoSesion: '001', estado: cerradaEn ? 'cerrada' : 'activa', cerradaEn },
    })
    await prisma.pedido.create({
      data: { sesionId: sesion.id, mesaId, items: { create: [{ itemId, cantidad: 1, precioUnitario: total }] } },
    })
    return sesion
  }

  function crearPago(sesionId: string, metodo: 'efectivo' | 'mercadopago', estado: string, monto: number) {
    return prisma.pago.create({ data: { sesionId, metodo, estado, monto } })
  }

  const estadoDe = async (pagoId: string) => (await prisma.pago.findUniqueOrThrow({ where: { id: pagoId } })).estado
  const sesion = (id: string) => prisma.sesionMesa.findUniqueOrThrow({ where: { id } })
  const mesa = (id: string) => prisma.mesa.findUniqueOrThrow({ where: { id } })

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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    // init y no listen: el gateway necesita su server para los emit, pero acá nadie se conecta.
    await app.init()
    prisma = moduleRef.get(PrismaService)
    sessions = moduleRef.get(SessionsService)
    payments = moduleRef.get(PaymentsService)

    const marca = await prisma.marca.create({ data: { nombre: 'E2E Cierre', slug: `${E2E_MARCADOR}${randomUUID()}` } })
    restauranteId = (await prisma.restaurante.create({ data: { nombre: 'E2E Cierre 1', marcaId: marca.id } })).id
    itemId = (await prisma.itemMenu.create({ data: { restauranteId, nombre: 'Plato', precioBase: 1000 } })).id
    const usuario = await prisma.usuario.create({
      data: { supabaseUserId: randomUUID(), email: `${E2E_MARCADOR}owner@menyu.test`, nombre: 'Owner E2E' },
    })
    await prisma.membresia.create({ data: { usuarioId: usuario.id, rol: 'OWNER', marcaId: marca.id } })
    owner = { id: usuario.id, supabaseUserId: usuario.supabaseUserId, email: usuario.email, nombre: usuario.nombre, esRoot: false }
  })

  afterAll(async () => {
    if (prisma) await limpiar()
    if (app) await app.close()
  })

  it('a) el helper cierra una sesión activa, cancela sus tres pendientes, no toca el aprobado y libera la mesa; la segunda vez no cambia nada', async () => {
    const m = await crearMesa()
    const s = await crearSesion(m.id, 1000)
    const aprobado = await crearPago(s.id, 'mercadopago', ESTADO_PAGO_APROBADO, 1000)
    const pendientes = [
      await crearPago(s.id, 'efectivo', ESTADO_PAGO_PENDIENTE, 400),
      await crearPago(s.id, 'efectivo', ESTADO_PAGO_PENDIENTE, 300),
      await crearPago(s.id, 'mercadopago', ESTADO_PAGO_PENDIENTE, 300),
    ]
    const cerradaEn = new Date('2026-11-03T20:00:00.000Z')

    await expect(prisma.$transaction((tx) => cerrarSesionDeMesa(tx, s.id, m.id, cerradaEn))).resolves.toBe(true)

    expect(await sesion(s.id)).toMatchObject({ estado: 'cerrada', cerradaEn })
    expect((await mesa(m.id)).estado).toBe('libre')
    for (const p of pendientes) expect(await estadoDe(p.id)).toBe(ESTADO_PAGO_CANCELADO)
    expect(await estadoDe(aprobado.id)).toBe(ESTADO_PAGO_APROBADO)

    // La mesa ya tiene otra sesión (ocupada) y a la cerrada le quedó un pendiente: la segunda llamada no toca nada.
    await prisma.mesa.update({ where: { id: m.id }, data: { estado: 'ocupada' } })
    const tardio = await crearPago(s.id, 'efectivo', ESTADO_PAGO_PENDIENTE, 100)

    await expect(
      prisma.$transaction((tx) => cerrarSesionDeMesa(tx, s.id, m.id, new Date('2026-11-03T23:00:00.000Z'))),
    ).resolves.toBe(false)

    expect(await sesion(s.id)).toMatchObject({ estado: 'cerrada', cerradaEn })
    expect((await mesa(m.id)).estado).toBe('ocupada')
    expect(await estadoDe(tardio.id)).toBe(ESTADO_PAGO_PENDIENTE)
  })

  it('b) cerrarMesaAdmin cancela los pendientes en la base y libera la mesa; después confirmarEfectivo da 409 y la sesión no cambia', async () => {
    const m = await crearMesa()
    const s = await crearSesion(m.id, 1000)
    const efectivo = await crearPago(s.id, 'efectivo', ESTADO_PAGO_PENDIENTE, 1000)
    const mp = await crearPago(s.id, 'mercadopago', ESTADO_PAGO_PENDIENTE, 1000)

    await expect(sessions.cerrarMesaAdmin(m.id, owner)).resolves.toEqual({ ok: true })

    const cerrada = await sesion(s.id)
    expect(cerrada.estado).toBe('cerrada')
    expect(cerrada.cerradaEn).not.toBeNull()
    expect((await mesa(m.id)).estado).toBe('libre')
    expect(await estadoDe(efectivo.id)).toBe(ESTADO_PAGO_CANCELADO)
    expect(await estadoDe(mp.id)).toBe(ESTADO_PAGO_CANCELADO)

    await expect(payments.confirmarEfectivo({ pagoId: efectivo.id }, owner)).rejects.toThrow(
      new ConflictException('Ese pago ya no está pendiente'),
    )

    expect(await sesion(s.id)).toMatchObject({ estado: 'cerrada', cerradaEn: cerrada.cerradaEn })
    expect(await estadoDe(efectivo.id)).toBe(ESTADO_PAGO_CANCELADO)
    expect((await mesa(m.id)).estado).toBe('libre')
  })

  describe('estado heredado: una sesión vieja cerrada con un efectivo pendiente y la mesa con una sesión nueva', () => {
    const CERRADA_EN = new Date('2026-11-02T22:00:00.000Z')

    async function mesaConSesionNueva() {
      const m = await crearMesa('ocupada')
      const vieja = await crearSesion(m.id, 1000, CERRADA_EN)
      const pagoViejo = await crearPago(vieja.id, 'efectivo', ESTADO_PAGO_PENDIENTE, 1000)
      const nueva = await crearSesion(m.id, 2000)
      return { m, vieja, pagoViejo, nueva }
    }

    async function nadaCambio({ m, vieja, pagoViejo, nueva }: Awaited<ReturnType<typeof mesaConSesionNueva>>) {
      expect(await prisma.pago.findUniqueOrThrow({ where: { id: pagoViejo.id } })).toMatchObject({
        estado: ESTADO_PAGO_PENDIENTE,
        fechaCobro: null,
        usuarioId: null,
      })
      expect(await prisma.pago.count({ where: { sesionId: vieja.id } })).toBe(1)
      expect(await sesion(vieja.id)).toMatchObject({ estado: 'cerrada', cerradaEn: CERRADA_EN })
      expect(await sesion(nueva.id)).toMatchObject({ estado: 'activa', cerradaEn: null })
      expect(await prisma.pago.count({ where: { sesionId: nueva.id } })).toBe(0)
      expect((await mesa(m.id)).estado).toBe('ocupada')
    }

    it('c) confirmarEfectivo del pago viejo: 409 "La sesión ya no está activa", y no libera la mesa ni toca la sesión nueva', async () => {
      const mundo = await mesaConSesionNueva()

      await expect(payments.confirmarEfectivo({ pagoId: mundo.pagoViejo.id }, owner)).rejects.toThrow(
        new ConflictException('La sesión ya no está activa'),
      )

      await nadaCambio(mundo)
    })

    it('d) registrarCobro de la sesión vieja: 400 y no se crea ni se aprueba ningún pago', async () => {
      const mundo = await mesaConSesionNueva()

      await expect(sessions.registrarCobro(mundo.vieja.id, { metodoPago: 'efectivo' }, owner)).rejects.toThrow(
        new BadRequestException('La sesión ya fue cerrada'),
      )

      await nadaCambio(mundo)
    })
  })

  it('e) registrarCobro con dos efectivos pendientes: reutiliza y aprueba uno, el otro queda cancelado, la sesión se cierra y la mesa queda libre', async () => {
    const m = await crearMesa()
    const s = await crearSesion(m.id, 1000)
    const efectivos = [
      await crearPago(s.id, 'efectivo', ESTADO_PAGO_PENDIENTE, 1000),
      await crearPago(s.id, 'efectivo', ESTADO_PAGO_PENDIENTE, 1000),
    ]

    await expect(sessions.registrarCobro(s.id, { metodoPago: 'efectivo' }, owner)).resolves.toEqual({ ok: true })

    // findFirst no ordena: cuál de los dos se reutiliza no está fijado, pero tiene que ser exactamente uno.
    const pagos = await prisma.pago.findMany({ where: { sesionId: s.id } })
    expect(pagos).toHaveLength(2) // no se creó ninguno
    const aprobados = pagos.filter((p) => p.estado === ESTADO_PAGO_APROBADO)
    const cancelados = pagos.filter((p) => p.estado === ESTADO_PAGO_CANCELADO)
    expect(aprobados).toHaveLength(1)
    expect(cancelados).toHaveLength(1)
    expect(efectivos.map((p) => p.id)).toEqual(expect.arrayContaining([aprobados[0].id, cancelados[0].id]))
    expect(aprobados[0]).toMatchObject({ usuarioId: owner.id, mozoId: null })
    expect(Number(aprobados[0].monto)).toBe(1000)

    const cerrada = await sesion(s.id)
    expect(cerrada.estado).toBe('cerrada')
    expect(cerrada.cerradaEn).toEqual(aprobados[0].fechaCobro)
    expect((await mesa(m.id)).estado).toBe('libre')
  })
})
