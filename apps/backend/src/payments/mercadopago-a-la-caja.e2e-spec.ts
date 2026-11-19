import { randomUUID } from 'crypto'
import { JwtService } from '@nestjs/jwt'
import * as cajaDelCobroModulo from '../caja/caja-del-cobro'
import { MENSAJE_MP_NO_DISPONIBLE, MENSAJE_OPERACION_SIMULTANEA } from '../caja/conflictos'
import { ESTADO_PAGO_APROBADO, ESTADO_PAGO_CANCELADO, ESTADO_PAGO_PENDIENTE } from '../common/estado-pago.constant'
import {
  MOTIVO_REVISION_APROBADO_SIN_TURNO,
  MOTIVO_REVISION_APROBADO_SOBRE_CANCELADO,
  MOTIVO_REVISION_APROBADO_SOBRE_SESION_CERRADA,
} from '../common/motivo-revision.constant'
import { PrismaService } from '../prisma/prisma.service'
import { AppE2e, contar, contarReintentos, crearAppE2e, mostrarDistribucion } from '../test/app-e2e'
import { FixtureDeCaja, marcadorDeLaCorrida } from '../test/fixture-de-caja'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'
import { MercadoPagoProvider } from './providers/mercado-pago.provider'

// Los pagos de Mercado Pago del comensal van a una caja del turno abierto (#358): la preferencia
// (POST /payments/mercadopago/crear-preferencia, con el token de la mesa), el webhook, el resumen, requieren-revision y
// el cierre del turno, todo por HTTP contra Postgres (test/app-e2e.ts). Mercado Pago no se llama nunca: el provider es un
// doble, como en webhook.e2e-spec.ts, y el token del restaurante también.

/** Las rondas de la carrera libre (caso 8). E2E_RONDAS las cambia. */
const RONDAS = Number(process.env.E2E_RONDAS ?? 10)
/** Las rondas del entrelazado forzado (caso 9): es determinista, no necesita más. */
const RONDAS_ENTRELAZADAS = 3
const TOTAL = 1000
/** Cuántas veces reenvía el caso 8 una notificación que dio 500, como haría MP. */
const REENVIOS = 3

/** Una promesa que el test resuelve a mano, para forzar un orden sin sleeps. */
function senal() {
  let liberar!: () => void
  const promesa = new Promise<void>((resolve) => (liberar = resolve))
  return { promesa, liberar }
}

const declarado = (efectivo: number) => ({ efectivo, debito: 0, credito: 0, transferencia: 0 })

