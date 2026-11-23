import { randomUUID } from 'crypto'
import { JwtService } from '@nestjs/jwt'
import { ESTADO_PAGO_APROBADO, ESTADO_PAGO_PENDIENTE } from '../common/estado-pago.constant'
import { MercadoPagoOAuthService } from '../payments/mercado-pago-oauth.service'
import { MercadoPagoProvider } from '../payments/providers/mercado-pago.provider'
import { PrismaService } from '../prisma/prisma.service'
import { AppE2e, crearAppE2e } from '../test/app-e2e'
import { FixtureDeCaja, marcadorDeLaCorrida } from '../test/fixture-de-caja'

// El ciclo de un turno con dos cajas (#361), todo por HTTP contra Postgres (test/app-e2e.ts): los cobros del personal
// repartidos entre las dos cajas, un Mercado Pago del comensal por el webhook, el resumen, el cierre con el esperado de
// cada caja, y la mesa que queda abierta y se cobra en el turno siguiente. Mercado Pago no se llama nunca: el provider es
// un doble, como en payments/mercadopago-a-la-caja.e2e-spec.ts. Solo el turno se inserta con el fixture.
//
// Los casos comparten el turno y van en orden: cada uno sigue donde dejó el anterior. Todos los esperados están
// calculados a mano en los comentarios.

const declarado = (efectivo: number, debito = 0, credito = 0, transferencia = 0) => ({ efectivo, debito, credito, transferencia })

