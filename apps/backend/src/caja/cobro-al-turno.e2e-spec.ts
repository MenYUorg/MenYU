import { randomUUID } from 'crypto'
import { JwtService } from '@nestjs/jwt'
import * as cajaDelCobroModulo from './caja-del-cobro'
import { ESTADO_PAGO_APROBADO, ESTADO_PAGO_CANCELADO, ESTADO_PAGO_PENDIENTE } from '../common/estado-pago.constant'
import { PrismaService } from '../prisma/prisma.service'
import { AppE2e, contar, contarReintentos, crearAppE2e, mostrarDistribucion } from '../test/app-e2e'
import { FixtureDeCaja, marcadorDeLaCorrida } from '../test/fixture-de-caja'
import { MENSAJE_ELEGIR_CAJA, MENSAJE_OPERACION_SIMULTANEA, MENSAJE_SIN_TURNO } from './conflictos'
import { MENSAJE_CAJA_NO_ABIERTA } from './movimientos.service'

// Los cobros del personal van a una caja del turno abierto (#358): PATCH /sessions/:id/cobro y POST
// /payments/confirmar-efectivo por HTTP, contra Postgres, con los guards y el ValidationPipe reales (test/app-e2e.ts).
// Los turnos se insertan con el fixture (también los dos estados que el cierre real nunca deja, para probar cada filtro
// de cajaDelCobro); el cierre del turno va por HTTP, para ver el pago en el arqueo.

/** Las rondas de la carrera libre (caso 9). E2E_RONDAS las cambia. */
const RONDAS = Number(process.env.E2E_RONDAS ?? 10)
/** Las rondas de los entrelazados forzados (caso 10): son deterministas, no necesitan más. */
const RONDAS_ENTRELAZADAS = 3
const TOTAL = 1000

/** Una promesa que el test resuelve a mano, para forzar un orden sin sleeps. */
function senal() {
  let liberar!: () => void
  const promesa = new Promise<void>((resolve) => (liberar = resolve))
  return { promesa, liberar }
}

const declarado = (efectivo: number, debito = 0, credito = 0, transferencia = 0) => ({ efectivo, debito, credito, transferencia })