describe('Mercado Pago a la caja contra Postgres (e2e, #358)', () => {
  let api: AppE2e
  let prisma: PrismaService
  let fx: FixtureDeCaja
  let jwt: JwtService
  let marcaId = ''
  let owner = ''
  let reintentos: ReturnType<typeof contarReintentos>

  const mp = { processWebhook: jest.fn(), createPreference: jest.fn(), getPaymentStatus: jest.fn() }

  /** Un restaurante con una mesa y una sesión activa que consumió TOTAL. */
  async function restauranteConMesa() {
    const rest = await fx.restaurante(marcaId)
    const mesa = await fx.mesa(rest)
    const sesion = await fx.sesion(mesa.id)
    await fx.consumo(sesion, mesa.id, rest, TOTAL)
    return { rest, mesa, sesion }
  }

  /** Una caja con el `createdAt` y el id que se elijan, para fijar el orden de cajaDeMercadoPago. */
  async function cajaCon(restauranteId: string, nombre: string, datos: { id?: string; createdAt?: Date } = {}) {
    return (await prisma.caja.create({ data: { restauranteId, nombre, ...datos } })).id
  }

  const pendienteMp = (sesionId: string) =>
    fx.pago({ sesionId, turnoCajaId: null, metodo: 'mercadopago', estado: ESTADO_PAGO_PENDIENTE, monto: TOTAL })

  const pago = (id: string) => prisma.pago.findUniqueOrThrow({ where: { id } })
  const pagosDe = (sesionId: string) => prisma.pago.findMany({ where: { sesionId }, orderBy: { createdAt: 'asc' } })
  const estadoDeLaSesion = async (sesionId: string) => (await prisma.sesionMesa.findUniqueOrThrow({ where: { id: sesionId } })).estado

  function preferencia(rest: string, mesa: { id: string }, sesionId: string) {
    const token = jwt.sign({ sub: randomUUID(), tipo: 'cliente', sesionId, mesaId: mesa.id, restauranteId: rest })
    return api.pedir('post', '/payments/mercadopago/crear-preferencia', { body: { sesionId } }).set('Authorization', `Bearer ${token}`)
  }

  /** El doble de MP informa este pago con `status`, siempre con la misma orden. */
  function mpInforma(pagoId: string, status: string) {
    const orden = `mo-${randomUUID().slice(0, 8)}`
    mp.processWebhook.mockResolvedValue({ externalId: orden, status, externalReference: pagoId })
    return orden
  }

  const notificar = (rest: string, pagoId: string) =>
    api.pedir('post', `/payments/webhook/mercadopago/restaurante/${rest}/pago/${pagoId}`, {
      query: { type: 'payment', 'data.id': '123456' },
    })
  const cerrarTurno = (turnoId: string, cajas: { cajaId: string; declarado: ReturnType<typeof declarado> }[]) =>
    api.pedir('post', `/turnos/${turnoId}/cierre`, { usuarioId: owner, body: { cajas } })
  const requierenRevision = (rest: string) =>
    api.pedir('get', '/payments/requieren-revision', { usuarioId: owner, query: { restauranteId: rest } })

  /** El esperado de un método en el arqueo guardado, como texto de Postgres. */
  async function esperadoEnBase(turnoCajaId: string, metodo: string) {
    const [fila] = await prisma.$queryRaw<{ esperado: string }[]>`
      SELECT esperado::text AS esperado FROM arqueo_metodo WHERE turno_caja_id = ${turnoCajaId} AND metodo = ${metodo}`
    return fila?.esperado
  }

  /** Lo que importa de un pago aprobado por el webhook: su caja y su marca. */
  const cajaYMarca = (p: { estado: string; turnoCajaId: string | null; requiereRevision: boolean; motivoRevision: string | null }) => ({
    estado: p.estado,
    turnoCajaId: p.turnoCajaId,
    requiereRevision: p.requiereRevision,
    motivoRevision: p.motivoRevision,
  })
  const enLaCaja = (turnoCajaId: string) => ({ estado: ESTADO_PAGO_APROBADO, turnoCajaId, requiereRevision: false, motivoRevision: null })
  const sinTurno = { estado: ESTADO_PAGO_APROBADO, turnoCajaId: null, requiereRevision: true, motivoRevision: MOTIVO_REVISION_APROBADO_SIN_TURNO }

  beforeAll(async () => {
    api = await crearAppE2e({ reemplazos: [{ proveedor: MercadoPagoProvider, valor: mp }] })
    prisma = api.prisma
    jwt = api.obtener(JwtService)
    jest.spyOn(api.obtener(MercadoPagoOAuthService), 'getAccessTokenDecrypted').mockResolvedValue('token-e2e')
    fx = new FixtureDeCaja(prisma, marcadorDeLaCorrida('mp-caja'))
    marcaId = await fx.marca()
    owner = await fx.usuario('OWNER', { marcaId })
    reintentos = contarReintentos()
  })

  beforeEach(() => {
    for (const fn of Object.values(mp)) fn.mockReset()
    mp.processWebhook.mockRejectedValue(new Error('el doble de MP no tiene respuesta preparada'))
    mp.createPreference.mockResolvedValue({ id: 'pref-e2e', initPoint: 'https://mp.test/init' })
  })

  afterAll(async () => {
    if (reintentos) mostrarDistribucion(`[mp caja e2e] reintentos por P2034: ${JSON.stringify(reintentos.total)}`)
    jest.restoreAllMocks()
    try {
      if (fx) await fx.limpiar()
    } finally {
      if (api) await api.cerrar()
    }
  })

  it('1. con dos cajas abiertas, el pago va a la de Caja.createdAt más antigua (no a la abierta primero ni a la de menor id)', async () => {
    const { rest, mesa, sesion } = await restauranteConMesa()
    // La vieja tiene el id mayor y se abre después: solo el createdAt la elige.
    const vieja = await cajaCon(rest, 'Vieja', { id: `ffffffff-${randomUUID().slice(9)}`, createdAt: new Date('2020-01-01T00:00:00Z') })
    const nueva = await cajaCon(rest, 'Nueva', { id: `00000000-${randomUUID().slice(9)}` })
    const { aperturas } = await fx.turnoAbierto(rest, owner, [nueva, vieja])

    const pref = await preferencia(rest, mesa, sesion)
    expect([pref.status, pref.body]).toEqual([201, { initPoint: 'https://mp.test/init', preferenceId: 'pref-e2e' }])
    const [pendiente] = await pagosDe(sesion)
    expect(pendiente).toMatchObject({ estado: ESTADO_PAGO_PENDIENTE, turnoCajaId: null }) // la caja la pone el webhook
    mpInforma(pendiente.id, 'APROBADO')

    const res = await notificar(rest, pendiente.id)

    expect([res.status, res.text]).toEqual([200, 'OK'])
    expect(cajaYMarca(await pago(pendiente.id))).toEqual(enLaCaja(aperturas[vieja]))
    expect(await estadoDeLaSesion(sesion)).toBe('cerrada')
  })

  describe('2. sin turno abierto la preferencia da 400 con el mensaje del comensal, y no se escribe nada ni se llama a MP', () => {
    it.each([
      ['sin ningún turno', async (_rest: string) => undefined],
      [
        'con el turno cerrado',
        async (rest: string) => {
          await fx.turno(rest, owner, { cerrado: true, cajas: [{ cajaId: await fx.caja(rest), cerrada: true }] })
        },
      ],
    ])('%s', async (_caso, preparar) => {
      const { rest, mesa, sesion } = await restauranteConMesa()
      await preparar(rest)
      const anterior = await pendienteMp(sesion)
      const antes = await pagosDe(sesion)

      const res = await preferencia(rest, mesa, sesion)

      expect([res.status, res.body.message]).toEqual([400, MENSAJE_MP_NO_DISPONIBLE])
      expect(await pagosDe(sesion)).toEqual(antes) // el pendiente de antes sigue pendiente y no hay otro
      expect(antes).toEqual([expect.objectContaining({ id: anterior, estado: ESTADO_PAGO_PENDIENTE })])
      expect(mp.createPreference).not.toHaveBeenCalled()
      expect(await estadoDeLaSesion(sesion)).toBe('activa')
    })
  })

  it('3. el webhook sin turno abierto aprueba igual: sin caja, marcado "aprobado-sin-turno" y en requieren-revision', async () => {
    const { rest, mesa, sesion } = await restauranteConMesa()
    const p = await pendienteMp(sesion)
    const orden = mpInforma(p, 'APROBADO')

    const res = await notificar(rest, p)

    expect([res.status, res.text]).toEqual([200, 'OK'])
    const aprobado = await pago(p)
    expect(cajaYMarca(aprobado)).toEqual(sinTurno)
    expect(aprobado).toMatchObject({ referenciaExterna: orden })
    expect(aprobado.fechaCobro).not.toBeNull()
    // La plata entró: la sesión se cobró igual.
    expect(await estadoDeLaSesion(sesion)).toBe('cerrada')
    expect((await prisma.mesa.findUniqueOrThrow({ where: { id: mesa.id } })).estado).toBe('libre')

    const revision = await requierenRevision(rest)
    expect(revision.status).toBe(200)
    expect(revision.body).toEqual([
      expect.objectContaining({ pagoId: p, estado: ESTADO_PAGO_APROBADO, motivo: MOTIVO_REVISION_APROBADO_SIN_TURNO, monto: TOTAL }),
    ])
  })

  describe('4. las marcas no se pisan: queda la primera', () => {
    it('sin turno y con la sesión ya cerrada: "aprobado-sin-turno" (la de la sesión cerrada no la pisa)', async () => {
      const { rest, sesion } = await restauranteConMesa()
      const p = await pendienteMp(sesion)
      await prisma.sesionMesa.update({ where: { id: sesion }, data: { estado: 'cerrada', cerradaEn: new Date() } })
      mpInforma(p, 'APROBADO')

      expect((await notificar(rest, p)).status).toBe(200)

      expect(cajaYMarca(await pago(p))).toEqual(sinTurno)
    })

    it('con turno y con la sesión ya cerrada: va a la caja, marcado "aprobado-sobre-sesion-cerrada"', async () => {
      const { rest, sesion } = await restauranteConMesa()
      const caja = await fx.caja(rest)
      const { aperturas } = await fx.turnoAbierto(rest, owner, [caja])
      const p = await pendienteMp(sesion)
      await prisma.sesionMesa.update({ where: { id: sesion }, data: { estado: 'cerrada', cerradaEn: new Date() } })
      mpInforma(p, 'APROBADO')

      expect((await notificar(rest, p)).status).toBe(200)

      expect(cajaYMarca(await pago(p))).toEqual({
        estado: ESTADO_PAGO_APROBADO,
        turnoCajaId: aperturas[caja],
        requiereRevision: true,
        motivoRevision: MOTIVO_REVISION_APROBADO_SOBRE_SESION_CERRADA,
      })
    })

    it('un pago ya marcado antes conserva su motivo', async () => {
      const { rest, sesion } = await restauranteConMesa()
      const p = await fx.pago({ sesionId: sesion, turnoCajaId: null, metodo: 'mercadopago', estado: ESTADO_PAGO_PENDIENTE, monto: TOTAL })
      await prisma.pago.update({ where: { id: p }, data: { requiereRevision: true, motivoRevision: MOTIVO_REVISION_APROBADO_SOBRE_CANCELADO } })
      mpInforma(p, 'APROBADO')

      expect((await notificar(rest, p)).status).toBe(200)

      expect(cajaYMarca(await pago(p))).toEqual({ ...sinTurno, motivoRevision: MOTIVO_REVISION_APROBADO_SOBRE_CANCELADO })
    })
  })

  it('5. aprobado sobre un pago cancelado, con turno abierto: sigue cancelado y sin caja', async () => {
    const { rest, sesion } = await restauranteConMesa()
    await fx.turnoAbierto(rest, owner, [await fx.caja(rest)])
    const p = await fx.pago({ sesionId: sesion, turnoCajaId: null, metodo: 'mercadopago', estado: ESTADO_PAGO_CANCELADO, monto: TOTAL })
    mpInforma(p, 'APROBADO')

    expect((await notificar(rest, p)).status).toBe(200)

    expect(await pago(p)).toMatchObject({
      estado: ESTADO_PAGO_CANCELADO,
      turnoCajaId: null,
      requiereRevision: true,
      motivoRevision: MOTIVO_REVISION_APROBADO_SOBRE_CANCELADO,
      fechaCobro: null,
    })
  })

  it('6. el resumen trae los de las cajas del turno (aunque se cobraran fuera de su franja) y los sin caja de la franja', async () => {
    const { rest, sesion } = await restauranteConMesa()
    const [barra, salon, deAntes] = [await cajaCon(rest, 'Barra'), await cajaCon(rest, 'Salón'), await cajaCon(rest, 'De antes')]
    const anterior = await fx.turno(rest, owner, { cerrado: true, cajas: [{ cajaId: deAntes, cerrada: true }] })
    const { turnoId, aperturas } = await fx.turnoAbierto(rest, owner, [barra, salon])
    const { abiertoEn } = await prisma.turno.findUniqueOrThrow({ where: { id: turnoId } })
    const enLaFranja = new Date(abiertoEn.getTime() + 1)
    const fueraDeLaFranja = new Date(abiertoEn.getTime() - 24 * 3600 * 1000)
    const mpDirecto = (monto: number, fechaCobro: Date, turnoCajaId: string | null, sesionId = sesion) =>
      fx.pago({ sesionId, turnoCajaId, metodo: 'mercadopago', estado: ESTADO_PAGO_APROBADO, monto, fechaCobro })

    // Por el webhook: a Barra (la más antigua).
    const porWebhook = await pendienteMp(sesion)
    mpInforma(porWebhook, 'APROBADO')
    expect((await notificar(rest, porWebhook)).status).toBe(200)
    // Los que entran: en Salón cobrado fuera de la franja, y uno sin caja en la franja (de antes de #358).
    const salonFuera = await mpDirecto(20, fueraDeLaFranja, aperturas[salon])
    const sinCaja = await mpDirecto(30, enLaFranja, null)
    // Los que no: el de la caja del turno anterior (aunque la fecha caiga en la franja), uno sin caja fuera de la franja y
    // uno sin caja de otro restaurante.
    await mpDirecto(1, enLaFranja, anterior.aperturas[deAntes])
    await mpDirecto(2, fueraDeLaFranja, null)
    const ajeno = await restauranteConMesa()
    await mpDirecto(4, enLaFranja, null, ajeno.sesion)

    const res = await api.pedir('get', `/turnos/${turnoId}/resumen`, { usuarioId: owner })

    expect(res.status).toBe(200)
    expect(res.body.mercadoPago).toMatchObject({ cantidad: 3, monto: TOTAL + 50, propina: 0 })
    expect(res.body.mercadoPago.pagos.map((p: { id: string; cajaId: string | null; cajaNombre: string | null }) => [p.id, p.cajaId, p.cajaNombre])).toEqual([
      [salonFuera, salon, 'Salón'],
      [sinCaja, null, null],
      [porWebhook, barra, 'Barra'],
    ])
    // Siguen sin sumar a lo cobrado en las cajas.
    expect(res.body.total).toEqual({ cantidad: 0, monto: 0, propina: 0 })
  })

  it('7. un Mercado Pago en la caja no entra en el arqueo del cierre', async () => {
    const { rest, sesion } = await restauranteConMesa()
    const caja = await fx.caja(rest)
    const { turnoId, aperturas } = await fx.turnoAbierto(rest, owner, [caja], { fondoInicial: 100 })
    const p = await pendienteMp(sesion)
    mpInforma(p, 'APROBADO')
    expect((await notificar(rest, p)).status).toBe(200)
    expect((await pago(p)).turnoCajaId).toBe(aperturas[caja])

    const cierre = await cerrarTurno(turnoId, [{ cajaId: caja, declarado: declarado(100) }])

    expect(cierre.status).toBe(200)
    for (const [metodo, esperado] of [['efectivo', '100.00'], ['debito', '0.00'], ['credito', '0.00'], ['transferencia', '0.00']]) {
      expect(await esperadoEnBase(aperturas[caja], metodo)).toBe(esperado)
    }
    expect(await prisma.arqueoMetodo.count({ where: { turnoCajaId: aperturas[caja], metodo: 'mercadopago' } })).toBe(0)
  })

  /** Cómo terminó el cierre de una carrera: 'cerrado' (200) o 'simultaneo' (el 409 genérico, con el turno abierto). */
  async function comoTerminoElCierre(res: { status: number; body: { message?: unknown } }, turnoId: string) {
    if (res.status === 200) return 'cerrado' as const
    expect([res.status, res.body.message]).toEqual([409, MENSAJE_OPERACION_SIMULTANEA])
    expect((await prisma.turno.findUniqueOrThrow({ where: { id: turnoId } })).cerradoEn).toBeNull()
    return 'simultaneo' as const
  }

  it(
    `8. el webhook y el cierre del turno a la vez (${RONDAS} rondas): el pago queda en la caja del turno o sin caja y marcado, nunca a medias`,
    async () => {
      const porRonda: Record<string, number> = {}
      const antes = reintentos.foto()

      for (let ronda = 0; ronda < RONDAS; ronda++) {
        const { rest, sesion } = await restauranteConMesa()
        const caja = await fx.caja(rest)
        const { turnoId, aperturas } = await fx.turnoAbierto(rest, owner, [caja], { fondoInicial: 100 })
        const p = await pendienteMp(sesion)
        mpInforma(p, 'APROBADO')

        const [webhook, cierre] = await Promise.all([notificar(rest, p), cerrarTurno(turnoId, [{ cajaId: caja, declarado: declarado(100) }])])
        const comoCerro = await comoTerminoElCierre(cierre, turnoId)
        expect([200, 500]).toContain(webhook.status)
        // Un 500 es reintentable: MP reenvía la misma notificación.
        let reenvios = 0
        for (let ultimo = webhook.status; ultimo === 500 && reenvios < REENVIOS; reenvios++) {
          ultimo = (await notificar(rest, p)).status
          expect([200, 500]).toContain(ultimo)
        }
        if (comoCerro === 'simultaneo') {
          expect((await cerrarTurno(turnoId, [{ cajaId: caja, declarado: declarado(100) }])).status).toBe(200)
        }

        const final = cajaYMarca(await pago(p))
        const quedo = final.turnoCajaId ? 'en la caja' : 'sin turno'
        contar(porRonda, `webhook ${webhook.status}${reenvios ? ` (+${reenvios})` : ''} / cierre ${comoCerro} / ${quedo}`)
        expect(final).toEqual(final.turnoCajaId ? enLaCaja(aperturas[caja]) : sinTurno)
        // El efectivo esperado es el fondo: el MP no cuenta, esté o no en la caja.
        expect(await esperadoEnBase(aperturas[caja], 'efectivo')).toBe('100.00')
      }

      mostrarDistribucion(`[mp caja e2e] caso 8: ${JSON.stringify(porRonda)}; reintentos: ${reintentos.desde(antes)}`)
    },
    120_000,
  )

  it(
    `9. el webhook leyó la caja abierta, el cierre termina, y recién ahí sigue (${RONDAS_ENTRELAZADAS} rondas): un reintento, aprobado sin caja y marcado`,
    async () => {
      const porRonda: Record<string, number> = {}
      const real = cajaDelCobroModulo.cajaDeMercadoPago

      for (let ronda = 0; ronda < RONDAS_ENTRELAZADAS; ronda++) {
        const { rest, sesion } = await restauranteConMesa()
        const caja = await fx.caja(rest)
        const { turnoId, aperturas } = await fx.turnoAbierto(rest, owner, [caja], { fondoInicial: 100 })
        const p = await pendienteMp(sesion)
        mpInforma(p, 'APROBADO')
        const leyo = senal()
        const puedeSeguir = senal()
        let lecturas = 0
        // La lectura real de la caja, con una pausa después de la primera: el webhook ya la vio abierta y todavía no
        // escribió.
        const espia = jest.spyOn(cajaDelCobroModulo, 'cajaDeMercadoPago').mockImplementation(async (...args) => {
          const apertura = await real(...args)
          if (++lecturas === 1) {
            leyo.liberar()
            await puedeSeguir.promesa
          }
          return apertura
        })
        const antes = reintentos.foto()

        try {
          // supertest no manda el pedido hasta el then.
          const webhook = notificar(rest, p).then((r) => r)
          await leyo.promesa
          const cierre = await cerrarTurno(turnoId, [{ cajaId: caja, declarado: declarado(100) }])
          puedeSeguir.liberar()
          const res = await webhook
          const reintentosDelWebhook = (reintentos.total.procesarWebhookMercadoPago ?? 0) - (antes.procesarWebhookMercadoPago ?? 0)
          const final = cajaYMarca(await pago(p))
          contar(porRonda, `webhook ${res.status} / cierre ${cierre.status} / reintentos ${reintentosDelWebhook} / lecturas ${lecturas} / caja ${final.turnoCajaId ? 'sí' : 'no'}`)

          // El primer intento choca con el cierre (P2034) y el reintento ya no encuentra el turno abierto.
          expect({ cierre: cierre.status, webhook: res.status, reintentosDelWebhook, lecturas }).toEqual({
            cierre: 200,
            webhook: 200,
            reintentosDelWebhook: 1,
            lecturas: 2,
          })
          expect(final).toEqual(sinTurno)
          expect(await estadoDeLaSesion(sesion)).toBe('cerrada')
          expect(await esperadoEnBase(aperturas[caja], 'efectivo')).toBe('100.00')
        } finally {
          espia.mockRestore()
        }
      }

      mostrarDistribucion(`[mp caja e2e] caso 9: ${JSON.stringify(porRonda)}`)
    },
    60_000,
  )
})