describe('Ciclo de un turno con dos cajas contra Postgres (e2e, #361)', () => {
  let api: AppE2e
  let prisma: PrismaService
  let fx: FixtureDeCaja
  let jwt: JwtService
  let owner = ''

  const mp = { processWebhook: jest.fn(), createPreference: jest.fn(), getPaymentStatus: jest.fn() }

  // Lo que arma el beforeAll y usan los casos.
  let rest = ''
  let gerente = ''
  let ana = { usuarioId: '', mozoId: '' }
  let zoe = { usuarioId: '', mozoId: '' }
  let barra = ''
  let salon = ''
  let turno1 = { turnoId: '', aperturas: {} as Record<string, string> }
  let abiertoEn1 = new Date(0)
  const mesas = {} as Record<'m1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'm7', { mesa: { id: string; numero: string }; sesion: string }>
  let pagoMp = ''

  /** Una mesa con una sesión activa que consumió `total`. */
  async function mesaConConsumo(total: number, iniciadaEn?: Date) {
    const mesa = await fx.mesa(rest)
    const sesion = await fx.sesion(mesa.id, { iniciadaEn })
    await fx.consumo(sesion, mesa.id, rest, total)
    return { mesa, sesion }
  }

  const cobrar = (usuarioId: string, sesionId: string, body: object) =>
    api.pedir('patch', `/sessions/${sesionId}/cobro`, { usuarioId, body })
  function preferencia(mesa: { id: string }, sesionId: string) {
    const token = jwt.sign({ sub: randomUUID(), tipo: 'cliente', sesionId, mesaId: mesa.id, restauranteId: rest })
    return api.pedir('post', '/payments/mercadopago/crear-preferencia', { body: { sesionId } }).set('Authorization', `Bearer ${token}`)
  }
  const notificar = (pagoId: string) =>
    api.pedir('post', `/payments/webhook/mercadopago/restaurante/${rest}/pago/${pagoId}`, {
      query: { type: 'payment', 'data.id': '123456' },
    })
  const resumen = (turnoId: string) => api.pedir('get', `/turnos/${turnoId}/resumen`, { usuarioId: owner })
  const cerrarTurno = (turnoId: string, cajas: { cajaId: string; declarado: ReturnType<typeof declarado> }[]) =>
    api.pedir('post', `/turnos/${turnoId}/cierre`, { usuarioId: owner, body: { cajas } })

  const pagoDe = (sesionId: string) =>
    prisma.pago.findFirstOrThrow({ where: { sesionId, estado: ESTADO_PAGO_APROBADO }, select: { id: true, turnoCajaId: true, mozoId: true } })
  const estadoDeLaSesion = async (sesionId: string) => (await prisma.sesionMesa.findUniqueOrThrow({ where: { id: sesionId } })).estado

  /** El arqueo guardado de una apertura, por método: [esperado, declarado, diferencia] como texto de Postgres. */
  async function arqueoEnBase(turnoCajaId: string) {
    const filas = await prisma.$queryRaw<{ metodo: string; esperado: string; declarado: string; diferencia: string }[]>`
      SELECT metodo, esperado::text AS esperado, declarado::text AS declarado, diferencia::text AS diferencia
      FROM arqueo_metodo WHERE turno_caja_id = ${turnoCajaId} ORDER BY metodo`
    return Object.fromEntries(filas.map((f) => [f.metodo, [f.esperado, f.declarado, f.diferencia]]))
  }

  beforeAll(async () => {
    api = await crearAppE2e({ reemplazos: [{ proveedor: MercadoPagoProvider, valor: mp }] })
    prisma = api.prisma
    jwt = api.obtener(JwtService)
    jest.spyOn(api.obtener(MercadoPagoOAuthService), 'getAccessTokenDecrypted').mockResolvedValue('token-e2e')
    mp.createPreference.mockResolvedValue({ id: 'pref-e2e', initPoint: 'https://mp.test/init' })
    fx = new FixtureDeCaja(prisma, marcadorDeLaCorrida('ciclo'))
    const marcaId = await fx.marca()
    owner = await fx.usuario('OWNER', { marcaId })

    rest = await fx.restaurante(marcaId)
    gerente = await fx.usuario('GERENTE', { restauranteId: rest })
    ana = await fx.personalConPerfil('MOZO', rest, { nombre: 'Ana' })
    zoe = await fx.personalConPerfil('MOZO', rest, { nombre: 'Zoe' })
    // Barra es la más antigua: ahí va el Mercado Pago del webhook.
    barra = (await prisma.caja.create({ data: { restauranteId: rest, nombre: 'Barra', createdAt: new Date('2026-01-01T00:00:00Z') } })).id
    salon = (await prisma.caja.create({ data: { restauranteId: rest, nombre: 'Salón', createdAt: new Date('2026-01-02T00:00:00Z') } })).id
    // Salón primero en la lista: la caja del webhook es la más antigua, no la primera que se abrió.
    turno1 = await fx.turno(rest, owner, {
      cajas: [
        { cajaId: salon, fondoInicial: 10000 },
        { cajaId: barra, fondoInicial: 5000 },
      ],
    })
    abiertoEn1 = (await prisma.turno.findUniqueOrThrow({ where: { id: turno1.turnoId } })).abiertoEn

    mesas.m1 = await mesaConConsumo(4000)
    mesas.m2 = await mesaConConsumo(3000)
    mesas.m3 = await mesaConConsumo(2500)
    mesas.m4 = await mesaConConsumo(1200)
    mesas.m5 = await mesaConConsumo(1800)
    mesas.m6 = await mesaConConsumo(700, new Date('2026-11-21T12:00:00Z'))
    mesas.m7 = await mesaConConsumo(1500)
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    try {
      if (fx) await fx.limpiar()
    } finally {
      if (api) await api.cerrar()
    }
  })

  it('1. cada cobro del personal va a la caja indicada, y el Mercado Pago del webhook a la más antigua (Barra)', async () => {
    // Con dos cajas abiertas, cada cobro indica la suya.
    expect((await cobrar(ana.usuarioId, mesas.m1.sesion, { metodoPago: 'efectivo', cajaId: barra, propina: 400 })).status).toBe(200)
    expect((await cobrar(zoe.usuarioId, mesas.m2.sesion, { metodoPago: 'debito', cajaId: salon, propina: 300 })).status).toBe(200)
    // El GERENTE cobra a nombre de Zoe.
    expect((await cobrar(gerente, mesas.m3.sesion, { metodoPago: 'credito', cajaId: salon, mozoId: zoe.mozoId })).status).toBe(200)
    expect((await cobrar(ana.usuarioId, mesas.m4.sesion, { metodoPago: 'transferencia', cajaId: barra, propina: 120 })).status).toBe(200)
    expect((await cobrar(zoe.usuarioId, mesas.m7.sesion, { metodoPago: 'efectivo', cajaId: salon, propina: 150 })).status).toBe(200)

    // El comensal de la mesa 5 paga con Mercado Pago: la preferencia por 1800 y el webhook que la aprueba.
    expect((await preferencia(mesas.m5.mesa, mesas.m5.sesion)).status).toBe(201)
    const pendiente = await prisma.pago.findFirstOrThrow({
      where: { sesionId: mesas.m5.sesion, metodo: 'mercadopago', estado: ESTADO_PAGO_PENDIENTE },
    })
    pagoMp = pendiente.id
    expect(pendiente.monto.toString()).toBe('1800')
    mp.processWebhook.mockResolvedValue({ externalId: `mo-${randomUUID().slice(0, 8)}`, status: 'APROBADO', externalReference: pagoMp })
    expect((await notificar(pagoMp)).status).toBe(200)

    const B = turno1.aperturas[barra]
    const S = turno1.aperturas[salon]
    expect(await pagoDe(mesas.m1.sesion)).toMatchObject({ turnoCajaId: B, mozoId: ana.mozoId })
    expect(await pagoDe(mesas.m2.sesion)).toMatchObject({ turnoCajaId: S, mozoId: zoe.mozoId })
    expect(await pagoDe(mesas.m3.sesion)).toMatchObject({ turnoCajaId: S, mozoId: zoe.mozoId })
    expect(await pagoDe(mesas.m4.sesion)).toMatchObject({ turnoCajaId: B, mozoId: ana.mozoId })
    expect(await pagoDe(mesas.m7.sesion)).toMatchObject({ turnoCajaId: S, mozoId: zoe.mozoId })
    expect(await pagoDe(mesas.m5.sesion)).toMatchObject({ id: pagoMp, turnoCajaId: B, mozoId: null })
    for (const m of ['m1', 'm2', 'm3', 'm4', 'm5', 'm7'] as const) expect(await estadoDeLaSesion(mesas[m].sesion)).toBe('cerrada')
    expect(await estadoDeLaSesion(mesas.m6.sesion)).toBe('activa')
  })

  it('2. el resumen del turno abierto: por método, por mozo, el total y Mercado Pago aparte', async () => {
    const res = await resumen(turno1.turnoId)

    expect(res.status).toBe(200)
    // Efectivo: 4000 (Ana, propina 400) + 1500 (Zoe, propina 150). Débito 3000 (300). Crédito 2500 (0). Transferencia
    // 1200 (120). Mercado Pago no entra.
    expect(res.body.porMetodo).toEqual([
      { metodo: 'efectivo', cantidad: 2, monto: 5500, propina: 550 },
      { metodo: 'debito', cantidad: 1, monto: 3000, propina: 300 },
      { metodo: 'credito', cantidad: 1, monto: 2500, propina: 0 },
      { metodo: 'transferencia', cantidad: 1, monto: 1200, propina: 120 },
    ])
    // Ana: 4000 + 1200 y 400 + 120. Zoe: 3000 + 2500 (el del GERENTE a su nombre) + 1500 y 300 + 0 + 150.
    expect(res.body.porMozo).toEqual([
      { mozoId: ana.mozoId, mozoNombre: 'Ana', cantidad: 2, monto: 5200, propina: 520 },
      { mozoId: zoe.mozoId, mozoNombre: 'Zoe', cantidad: 3, monto: 7000, propina: 450 },
    ])
    expect(res.body.total).toEqual({ cantidad: 5, monto: 12200, propina: 970 })
    expect(res.body.mercadoPago).toMatchObject({ desde: abiertoEn1.toISOString(), cantidad: 1, monto: 1800, propina: 0 })
    expect(res.body.mercadoPago.pagos).toEqual([
      {
        id: pagoMp,
        mesaNumero: mesas.m5.mesa.numero,
        cajaId: barra,
        cajaNombre: 'Barra',
        monto: 1800,
        propina: 0,
        fechaCobro: expect.any(String),
        requiereRevision: false,
      },
    ])
  })

  it('3. el cierre: el esperado exacto de cada caja (sin Mercado Pago) y el aviso de la mesa que queda abierta', async () => {
    // Barra: efectivo 5000 + 4000 + 400 = 9400; transferencia 1200 + 120 = 1320; el Mercado Pago de 1800 no cuenta.
    // Salón: efectivo 10000 + 1500 + 150 = 11650; débito 3000 + 300 = 3300; crédito 2500.
    // Se declara 50 de menos en el efectivo del Salón.
    const res = await cerrarTurno(turno1.turnoId, [
      { cajaId: barra, declarado: declarado(9400, 0, 0, 1320) },
      { cajaId: salon, declarado: declarado(11600, 3300, 2500, 0) },
    ])

    expect(res.status).toBe(200)
    expect(res.body.arqueos).toEqual([
      {
        cajaId: barra,
        cajaNombre: 'Barra',
        fondoInicial: 5000,
        metodos: [
          { metodo: 'efectivo', esperado: 9400, declarado: 9400, diferencia: 0 },
          { metodo: 'debito', esperado: 0, declarado: 0, diferencia: 0 },
          { metodo: 'credito', esperado: 0, declarado: 0, diferencia: 0 },
          { metodo: 'transferencia', esperado: 1320, declarado: 1320, diferencia: 0 },
        ],
      },
      {
        cajaId: salon,
        cajaNombre: 'Salón',
        fondoInicial: 10000,
        metodos: [
          { metodo: 'efectivo', esperado: 11650, declarado: 11600, diferencia: -50 },
          { metodo: 'debito', esperado: 3300, declarado: 3300, diferencia: 0 },
          { metodo: 'credito', esperado: 2500, declarado: 2500, diferencia: 0 },
          { metodo: 'transferencia', esperado: 0, declarado: 0, diferencia: 0 },
        ],
      },
    ])
    expect(await arqueoEnBase(turno1.aperturas[barra])).toEqual({
      credito: ['0.00', '0.00', '0.00'],
      debito: ['0.00', '0.00', '0.00'],
      efectivo: ['9400.00', '9400.00', '0.00'],
      transferencia: ['1320.00', '1320.00', '0.00'],
    })
    expect(await arqueoEnBase(turno1.aperturas[salon])).toEqual({
      credito: ['2500.00', '2500.00', '0.00'],
      debito: ['3300.00', '3300.00', '0.00'],
      efectivo: ['11650.00', '11600.00', '-50.00'],
      transferencia: ['0.00', '0.00', '0.00'],
    })
    expect(res.body.avisos.mesasAbiertas).toEqual([
      { mesaId: mesas.m6.mesa.id, mesaNumero: mesas.m6.mesa.numero, iniciadaEn: '2026-11-21T12:00:00.000Z' },
    ])
  })

  it('4. la mesa que quedó abierta se cobra en el turno siguiente: va a su caja y no cambia el turno cerrado', async () => {
    const turno2 = await fx.turnoAbierto(rest, owner, [salon])

    // Una sola caja abierta: el cobro va ahí sin indicarla.
    expect((await cobrar(ana.usuarioId, mesas.m6.sesion, { metodoPago: 'efectivo' })).status).toBe(200)
    expect(await pagoDe(mesas.m6.sesion)).toMatchObject({ turnoCajaId: turno2.aperturas[salon], mozoId: ana.mozoId })
    expect(await estadoDeLaSesion(mesas.m6.sesion)).toBe('cerrada')

    const nuevo = await resumen(turno2.turnoId)
    expect(nuevo.body.total).toEqual({ cantidad: 1, monto: 700, propina: 0 })
    expect(nuevo.body.porMozo).toEqual([{ mozoId: ana.mozoId, mozoNombre: 'Ana', cantidad: 1, monto: 700, propina: 0 }])

    // El turno 1 sigue igual: los mismos 5 cobros y el mismo arqueo del Salón.
    const anterior = await resumen(turno1.turnoId)
    expect(anterior.body.total).toEqual({ cantidad: 5, monto: 12200, propina: 970 })
    expect(anterior.body.mercadoPago).toMatchObject({ cantidad: 1, monto: 1800 })
    expect((await arqueoEnBase(turno1.aperturas[salon])).efectivo).toEqual(['11650.00', '11600.00', '-50.00'])
  })
})
