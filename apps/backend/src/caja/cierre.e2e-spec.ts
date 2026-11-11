import { randomUUID } from 'crypto'
import { ConflictException } from '@nestjs/common'
import { runSerializableTransaction } from '../common/run-serializable-transaction'
import { PrismaService } from '../prisma/prisma.service'
import { AppE2e, contar, contarReintentos, crearAppE2e, mostrarDistribucion } from '../test/app-e2e'
import { FixtureDeCaja, marcadorDeLaCorrida } from '../test/fixture-de-caja'
import { MENSAJE_CAJA_NO_ABIERTA } from './movimientos.service'
import { esOperacionSimultanea, MENSAJE_OPERACION_SIMULTANEA, MENSAJE_TURNO_CERRADO } from './conflictos'

// Los movimientos y el cierre del turno con el arqueo (#357) por HTTP, contra Postgres, con los guards de permisos reales
// (test/app-e2e.ts). El turno se abre por HTTP; los pagos y las sesiones se insertan con Prisma. Los esperados son
// literales calculados a mano: este archivo no usa esperadoDeCaja. Cada caso dice qué invariante prueba.

/** Las rondas de las carreras libres (casos 7, 8 y 9a). E2E_RONDAS las cambia. */
const RONDAS = Number(process.env.E2E_RONDAS ?? 10)
/** Las rondas de los entrelazados forzados (9b y 9c): son deterministas, no necesitan más. */
const RONDAS_ENTRELAZADAS = 3

/** Una promesa que el test resuelve a mano, para forzar un orden sin sleeps. */
function senal() {
  let liberar!: () => void
  const promesa = new Promise<void>((resolve) => (liberar = resolve))
  return { promesa, liberar }
}

type Declarado = { efectivo: number; debito: number; credito: number; transferencia: number }
const declarado = (efectivo: number, debito = 0, credito = 0, transferencia = 0): Declarado => ({ efectivo, debito, credito, transferencia })