describe('Cobros al turno contra Postgres (e2e, #358)', () => {
  let api: AppE2e
  let prisma: PrismaService
  let fx: FixtureDeCaja
  let jwt: JwtService
  let marcaId = ''
  let owner = ''
  let reintentos: ReturnType<typeof contarReintentos>

  /** Un restaurante con un mozo (con su cuenta) y una mesa con una sesión activa que consumió TOTAL. */
  async function restauranteConMesa() {
    const rest = await fx.restaurante(marcaId)
    const mozo = await fx.personalConPerfil('MOZO', rest, { nombre: 'Ana' })
    const mesa = await fx.mesa(rest)
    const sesion = await fx.sesion(mesa.id)
    await fx.consumo(sesion, mesa.id, rest, TOTAL)
    return { rest, mozo, mesa, sesion }
  }

  /** Otra sesión activa con consumo en una mesa nueva del mismo restaurante. */
  async function otraSesion(rest: string) {
    const mesa = await fx.mesa(rest)
    const sesion = await fx.sesion(mesa.id)
    await fx.consumo(sesion, mesa.id, rest, TOTAL)
    return sesion
  }

  const cobrar = (usuarioId: string, sesionId: string, body: object = {}) =>
    api.pedir('patch', `/sessions/${sesionId}/cobro`, { usuarioId, body: { metodoPago: 'efectivo', ...body } })
  const confirmar = (usuarioId: string, pagoId: string, body: object = {}) =>
    api.pedir('post', '/payments/confirmar-efectivo', { usuarioId, body: { pagoId, ...body } })
  const cerrarTurno = (turnoId: string, cajas: { cajaId: string; declarado: ReturnType<typeof declarado> }[]) =>
    api.pedir('post', `/turnos/${turnoId}/cierre`, { usuarioId: owner, body: { cajas } })
  /** El comensal pide pagar en efectivo, con el token de su mesa: el pago pendiente queda con el saldo de ese momento. */
  function pedirEfectivo(rest: string, mesa: { id: string }, sesionId: string) {
    const token = jwt.sign({ sub: randomUUID(), tipo: 'cliente', sesionId, mesaId: mesa.id, restauranteId: rest })
    return api.pedir('post', '/payments/solicitar-efectivo', { body: { sesionId } }).set('Authorization', `Bearer ${token}`)
  }

  const pagosDe = (sesionId: string) =>
    prisma.pago.findMany({ where: { sesionId }, select: { id: true, estado: true, metodo: true, monto: true, propina: true, turnoCajaId: true } })
  const aprobadosDe = async (sesionId: string) => (await pagosDe(sesionId)).filter((p) => p.estado === ESTADO_PAGO_APROBADO)
  const estadoDeLaSesion = async (sesionId: string) => (await prisma.sesionMesa.findUniqueOrThrow({ where: { id: sesionId } })).estado

  /** El esperado de un método en el arqueo guardado, como texto de Postgres. */
  async function esperadoEnBase(turnoCajaId: string, metodo: string) {
    const [fila] = await prisma.$queryRaw<{ esperado: string }[]>`
      SELECT esperado::text AS esperado FROM arqueo_metodo WHERE turno_caja_id = ${turnoCajaId} AND metodo = ${metodo}`
    return fila?.esperado
  }

  beforeAll(async () => {
    api = await crearAppE2e()
    prisma = api.prisma
    jwt = api.obtener(JwtService)
    fx = new FixtureDeCaja(prisma, marcadorDeLaCorrida('cobro'))
    marcaId = await fx.marca()
    owner = await fx.usuario('OWNER', { marcaId })
    reintentos = contarReintentos()
  })

  afterAll(async () => {
    if (reintentos) mostrarDistribucion(`[cobro e2e] reintentos por P2034: ${JSON.stringify(reintentos.total)}`)
    jest.restoreAllMocks()
    try {
      if (fx) await fx.limpiar()
    } finally {
      if (api) await api.cerrar()
    }
  })

  describe('1. sin turno abierto no se cobra: 400 y no se escribe nada', () => {
    it('PATCH /sessions/:id/cobro: ni el pago, ni la cancelación de un MP pendiente, ni el cierre de la sesión', async () => {
      const { mozo, sesion } = await restauranteConMesa()
      const mp = await fx.pago({ sesionId: sesion, turnoCajaId: null, metodo: 'mercadopago', estado: ESTADO_PAGO_PENDIENTE, monto: TOTAL })

      const res = await cobrar(mozo.usuarioId, sesion, { confirmarCancelacionPagosPendientes: true })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe(MENSAJE_SIN_TURNO)
      expect(await pagosDe(sesion)).toEqual([expect.objectContaining({ id: mp, estado: ESTADO_PAGO_PENDIENTE })])
      expect(await estadoDeLaSesion(sesion)).toBe('activa')
    })

    it('POST /payments/confirmar-efectivo: el efectivo sigue pendiente', async () => {
      const { mozo, sesion } = await restauranteConMesa()
      const efectivo = await fx.pago({ sesionId: sesion, turnoCajaId: null, metodo: 'efectivo', estado: ESTADO_PAGO_PENDIENTE, monto: TOTAL })

      const res = await confirmar(mozo.usuarioId, efectivo)

      expect(res.status).toBe(400)
      expect(res.body.message).toBe(MENSAJE_SIN_TURNO)
      expect(await pagosDe(sesion)).toEqual([expect.objectContaining({ estado: ESTADO_PAGO_PENDIENTE, turnoCajaId: null })])
      expect(await estadoDeLaSesion(sesion)).toBe('activa')
    })

    it('un turno ya cerrado no cuenta', async () => {
      const { rest, mozo, sesion } = await restauranteConMesa()
      await fx.turno(rest, owner, { cerrado: true, cajas: [{ cajaId: await fx.caja(rest), cerrada: true }] })

      const res = await cobrar(mozo.usuarioId, sesion)

      expect([res.status, res.body.message]).toEqual([400, MENSAJE_SIN_TURNO])
      expect(await pagosDe(sesion)).toEqual([])
    })
  })

  it('2. una caja abierta: el cobro y la confirmación van ahí, sin cajaId, y la sesión se cierra', async () => {
    const { rest, mozo, sesion } = await restauranteConMesa()
    const caja = await fx.caja(rest)
    const { aperturas } = await fx.turnoAbierto(rest, owner, [caja])

    expect((await cobrar(mozo.usuarioId, sesion)).status).toBe(200)
    expect(await aprobadosDe(sesion)).toEqual([expect.objectContaining({ turnoCajaId: aperturas[caja] })])
    expect(await estadoDeLaSesion(sesion)).toBe('cerrada')

    const otra = await otraSesion(rest)
    const efectivo = await fx.pago({ sesionId: otra, turnoCajaId: null, metodo: 'efectivo', estado: ESTADO_PAGO_PENDIENTE, monto: TOTAL })
    const res = await confirmar(mozo.usuarioId, efectivo)
    expect([res.status, res.body.estado]).toEqual([200, 'cerrada'])
    expect(await aprobadosDe(otra)).toEqual([expect.objectContaining({ id: efectivo, turnoCajaId: aperturas[caja] })])
  })

  it('3. dos cajas abiertas: sin cajaId 400 y no se escribe nada; con cajaId va a la indicada', async () => {
    const { rest, mozo, sesion } = await restauranteConMesa()
    const [c1, c2] = [await fx.caja(rest), await fx.caja(rest)]
    const { aperturas } = await fx.turnoAbierto(rest, owner, [c1, c2])
    const efectivoSesion = await otraSesion(rest)
    const efectivo = await fx.pago({ sesionId: efectivoSesion, turnoCajaId: null, metodo: 'efectivo', estado: ESTADO_PAGO_PENDIENTE, monto: TOTAL })

    const sinCaja = await cobrar(mozo.usuarioId, sesion)
    const confirmarSinCaja = await confirmar(mozo.usuarioId, efectivo)
    expect([sinCaja.status, sinCaja.body.message]).toEqual([400, MENSAJE_ELEGIR_CAJA])
    expect([confirmarSinCaja.status, confirmarSinCaja.body.message]).toEqual([400, MENSAJE_ELEGIR_CAJA])
    expect(await pagosDe(sesion)).toEqual([])
    expect(await pagosDe(efectivoSesion)).toEqual([expect.objectContaining({ estado: ESTADO_PAGO_PENDIENTE, turnoCajaId: null })])

    expect((await cobrar(mozo.usuarioId, sesion, { cajaId: c2 })).status).toBe(200)
    expect((await confirmar(mozo.usuarioId, efectivo, { cajaId: c1 })).status).toBe(200)
    expect(await aprobadosDe(sesion)).toEqual([expect.objectContaining({ turnoCajaId: aperturas[c2] })])
    expect(await aprobadosDe(efectivoSesion)).toEqual([expect.objectContaining({ turnoCajaId: aperturas[c1] })])
  })

  describe('4. una caja que no está abierta en el turno actual: 400', () => {
    it('la caja abierta de otro restaurante, con los dos turnos abiertos; sin cajaId, cada uno toma la suya', async () => {
      const { rest, mozo, sesion } = await restauranteConMesa()
      const otro = await fx.restaurante(marcaId)
      const [propia, ajena] = [await fx.caja(rest), await fx.caja(otro)]
      const { aperturas } = await fx.turnoAbierto(rest, owner, [propia])
      await fx.turnoAbierto(otro, owner, [ajena])

      const res = await cobrar(mozo.usuarioId, sesion, { cajaId: ajena })
      expect([res.status, res.body.message]).toEqual([400, MENSAJE_CAJA_NO_ABIERTA])
      expect(await pagosDe(sesion)).toEqual([])

      expect((await cobrar(mozo.usuarioId, sesion)).status).toBe(200)
      expect(await aprobadosDe(sesion)).toEqual([expect.objectContaining({ turnoCajaId: aperturas[propia] })])
    })

    it('una caja del restaurante que no se abrió en este turno (cerrada en un turno anterior)', async () => {
      const { rest, mozo, sesion } = await restauranteConMesa()
      const [vieja, actual] = [await fx.caja(rest), await fx.caja(rest)]
      await fx.turno(rest, owner, { cerrado: true, cajas: [{ cajaId: vieja, cerrada: true }] })
      await fx.turnoAbierto(rest, owner, [actual])

      const res = await cobrar(mozo.usuarioId, sesion, { cajaId: vieja })

      expect([res.status, res.body.message]).toEqual([400, MENSAJE_CAJA_NO_ABIERTA])
      expect(await pagosDe(sesion)).toEqual([])
    })

    it('un turno cerrado con una TurnoCaja que quedó abierta no cuenta (el filtro del turno)', async () => {
      const { rest, mozo, sesion } = await restauranteConMesa()
      const caja = await fx.caja(rest)
      await fx.turno(rest, owner, { cerrado: true, cajas: [{ cajaId: caja, cerrada: false }] })

      const sinCaja = await cobrar(mozo.usuarioId, sesion)
      const conCaja = await cobrar(mozo.usuarioId, sesion, { cajaId: caja })

      expect([sinCaja.status, sinCaja.body.message]).toEqual([400, MENSAJE_SIN_TURNO])
      expect([conCaja.status, conCaja.body.message]).toEqual([400, MENSAJE_SIN_TURNO])
      expect(await pagosDe(sesion)).toEqual([])
    })

    it('un turno abierto con una TurnoCaja cerrada: esa no cuenta (el filtro de la caja)', async () => {
      const { rest, mozo, sesion } = await restauranteConMesa()
      const [abierta, cerrada] = [await fx.caja(rest), await fx.caja(rest)]
      const { aperturas } = await fx.turno(rest, owner, { cajas: [{ cajaId: abierta }, { cajaId: cerrada, cerrada: true }] })

      const res = await cobrar(mozo.usuarioId, sesion, { cajaId: cerrada })
      expect([res.status, res.body.message]).toEqual([400, MENSAJE_CAJA_NO_ABIERTA])

      // Sin cajaId hay una sola abierta: va ahí, no es "elegí la caja".
      expect((await cobrar(mozo.usuarioId, sesion)).status).toBe(200)
      expect(await aprobadosDe(sesion)).toEqual([expect.objectContaining({ turnoCajaId: aperturas[abierta] })])
    })
  })

  it('5. la propina queda aparte del monto, y el cierre la suma al esperado de su método', async () => {
    const { rest, mozo, sesion } = await restauranteConMesa()
    const caja = await fx.caja(rest)
    const { turnoId, aperturas } = await fx.turnoAbierto(rest, owner, [caja], { fondoInicial: 200 })
    const otra = await otraSesion(rest)
    const efectivo = await fx.pago({ sesionId: otra, turnoCajaId: null, metodo: 'efectivo', estado: ESTADO_PAGO_PENDIENTE, monto: TOTAL })

    expect((await cobrar(mozo.usuarioId, sesion, { metodoPago: 'debito', propina: 150.5 })).status).toBe(200)
    expect((await confirmar(mozo.usuarioId, efectivo, { propina: 0.25 })).status).toBe(200)

    const [debito] = await aprobadosDe(sesion)
    expect([debito.monto.toString(), debito.propina.toString()]).toEqual(['1000', '150.5'])
    const [cobrado] = await aprobadosDe(otra)
    expect([cobrado.monto.toString(), cobrado.propina.toString()]).toEqual(['1000', '0.25'])

    expect((await cerrarTurno(turnoId, [{ cajaId: caja, declarado: declarado(1200.25, 1150.5) }])).status).toBe(200)
    expect(await esperadoEnBase(aperturas[caja], 'debito')).toBe('1150.50')
    expect(await esperadoEnBase(aperturas[caja], 'efectivo')).toBe('1200.25') // fondo 200 + 1000 + 0,25
  })

  it('5b. la propina no cubre la sesión: un efectivo pedido antes de otro plato deja saldo, aunque su propina alcance', async () => {
    const { rest, mozo, mesa, sesion } = await restauranteConMesa()
    const caja = await fx.caja(rest)
    await fx.turnoAbierto(rest, owner, [caja])

    // El comensal pide efectivo con el total en 1000, y después pide otro plato de 500: el total pasa a 1500.
    const pedido = await pedirEfectivo(rest, mesa, sesion)
    expect(pedido.status).toBe(201)
    await fx.consumo(sesion, mesa.id, rest, 500)

    // El mozo confirma ese efectivo de 1000 con 600 de propina: 1000 + 600 pasaría los 1500, pero la propina no cuenta.
    const confirmado = await confirmar(mozo.usuarioId, pedido.body.pagoId, { propina: 600 })
    expect([confirmado.status, confirmado.body.estado]).toEqual([200, 'activa'])
    expect(await estadoDeLaSesion(sesion)).toBe('activa')

    // El comensal vuelve a pedir efectivo: el saldo es 500 (1500 − 1000), no −100.
    const segundo = await pedirEfectivo(rest, mesa, sesion)
    expect(segundo.status).toBe(201)
    expect((await prisma.pago.findUniqueOrThrow({ where: { id: segundo.body.pagoId } })).monto.toString()).toBe('500')

    // El mozo cobra la mesa: reutiliza ese efectivo, cobra exactamente 500 y la sesión se cierra.
    expect((await cobrar(mozo.usuarioId, sesion)).status).toBe(200)
    const aprobados = (await aprobadosDe(sesion)).map((p) => [p.monto.toString(), p.propina.toString()]).sort()
    expect(aprobados).toEqual([
      ['1000', '600'],
      ['500', '0'],
    ])
    expect(await estadoDeLaSesion(sesion)).toBe('cerrada')
  })

  it('6. el efectivo pendiente que se reutiliza queda con la caja, el método del cobro y la propina', async () => {
    const { rest, mozo, sesion } = await restauranteConMesa()
    const caja = await fx.caja(rest)
    const { aperturas } = await fx.turnoAbierto(rest, owner, [caja])
    const efectivo = await fx.pago({ sesionId: sesion, turnoCajaId: null, metodo: 'efectivo', estado: ESTADO_PAGO_PENDIENTE, monto: TOTAL })

    expect((await cobrar(mozo.usuarioId, sesion, { metodoPago: 'transferencia', propina: 40 })).status).toBe(200)

    const pagos = await pagosDe(sesion)
    expect(pagos).toHaveLength(1) // no se creó otro
    expect(pagos[0]).toMatchObject({ id: efectivo, estado: ESTADO_PAGO_APROBADO, metodo: 'transferencia', turnoCajaId: aperturas[caja] })
    expect(pagos[0].propina.toString()).toBe('40')
  })

  it('7. cajaId: null y propina: null pasan la validación y cuentan como ausentes (la única caja, propina 0)', async () => {
    const { rest, mozo, sesion } = await restauranteConMesa()
    const caja = await fx.caja(rest)
    const { aperturas } = await fx.turnoAbierto(rest, owner, [caja])
    const otra = await otraSesion(rest)
    const efectivo = await fx.pago({ sesionId: otra, turnoCajaId: null, metodo: 'efectivo', estado: ESTADO_PAGO_PENDIENTE, monto: TOTAL })

    expect((await cobrar(mozo.usuarioId, sesion, { cajaId: null, propina: null })).status).toBe(200)
    expect((await confirmar(mozo.usuarioId, efectivo, { cajaId: null, propina: null })).status).toBe(200)

    for (const s of [sesion, otra]) {
      const [pago] = await aprobadosDe(s)
      expect([pago.turnoCajaId, pago.propina.toString()]).toEqual([aperturas[caja], '0'])
    }
  })

  it('8. mercadopago registrado por el mozo también va a la caja (y el arqueo no lo cuenta)', async () => {
    const { rest, mozo, sesion } = await restauranteConMesa()
    const caja = await fx.caja(rest)
    const { turnoId, aperturas } = await fx.turnoAbierto(rest, owner, [caja])
    const mpViejo = await fx.pago({ sesionId: sesion, turnoCajaId: null, metodo: 'mercadopago', estado: ESTADO_PAGO_PENDIENTE, monto: TOTAL })

    expect((await cobrar(mozo.usuarioId, sesion, { metodoPago: 'mercadopago', confirmarCancelacionPagosPendientes: true })).status).toBe(200)

    const pagos = await pagosDe(sesion)
    expect(pagos.find((p) => p.id === mpViejo)?.estado).toBe(ESTADO_PAGO_CANCELADO)
    expect(await aprobadosDe(sesion)).toEqual([expect.objectContaining({ metodo: 'mercadopago', turnoCajaId: aperturas[caja] })])
    expect((await cerrarTurno(turnoId, [{ cajaId: caja, declarado: declarado(0) }])).status).toBe(200)
    expect(await esperadoEnBase(aperturas[caja], 'efectivo')).toBe('0.00')
  })

  /**
   * Cómo terminó el cierre de una carrera: 'cerrado' (200) o 'simultaneo' (el 409 genérico, con el turno todavía abierto
   * y sin arqueo). Cualquier otra cosa hace fallar el caso.
   */
  async function comoTerminoElCierre(res: { status: number; body: { message?: unknown } }, turnoId: string, apertura: string) {
    if (res.status === 200) return 'cerrado' as const
    expect([res.status, res.body.message]).toEqual([409, MENSAJE_OPERACION_SIMULTANEA])
    expect((await prisma.turno.findUniqueOrThrow({ where: { id: turnoId } })).cerradoEn).toBeNull()
    expect(await prisma.arqueoMetodo.count({ where: { turnoCajaId: apertura } })).toBe(0)
    return 'simultaneo' as const
  }

  /**
   * Cómo terminó un cobro de una carrera: 'cobrado' (200), 'sin turno' (400: leyó el turno ya cerrado) o 'simultaneo' (el
   * 409 genérico de un P2034 que sobrevivió al reintento). Nunca un 500.
   */
  function comoTerminoElCobro(res: { status: number; body: { message?: unknown } }) {
    if (res.status === 200) return 'cobrado'
    if (res.status === 400 && res.body.message === MENSAJE_SIN_TURNO) return 'sin turno'
    if (res.status === 409 && res.body.message === MENSAJE_OPERACION_SIMULTANEA) return 'simultaneo'
    return `inesperado ${res.status}: ${String(res.body.message)}`
  }

  it.each([
    ['PATCH /sessions/:id/cobro', 'cobro'],
    ['POST /payments/confirmar-efectivo', 'confirmar'],
  ] as const)(
    `9. %s y el cierre del turno a la vez (${RONDAS} rondas): ningún pago aprobado queda fuera del arqueo, y nunca un 500`,
    async (_ruta, cual) => {
      const porRonda: Record<string, number> = {}
      const antes = reintentos.foto()

      for (let ronda = 0; ronda < RONDAS; ronda++) {
        const { rest, mozo, sesion } = await restauranteConMesa()
        const caja = await fx.caja(rest)
        const { turnoId, aperturas } = await fx.turnoAbierto(rest, owner, [caja], { fondoInicial: 100 })
        const pendiente =
          cual === 'confirmar'
            ? await fx.pago({ sesionId: sesion, turnoCajaId: null, metodo: 'efectivo', estado: ESTADO_PAGO_PENDIENTE, monto: TOTAL })
            : null

        const [cobro, cierre] = await Promise.all([
          pendiente ? confirmar(mozo.usuarioId, pendiente) : cobrar(mozo.usuarioId, sesion),
          cerrarTurno(turnoId, [{ cajaId: caja, declarado: declarado(100) }]),
        ])
        const comoCobro = comoTerminoElCobro(cobro)
        const comoCerro = await comoTerminoElCierre(cierre, turnoId, aperturas[caja])
        contar(porRonda, `${comoCobro} / cierre ${comoCerro}`)

        expect(['cobrado', 'sin turno', 'simultaneo']).toContain(comoCobro)
        if (comoCerro === 'simultaneo') {
          // El cierre no cerró: el cobro no pudo ver el turno cerrado. Después se cierra sin carrera.
          expect(comoCobro).not.toBe('sin turno')
          expect((await cerrarTurno(turnoId, [{ cajaId: caja, declarado: declarado(100) }])).status).toBe(200)
        }
        const aprobados = await aprobadosDe(sesion)
        expect(aprobados).toHaveLength(comoCobro === 'cobrado' ? 1 : 0)
        if (comoCobro === 'cobrado') expect(aprobados[0].turnoCajaId).toBe(aperturas[caja])
        // 100 de fondo más el cobro, si quedó: 100.00 o 1100.00.
        expect(await esperadoEnBase(aperturas[caja], 'efectivo')).toBe((100 + aprobados.length * TOTAL).toFixed(2))
      }

      mostrarDistribucion(`[cobro e2e] caso 9 (${cual}): ${JSON.stringify(porRonda)}; reintentos: ${reintentos.desde(antes)}`)
    },
    120_000,
  )

  it.each([
    ['PATCH /sessions/:id/cobro', 'cobro', 'registrarCobro'],
    ['POST /payments/confirmar-efectivo', 'confirmar', 'confirmarEfectivo'],
  ] as const)(
    `10. %s leyó la caja abierta, el cierre termina, y recién ahí sigue (${RONDAS_ENTRELAZADAS} rondas): 400 sin turno y fuera del arqueo nada`,
    async (_ruta, cual, contexto) => {
      const porRonda: Record<string, number> = {}
      const real = cajaDelCobroModulo.cajaDelCobro

      for (let ronda = 0; ronda < RONDAS_ENTRELAZADAS; ronda++) {
        const { rest, mozo, sesion } = await restauranteConMesa()
        const caja = await fx.caja(rest)
        const { turnoId, aperturas } = await fx.turnoAbierto(rest, owner, [caja], { fondoInicial: 100 })
        const pendiente =
          cual === 'confirmar'
            ? await fx.pago({ sesionId: sesion, turnoCajaId: null, metodo: 'efectivo', estado: ESTADO_PAGO_PENDIENTE, monto: TOTAL })
            : null
        const leyo = senal()
        const puedeSeguir = senal()
        let lecturas = 0
        // La lectura real de la caja, con una pausa después de la primera: el cobro ya la vio abierta y todavía no escribió.
        const espia = jest.spyOn(cajaDelCobroModulo, 'cajaDelCobro').mockImplementation(async (...args) => {
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
          const cobro = (pendiente ? confirmar(mozo.usuarioId, pendiente) : cobrar(mozo.usuarioId, sesion)).then((r) => r)
          await leyo.promesa
          const cierre = await cerrarTurno(turnoId, [{ cajaId: caja, declarado: declarado(100) }])
          puedeSeguir.liberar()
          const res = await cobro
          const reintentosDelCobro = (reintentos.total[contexto] ?? 0) - (antes[contexto] ?? 0)
          contar(porRonda, `cobro ${res.status} / cierre ${cierre.status} / reintentos ${reintentosDelCobro}`)

          // El primer intento choca con el cierre (P2034) y el reintento ya no encuentra el turno abierto.
          expect({ cierre: cierre.status, cobro: res.status, mensaje: res.body.message, reintentosDelCobro }).toEqual({
            cierre: 200,
            cobro: 400,
            mensaje: MENSAJE_SIN_TURNO,
            reintentosDelCobro: 1,
          })
          expect(await aprobadosDe(sesion)).toEqual([])
          expect(await esperadoEnBase(aperturas[caja], 'efectivo')).toBe('100.00')
        } finally {
          espia.mockRestore()
        }
      }

      mostrarDistribucion(`[cobro e2e] caso 10 (${cual}): ${JSON.stringify(porRonda)}`)
    },
    60_000,
  )
})