describe('Movimientos y cierre del turno contra Postgres (e2e)', () => {
  let api: AppE2e
  let prisma: PrismaService
  let fx: FixtureDeCaja
  let marcaId = ''
  let owner = ''
  let ownerDeOtraMarca = ''
  let reintentos: ReturnType<typeof contarReintentos>

  /** Abre un turno por HTTP con esas cajas y fondos, sin asignaciones. Devuelve el turno y la apertura de cada caja. */
  async function abrirTurno(restauranteId: string, cajas: { cajaId: string; fondoInicial: number }[], usuarioId = owner) {
    const res = await api.pedir('post', '/turnos', { usuarioId, body: { restauranteId, cajas, asignaciones: [] } })
    expect(res.status).toBe(201)
    const aperturas = Object.fromEntries(res.body.turno.cajas.map((c: { cajaId: string; id: string }) => [c.cajaId, c.id]))
    return { turnoId: res.body.turno.id as string, aperturas: aperturas as Record<string, string> }
  }

  const movimiento = (usuarioId: string, turnoId: string, cajaId: string, tipo: 'INGRESO' | 'EGRESO', monto: number) =>
    api.pedir('post', `/turnos/${turnoId}/movimientos`, { usuarioId, body: { cajaId, tipo, monto, motivo: `e2e ${tipo}` } })
  const cerrar = (usuarioId: string, turnoId: string, cajas: { cajaId: string; declarado: Declarado }[], observaciones?: string) =>
    api.pedir('post', `/turnos/${turnoId}/cierre`, { usuarioId, body: { cajas, observaciones } })

  /** El arqueo guardado de una apertura, como lo devuelve Postgres en texto: { metodo: [esperado, declarado, diferencia] }. */
  async function arqueoEnBase(turnoCajaId: string) {
    const filas = await prisma.$queryRaw<{ metodo: string; esperado: string; declarado: string; diferencia: string }[]>`
      SELECT metodo, esperado::text AS esperado, declarado::text AS declarado, diferencia::text AS diferencia
      FROM arqueo_metodo WHERE turno_caja_id = ${turnoCajaId} ORDER BY metodo`
    return Object.fromEntries(filas.map((f) => [f.metodo, [f.esperado, f.declarado, f.diferencia]]))
  }

  /** Un restaurante nuevo con una caja y su turno abierto con ese fondo. */
  async function restauranteConTurno(fondoInicial: number) {
    const rest = await fx.restaurante(marcaId)
    const caja = await fx.caja(rest)
    const { turnoId, aperturas } = await abrirTurno(rest, [{ cajaId: caja, fondoInicial }])
    return { rest, caja, turnoId, apertura: aperturas[caja] }
  }

  beforeAll(async () => {
    api = await crearAppE2e()
    prisma = api.prisma
    fx = new FixtureDeCaja(prisma, marcadorDeLaCorrida('cierre'))
    marcaId = await fx.marca()
    owner = await fx.usuario('OWNER', { marcaId })
    ownerDeOtraMarca = await fx.usuario('OWNER', { marcaId: await fx.marca('E2E Caja otra marca') })
    reintentos = contarReintentos()
  })

  afterAll(async () => {
    if (reintentos) mostrarDistribucion(`[cierre e2e] reintentos por P2034: ${JSON.stringify(reintentos.total)}`)
    jest.restoreAllMocks()
    try {
      if (fx) await fx.limpiar()
    } finally {
      if (api) await api.cerrar()
    }
  })

  it('1. ciclo completo: el arqueo guardado y la respuesta coinciden con los esperados calculados a mano', async () => {
    const rest = await fx.restaurante(marcaId)
    const jefe = await fx.usuario('JEFE_SALON', { restauranteId: rest })
    const principal = await fx.caja(rest, { nombre: 'Principal' })
    const barra = await fx.caja(rest, { nombre: 'Barra' })
    const { turnoId, aperturas } = await abrirTurno(rest, [
      { cajaId: principal, fondoInicial: 10000 },
      { cajaId: barra, fondoInicial: 5000 },
    ])
    const [mesa1, mesa2, mesa3] = [await fx.mesa(rest), await fx.mesa(rest), await fx.mesa(rest)]

    expect((await movimiento(jefe, turnoId, principal, 'INGRESO', 2000)).status).toBe(201)
    expect((await movimiento(jefe, turnoId, principal, 'EGRESO', 750.5)).status).toBe(201)
    expect((await movimiento(jefe, turnoId, barra, 'EGRESO', 300)).status).toBe(201)

    const sesion = await fx.sesion(mesa1.id, { iniciadaEn: new Date('2026-11-10T10:00:00Z') })
    await fx.sesion(mesa1.id, { iniciadaEn: new Date('2026-11-10T12:00:00Z') })
    await fx.sesion(mesa2.id, { iniciadaEn: new Date('2026-11-10T11:00:00Z') })
    await fx.sesion(mesa3.id, { estado: 'cerrada', iniciadaEn: new Date('2026-11-10T09:00:00Z') })
    const pagoEn = (turnoCajaId: string, metodo: string, estado: string, monto: number, propina = 0) =>
      fx.pago({ sesionId: sesion, turnoCajaId, metodo, estado, monto, propina })
    const P = aperturas[principal]
    await pagoEn(P, 'efectivo', 'aprobado', 4000, 400)
    await pagoEn(P, 'debito', 'aprobado', 3000, 300)
    await pagoEn(P, 'credito', 'aprobado', 2500)
    await pagoEn(P, 'transferencia', 'aprobado', 1200, 120)
    await pagoEn(P, 'efectivo', 'pendiente', 999)
    await pagoEn(P, 'debito', 'cancelado', 888)
    await pagoEn(P, 'credito', 'rechazado', 777)
    await pagoEn(P, 'mercadopago', 'aprobado', 5000, 500)
    await pagoEn(aperturas[barra], 'efectivo', 'aprobado', 1500, 150)

    // Principal: efectivo 10000 + 4000 + 400 + 2000 − 750,50 = 15649,50; débito 3300; crédito 2500; transferencia 1320.
    // Barra: efectivo 5000 + 1500 + 150 − 300 = 6350.
    const res = await cerrar(jefe, turnoId, [
      { cajaId: principal, declarado: declarado(15700, 3200, 2500, 1320) },
      { cajaId: barra, declarado: declarado(6300) },
    ])

    expect(res.status).toBe(200)
    expect(res.body.arqueos).toEqual([
      {
        cajaId: barra,
        cajaNombre: 'Barra',
        fondoInicial: 5000,
        metodos: [
          { metodo: 'efectivo', esperado: 6350, declarado: 6300, diferencia: -50 },
          { metodo: 'debito', esperado: 0, declarado: 0, diferencia: 0 },
          { metodo: 'credito', esperado: 0, declarado: 0, diferencia: 0 },
          { metodo: 'transferencia', esperado: 0, declarado: 0, diferencia: 0 },
        ],
      },
      {
        cajaId: principal,
        cajaNombre: 'Principal',
        fondoInicial: 10000,
        metodos: [
          { metodo: 'efectivo', esperado: 15649.5, declarado: 15700, diferencia: 50.5 },
          { metodo: 'debito', esperado: 3300, declarado: 3200, diferencia: -100 },
          { metodo: 'credito', esperado: 2500, declarado: 2500, diferencia: 0 },
          { metodo: 'transferencia', esperado: 1320, declarado: 1320, diferencia: 0 },
        ],
      },
    ])
    expect(await arqueoEnBase(P)).toEqual({
      credito: ['2500.00', '2500.00', '0.00'],
      debito: ['3300.00', '3200.00', '-100.00'],
      efectivo: ['15649.50', '15700.00', '50.50'],
      transferencia: ['1320.00', '1320.00', '0.00'],
    })
    expect(await arqueoEnBase(aperturas[barra])).toEqual({
      credito: ['0.00', '0.00', '0.00'],
      debito: ['0.00', '0.00', '0.00'],
      efectivo: ['6350.00', '6300.00', '-50.00'],
      transferencia: ['0.00', '0.00', '0.00'],
    })

    const turno = await prisma.turno.findUniqueOrThrow({ where: { id: turnoId }, include: { cajas: true } })
    expect(turno.cerradoEn).toBeInstanceOf(Date)
    expect(turno.cerradoPorUsuarioId).toBe(jefe)
    expect(turno.cajas.map((c) => c.cerradoEn?.getTime())).toEqual([turno.cerradoEn?.getTime(), turno.cerradoEn?.getTime()])
    expect(res.body.avisos.mesasAbiertas).toEqual([
      { mesaId: mesa1.id, mesaNumero: mesa1.numero, iniciadaEn: '2026-11-10T10:00:00.000Z' },
      { mesaId: mesa2.id, mesaNumero: mesa2.numero, iniciadaEn: '2026-11-10T11:00:00.000Z' },
    ])

    const actual = await api.pedir('get', '/turnos/actual', { usuarioId: jefe, query: { restauranteId: rest } })
    expect(actual.body).toEqual({ turno: null })
  })

  it('2. decimales exactos en la base: tres pagos de 0,10 y uno de 0,20 dan 0.50 en la columna', async () => {
    const { rest, caja, turnoId, apertura } = await restauranteConTurno(0)
    const sesion = await fx.sesion((await fx.mesa(rest)).id)
    for (const monto of ['0.10', '0.10', '0.10', '0.20']) {
      await fx.pago({ sesionId: sesion, turnoCajaId: apertura, metodo: 'efectivo', estado: 'aprobado', monto })
    }

    const res = await cerrar(owner, turnoId, [{ cajaId: caja, declarado: declarado(0.5) }])

    expect(res.status).toBe(200)
    expect((await arqueoEnBase(apertura)).efectivo).toEqual(['0.50', '0.50', '0.00'])
    expect(res.body.arqueos[0].metodos[0]).toEqual({ metodo: 'efectivo', esperado: 0.5, declarado: 0.5, diferencia: 0 })
  })

  it('3. un turno cerrado es inmutable: un movimiento y un segundo cierre dan 409 y no cambian nada', async () => {
    const { caja, turnoId, apertura } = await restauranteConTurno(1000)
    expect((await cerrar(owner, turnoId, [{ cajaId: caja, declarado: declarado(1000) }])).status).toBe(200)
    const antes = await prisma.turno.findUniqueOrThrow({ where: { id: turnoId } })
    const arqueoAntes = await arqueoEnBase(apertura)

    const mov = await movimiento(owner, turnoId, caja, 'INGRESO', 100)
    expect(mov.status).toBe(409)
    expect(mov.body.message).toBe(MENSAJE_TURNO_CERRADO)
    expect(await prisma.movimientoCaja.count({ where: { turnoCajaId: apertura } })).toBe(0)

    const otro = await cerrar(owner, turnoId, [{ cajaId: caja, declarado: declarado(999) }])
    expect(otro.status).toBe(409)
    expect(otro.body.message).toBe(MENSAJE_TURNO_CERRADO)
    expect(await arqueoEnBase(apertura)).toEqual(arqueoAntes)
    expect(await prisma.turno.findUniqueOrThrow({ where: { id: turnoId } })).toMatchObject({
      cerradoEn: antes.cerradoEn,
      cerradoPorUsuarioId: antes.cerradoPorUsuarioId,
    })
  })

  describe('4. validaciones contra la base real: 400 (nunca 500) y no se escribe nada', () => {
    async function sinCambios(turnoId: string) {
      expect((await prisma.turno.findUniqueOrThrow({ where: { id: turnoId } })).cerradoEn).toBeNull()
      expect(await prisma.arqueoMetodo.count({ where: { turnoCaja: { turnoId } } })).toBe(0)
    }

    it('falta una caja del turno', async () => {
      const rest = await fx.restaurante(marcaId)
      const [a, b] = [await fx.caja(rest, { nombre: 'A' }), await fx.caja(rest, { nombre: 'B' })]
      const { turnoId } = await abrirTurno(rest, [
        { cajaId: a, fondoInicial: 0 },
        { cajaId: b, fondoInicial: 0 },
      ])

      const res = await cerrar(owner, turnoId, [{ cajaId: a, declarado: declarado(0) }])

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Falta el arqueo de la caja «B»')
      await sinCambios(turnoId)
    })

    it('una caja de otro restaurante', async () => {
      const { caja, turnoId } = await restauranteConTurno(0)
      const ajena = await fx.caja(await fx.restaurante(marcaId))

      const res = await cerrar(owner, turnoId, [
        { cajaId: caja, declarado: declarado(0) },
        { cajaId: ajena, declarado: declarado(0) },
      ])

      expect(res.status).toBe(400)
      expect(res.body.message).toBe(MENSAJE_CAJA_NO_ABIERTA)
      await sinCambios(turnoId)
    })

    it('un esperado de efectivo fuera de rango (fondo en el tope más un pago)', async () => {
      const { rest, caja, turnoId, apertura } = await restauranteConTurno(99_999_999.99)
      await fx.pago({ sesionId: await fx.sesion((await fx.mesa(rest)).id), turnoCajaId: apertura, metodo: 'efectivo', estado: 'aprobado', monto: 1 })

      const res = await cerrar(owner, turnoId, [{ cajaId: caja, declarado: declarado(0) }])

      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/^El arqueo de efectivo de la caja «.+» supera el máximo que se puede registrar$/)
      await sinCambios(turnoId)
    })

    it('una diferencia fuera de rango (esperado negativo por un egreso y declarado en el tope)', async () => {
      const { caja, turnoId } = await restauranteConTurno(0)
      expect((await movimiento(owner, turnoId, caja, 'EGRESO', 1)).status).toBe(201)

      const res = await cerrar(owner, turnoId, [{ cajaId: caja, declarado: declarado(99_999_999.99) }])

      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/^El arqueo de efectivo de la caja «.+» supera el máximo que se puede registrar$/)
      await sinCambios(turnoId)
    })
  })

  it('5. el cierre libera las cajas: se pueden desactivar (200) y abrir en un turno nuevo (201)', async () => {
    const rest = await fx.restaurante(marcaId)
    const [a, b] = [await fx.caja(rest, { nombre: 'A' }), await fx.caja(rest, { nombre: 'B' })]
    const cajas = [
      { cajaId: a, fondoInicial: 0 },
      { cajaId: b, fondoInicial: 0 },
    ]
    const { turnoId } = await abrirTurno(rest, cajas)
    const patch = (activa: boolean) => api.pedir('patch', `/cajas/${b}`, { usuarioId: owner, body: { activa } })
    expect((await patch(false)).status).toBe(409)

    expect(
      (
        await cerrar(owner, turnoId, [
          { cajaId: a, declarado: declarado(0) },
          { cajaId: b, declarado: declarado(0) },
        ])
      ).status,
    ).toBe(200)

    expect((await patch(false)).status).toBe(200)
    expect((await patch(true)).status).toBe(200)
    await abrirTurno(rest, cajas)
  })

  describe('6. permisos con los guards reales: los movimientos y el cierre', () => {
    let rest = ''
    let caja = ''
    const usuarios: Record<string, string> = {}

    beforeAll(async () => {
      rest = await fx.restaurante(marcaId)
      caja = await fx.caja(rest)
      const otroRest = await fx.restaurante(marcaId, 'E2E Caja otro restaurante')
      for (const rol of ['GERENTE', 'JEFE_SALON', 'MOZO', 'COCINA'] as const) usuarios[rol] = await fx.usuario(rol, { restauranteId: rest })
      usuarios.GERENTE_DE_OTRO = await fx.usuario('GERENTE', { restauranteId: otroRest })
    })

    it.each(['OWNER', 'GERENTE', 'JEFE_SALON'])('%s del restaurante registra un movimiento (201) y cierra (200)', async (rol) => {
      const usuarioId = rol === 'OWNER' ? owner : usuarios[rol]
      const { turnoId } = await abrirTurno(rest, [{ cajaId: caja, fondoInicial: 0 }])

      expect((await movimiento(usuarioId, turnoId, caja, 'INGRESO', 10)).status).toBe(201)
      const res = await cerrar(usuarioId, turnoId, [{ cajaId: caja, declarado: declarado(10) }])

      expect(res.status).toBe(200)
      expect((await prisma.turno.findUniqueOrThrow({ where: { id: turnoId } })).cerradoPorUsuarioId).toBe(usuarioId)
    })

    it.each([
      ['el MOZO', () => usuarios.MOZO],
      ['COCINA', () => usuarios.COCINA],
      ['el GERENTE de otro restaurante', () => usuarios.GERENTE_DE_OTRO],
      ['el OWNER de otra marca', () => ownerDeOtraMarca],
    ])('%s recibe 403 en los dos y no cambia nada', async (_caso, usuarioId) => {
      const { turnoId, aperturas } = await abrirTurno(rest, [{ cajaId: caja, fondoInicial: 0 }])

      expect((await movimiento(usuarioId(), turnoId, caja, 'INGRESO', 10)).status).toBe(403)
      expect((await cerrar(usuarioId(), turnoId, [{ cajaId: caja, declarado: declarado(0) }])).status).toBe(403)

      expect(await prisma.movimientoCaja.count({ where: { turnoCajaId: aperturas[caja] } })).toBe(0)
      expect((await prisma.turno.findUniqueOrThrow({ where: { id: turnoId } })).cerradoEn).toBeNull()
      expect((await cerrar(owner, turnoId, [{ cajaId: caja, declarado: declarado(0) }])).status).toBe(200)
    })

    it('un turno que no existe es 404 en los dos', async () => {
      const id = randomUUID()
      expect((await movimiento(owner, id, caja, 'INGRESO', 10)).status).toBe(404)
      expect((await cerrar(owner, id, [{ cajaId: caja, declarado: declarado(0) }])).status).toBe(404)
    })
  })

  // En una carrera, el cierre también puede terminar en 409 sin que nadie haya cerrado el turno: si su transacción
  // serializable choca dos veces seguidas (un P2034 que sobrevive al único reintento de runSerializableTransaction), el
  // service revierte todo y responde el 409 genérico (caja/conflictos.ts) para que se pruebe de nuevo. Es el
  // comportamiento diseñado; en local nunca apareció, y en el CI del PR #463 el cierre de los casos 8 y 9a dio 409. Lo
  // que no se tolera es un 409 que deje algo escrito: por eso comoTerminoElCierre revisa la base, y después se cierra sin
  // carrera y se mira la invariante.

  /**
   * Cómo terminó un cierre de una carrera: 'cerrado' (200) o 'simultaneo' (el 409 genérico, con todo revertido: el turno
   * y sus cajas siguen abiertos y no hay arqueo). Cualquier otro status, u otro 409, hace fallar el caso.
   */
  async function comoTerminoElCierre(res: { status: number; body: { message?: unknown } }, turnoId: string, aperturas: string[]) {
    if (res.status === 200) return 'cerrado' as const
    expect(res.status).toBe(409)
    expect(res.body.message).toBe(MENSAJE_OPERACION_SIMULTANEA)
    expect((await prisma.turno.findUniqueOrThrow({ where: { id: turnoId } })).cerradoEn).toBeNull()
    expect(await prisma.turnoCaja.count({ where: { id: { in: aperturas }, cerradoEn: { not: null } } })).toBe(0)
    expect(await prisma.arqueoMetodo.count({ where: { turnoCajaId: { in: aperturas } } })).toBe(0)
    return 'simultaneo' as const
  }

  it(`7. dos cierres a la vez (${RONDAS} rondas): un 200 y un 409, nunca un 500, y 4 filas de arqueo`, async () => {
    const porRonda: Record<string, number> = {}
    const antes = reintentos.foto()

    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const { caja, turnoId, apertura } = await restauranteConTurno(100)
      const cuerpo = [{ cajaId: caja, declarado: declarado(100) }]

      const respuestas = await Promise.all([cerrar(owner, turnoId, cuerpo), cerrar(owner, turnoId, cuerpo)])
      const estados = respuestas.map((r) => r.status).sort()

      if (estados[0] === 409 && estados[1] === 409) {
        // Ninguno cerró: los dos tienen que ser el 409 genérico, sin nada escrito. Un tercer cierre, sin carrera, cierra.
        for (const r of respuestas) await comoTerminoElCierre(r, turnoId, [apertura])
        expect((await cerrar(owner, turnoId, cuerpo)).status).toBe(200)
        contar(porRonda, 'ambos 409 simultanea')
      } else {
        expect(estados).toEqual([200, 409])
        const perdedora = respuestas.find((r) => r.status === 409)
        expect([MENSAJE_TURNO_CERRADO, MENSAJE_OPERACION_SIMULTANEA]).toContain(perdedora?.body.message)
        contar(porRonda, `409: ${perdedora?.body.message}`)
      }
      expect(await prisma.arqueoMetodo.count({ where: { turnoCajaId: apertura } })).toBe(4)
    }

    mostrarDistribucion(`[cierre e2e] caso 7: ${JSON.stringify(porRonda)}; reintentos: ${reintentos.desde(antes)}`)
  }, 120_000)

  it(`8. un movimiento y el cierre a la vez (${RONDAS} rondas): ningún movimiento commiteado queda fuera del arqueo`, async () => {
    const porRonda: Record<string, number> = {}
    const antes = reintentos.foto()

    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const { caja, turnoId, apertura } = await restauranteConTurno(1000)

      const [mov, cierre] = await Promise.all([
        movimiento(owner, turnoId, caja, 'INGRESO', 100),
        cerrar(owner, turnoId, [{ cajaId: caja, declarado: declarado(1000) }]),
      ])
      const comoCerro = await comoTerminoElCierre(cierre, turnoId, [apertura])
      contar(porRonda, `movimiento ${mov.status} / cierre ${cierre.status}${comoCerro === 'simultaneo' ? ' simultanea' : ''}`)

      expect([201, 409]).toContain(mov.status)
      if (mov.status === 409) expect([MENSAJE_TURNO_CERRADO, MENSAJE_OPERACION_SIMULTANEA]).toContain(mov.body.message)
      // Si el cierre de la carrera no cerró, se cierra sin carrera: la invariante se mira sobre el cierre que quedó.
      if (comoCerro === 'simultaneo') expect((await cerrar(owner, turnoId, [{ cajaId: caja, declarado: declarado(1000) }])).status).toBe(200)
      const movimientos = await prisma.movimientoCaja.findMany({ where: { turnoCajaId: apertura }, select: { monto: true } })
      expect(movimientos).toHaveLength(mov.status === 201 ? 1 : 0)
      // 1000 de fondo más los ingresos que quedaron en la base: 1000.00 o 1100.00.
      const enLaBase = 1000 + movimientos.reduce((acc, m) => acc + m.monto.toNumber(), 0)
      expect((await arqueoEnBase(apertura)).efectivo[0]).toBe(enLaBase.toFixed(2))
    }

    mostrarDistribucion(`[cierre e2e] caso 8: ${JSON.stringify(porRonda)}; reintentos: ${reintentos.desde(antes)}`)
  }, 120_000)

  /**
   * Cómo terminó un cobro simulado: 'cobrado', 'rechazado' (la caja estaba cerrada), 'conflicto' (un P2034 que sobrevivió
   * al reintento) o el error, que hace fallar el caso.
   */
  const comoTermino = (cobro: Promise<string>) =>
    cobro.catch((err: unknown) => {
      if (err instanceof ConflictException) return 'rechazado'
      if (esOperacionSimultanea(err)) return 'conflicto'
      return `error: ${(err as Error).message.split('\n')[0]}`
    })

  it(`9a. un cobro (el patrón de #358) y el cierre a la vez (${RONDAS} rondas): ningún pago commiteado queda fuera del arqueo`, async () => {
    const porRonda: Record<string, number> = {}
    const antes = reintentos.foto()

    /**
     * Lo que va a hacer el cobro de #358: en una transacción serializable, mira la caja y, si sigue abierta, recién ahí
     * inserta el pago aprobado con su turnoCajaId. Devuelve si cobró o por qué no.
     */
    const cobrar = (turnoCajaId: string, sesionId: string) =>
      comoTermino(
        runSerializableTransaction(
          prisma,
          async (tx) => {
            const apertura = await tx.turnoCaja.findUniqueOrThrow({ where: { id: turnoCajaId }, select: { cerradoEn: true } })
            if (apertura.cerradoEn !== null) throw new ConflictException('caja cerrada')
            await tx.pago.create({ data: { sesionId, turnoCajaId, metodo: 'efectivo', estado: 'aprobado', monto: 250 } })
            return 'cobrado'
          },
          'cobroSimulado',
        ),
      )

    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const { rest, caja, turnoId, apertura } = await restauranteConTurno(1000)
      const sesion = await fx.sesion((await fx.mesa(rest)).id)

      const [cobro, cierre] = await Promise.all([cobrar(apertura, sesion), cerrar(owner, turnoId, [{ cajaId: caja, declarado: declarado(1000) }])])
      const comoCerro = await comoTerminoElCierre(cierre, turnoId, [apertura])
      contar(porRonda, `cobro ${cobro} / cierre ${cierre.status}${comoCerro === 'simultaneo' ? ' simultanea' : ''}`)

      expect(['cobrado', 'rechazado', 'conflicto']).toContain(cobro)
      if (comoCerro === 'simultaneo') {
        // El cierre no cerró: el cobro no pudo ver la caja cerrada. Después se cierra sin carrera.
        expect(cobro).not.toBe('rechazado')
        expect((await cerrar(owner, turnoId, [{ cajaId: caja, declarado: declarado(1000) }])).status).toBe(200)
      }
      const pagos = await prisma.pago.findMany({ where: { turnoCajaId: apertura, estado: 'aprobado' }, select: { monto: true } })
      expect(pagos).toHaveLength(cobro === 'cobrado' ? 1 : 0)
      // 1000 de fondo más los pagos aprobados de la apertura que quedaron en la base: 1000.00 o 1250.00.
      const enLaBase = 1000 + pagos.reduce((acc, p) => acc + p.monto.toNumber(), 0)
      expect((await arqueoEnBase(apertura)).efectivo[0]).toBe(enLaBase.toFixed(2))
    }

    mostrarDistribucion(`[cierre e2e] caso 9a: ${JSON.stringify(porRonda)}; reintentos: ${reintentos.desde(antes)}`)
  }, 120_000)

  /**
   * El entrelazado que la carrera libre del 9a no garantiza: el cobro abre su transacción y lee algo, el cierre termina
   * entero (HTTP 200) y recién ahí el cobro inserta. En el primer intento el cobro avisa `leyo` y espera `puedeInsertar`;
   * los reintentos no esperan nada. `leeLaCaja` es el patrón de #358 (9b); sin él, el control negativo (9c).
   */
  async function cobroEntrelazado(leeLaCaja: boolean) {
    const { rest, caja, turnoId, apertura } = await restauranteConTurno(1000)
    const sesionId = await fx.sesion((await fx.mesa(rest)).id)
    const leyo = senal()
    const puedeInsertar = senal()
    const antes = reintentos.foto()
    let intento = 0

    const cobro = comoTermino(
      runSerializableTransaction(
        prisma,
        async (tx) => {
          intento++
          if (leeLaCaja) {
            const enLaBase = await tx.turnoCaja.findUniqueOrThrow({ where: { id: apertura }, select: { cerradoEn: true } })
            if (enLaBase.cerradoEn !== null) throw new ConflictException('caja cerrada')
          } else {
            // Postgres toma la foto de la transacción en la primera consulta, no en el BEGIN: sin leer nada, el insert
            // sería un cobro que empieza después del cierre, sin ninguna concurrencia. Lee la sesión, como un cobro real.
            await tx.sesionMesa.findUniqueOrThrow({ where: { id: sesionId }, select: { estado: true } })
          }
          if (intento === 1) {
            leyo.liberar()
            await puedeInsertar.promesa
          }
          await tx.pago.create({ data: { sesionId, turnoCajaId: apertura, metodo: 'efectivo', estado: 'aprobado', monto: 250 } })
          return 'cobrado'
        },
        'cobroSimulado',
      ),
    )

    await leyo.promesa
    const cierre = await cerrar(owner, turnoId, [{ cajaId: caja, declarado: declarado(1000) }])
    puedeInsertar.liberar()
    const resultado = await cobro

    return {
      cierre: cierre.status,
      cobro: resultado,
      pagosAprobados: await prisma.pago.count({ where: { turnoCajaId: apertura, estado: 'aprobado' } }),
      esperadoEfectivo: (await arqueoEnBase(apertura)).efectivo[0],
      reintentosDelCobro: (reintentos.total.cobroSimulado ?? 0) - (antes.cobroSimulado ?? 0),
    }
  }

  it(`9b. el cobro leyó la caja abierta, el cierre termina, y recién ahí el cobro inserta (${RONDAS_ENTRELAZADAS} rondas): el cobro se rechaza`, async () => {
    const porRonda: Record<string, number> = {}

    for (let ronda = 0; ronda < RONDAS_ENTRELAZADAS; ronda++) {
      const r = await cobroEntrelazado(true)
      contar(porRonda, `cobro ${r.cobro} / cierre ${r.cierre} / reintentos del cobro ${r.reintentosDelCobro}`)

      // El primer intento choca con el cierre (P2034) y el reintento ya lee la caja cerrada.
      expect(r).toEqual({ cierre: 200, cobro: 'rechazado', pagosAprobados: 0, esperadoEfectivo: '1000.00', reintentosDelCobro: 1 })
    }

    mostrarDistribucion(`[cierre e2e] caso 9b: ${JSON.stringify(porRonda)}`)
  }, 60_000)

  it(`9c. control negativo: un cobro que no lee la caja adentro (${RONDAS_ENTRELAZADAS} rondas) queda cobrado después del arqueo`, async () => {
    const porRonda: Record<string, number> = {}

    for (let ronda = 0; ronda < RONDAS_ENTRELAZADAS; ronda++) {
      const r = await cobroEntrelazado(false)
      contar(porRonda, `cobro ${r.cobro} / cierre ${r.cierre} / reintentos del cobro ${r.reintentosDelCobro}`)

      // Por qué #358 tiene que leer la caja adentro: con el mismo entrelazado que el 9b, el primer intento de un cobro que
      // solo inserta también choca con el cierre (P2034; Postgres lo informa como "conflict out to pivot, during read" en
      // el INSERT del pago), pero el reintento ya no tiene con qué chocar y, como no mira la caja, inserta igual. Queda
      // cobrado en una caja ya cerrada, y el pago afuera del arqueo (1000.00, sin los 250). Serializable sola no alcanza:
      // lo que rechaza el reintento del 9b es la lectura de la caja. El test afirma esa inconsistencia: si algún día deja
      // de pasar, cambió algo que #358 da por sabido. La aserción de reintentosDelCobro: 1 prueba que el entrelazado
      // ocurrió: con 0 reintentos no habría habido concurrencia.
      expect(r).toEqual({ cierre: 200, cobro: 'cobrado', pagosAprobados: 1, esperadoEfectivo: '1000.00', reintentosDelCobro: 1 })
    }

    mostrarDistribucion(`[cierre e2e] caso 9c: ${JSON.stringify(porRonda)}`)
  }, 60_000)
})
