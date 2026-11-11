import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { AppE2e, crearAppE2e } from '../test/app-e2e'
import { FixtureDeCaja, marcadorDeLaCorrida } from '../test/fixture-de-caja'
import { MENSAJE_CURSOR_INVALIDO } from './historial.service'

// El resumen, el historial y el detalle del turno (#357) por HTTP, contra Postgres, con los guards de permisos reales
// (test/app-e2e.ts). Los turnos se abren y se cierran por HTTP, salvo los que necesitan fechas elegidas (insertados con
// Prisma, ya cerrados); los pagos se insertan con Prisma, porque hasta #358 ningún cobro escribe turnoCajaId. Los
// esperados son literales calculados a mano: este archivo no usa resumenDeTurno ni esperadoDeCaja.

type Declarado = { efectivo: number; debito: number; credito: number; transferencia: number }
const declarado = (efectivo: number, debito = 0, credito = 0, transferencia = 0): Declarado => ({ efectivo, debito, credito, transferencia })
const ms = (fecha: Date, delta: number) => new Date(fecha.getTime() + delta)

describe('Resumen, historial y detalle del turno contra Postgres (e2e)', () => {
  let api: AppE2e
  let prisma: PrismaService
  let fx: FixtureDeCaja
  let marcaId = ''
  let owner = ''
  let ownerDeOtraMarca = ''

  /** Abre un turno por HTTP. Devuelve el turno, cuándo lo abrió Postgres y la apertura de cada caja. */
  async function abrirTurno(restauranteId: string, cajas: { cajaId: string; fondoInicial: number }[], asignaciones: { mesaId: string; mozoId: string }[] = []) {
    const res = await api.pedir('post', '/turnos', { usuarioId: owner, body: { restauranteId, cajas, asignaciones } })
    expect(res.status).toBe(201)
    const aperturas = Object.fromEntries(res.body.turno.cajas.map((c: { cajaId: string; id: string }) => [c.cajaId, c.id]))
    return { turnoId: res.body.turno.id as string, abiertoEn: new Date(res.body.turno.abiertoEn), aperturas: aperturas as Record<string, string> }
  }

  const resumen = (turnoId: string, usuarioId = owner) => api.pedir('get', `/turnos/${turnoId}/resumen`, { usuarioId })
  const detalle = (turnoId: string, usuarioId = owner) => api.pedir('get', `/turnos/${turnoId}`, { usuarioId })
  const historial = (restauranteId: string, query: Record<string, string> = {}, usuarioId = owner) =>
    api.pedir('get', '/turnos', { usuarioId, query: { restauranteId, ...query } })

  /** Una sesión en una mesa nueva del restaurante. */
  const sesionEn = async (restauranteId: string) => fx.sesion((await fx.mesa(restauranteId)).id)

  beforeAll(async () => {
    api = await crearAppE2e()
    prisma = api.prisma
    fx = new FixtureDeCaja(prisma, marcadorDeLaCorrida('consultas'))
    marcaId = await fx.marca()
    owner = await fx.usuario('OWNER', { marcaId })
    ownerDeOtraMarca = await fx.usuario('OWNER', { marcaId: await fx.marca('E2E Caja otra marca') })
  })

  afterAll(async () => {
    try {
      if (fx) await fx.limpiar()
    } finally {
      if (api) await api.cerrar()
    }
  })

  it('1. ciclo completo: resumen del turno abierto y del cerrado, detalle e historial, con valores calculados a mano', async () => {
    const rest = await fx.restaurante(marcaId)
    const principal = await fx.caja(rest, { nombre: 'Principal' })
    const barra = await fx.caja(rest, { nombre: 'Barra' })
    const [mesa1, mesa2] = [await fx.mesa(rest), await fx.mesa(rest)]
    const zoe = await fx.mozo(rest, { nombre: 'Zoe' })
    const ana = await fx.mozo(rest, { nombre: 'Ana' })
    const { turnoId, abiertoEn, aperturas } = await abrirTurno(
      rest,
      [
        { cajaId: principal, fondoInicial: 10000 },
        { cajaId: barra, fondoInicial: 5000 },
      ],
      [
        { mesaId: mesa1.id, mozoId: zoe },
        { mesaId: mesa2.id, mozoId: ana },
      ],
    )
    const mov = (tipo: 'INGRESO' | 'EGRESO', monto: number) =>
      api.pedir('post', `/turnos/${turnoId}/movimientos`, { usuarioId: owner, body: { cajaId: principal, tipo, monto, motivo: `e2e ${tipo}` } })
    expect((await mov('INGRESO', 2000)).status).toBe(201)
    expect((await mov('EGRESO', 750.5)).status).toBe(201)

    const [s1, s2] = [await fx.sesion(mesa1.id), await fx.sesion(mesa2.id)]
    const P = aperturas[principal]
    const B = aperturas[barra]
    const enCaja = (turnoCajaId: string, metodo: string, monto: number, propina: number, mozoId: string | null, estado = 'aprobado') =>
      fx.pago({ sesionId: s1, turnoCajaId, metodo, estado, monto, propina, mozoId, fechaCobro: ms(abiertoEn, 1) })
    await enCaja(P, 'efectivo', 4000, 400, zoe)
    await enCaja(P, 'debito', 3000, 300, ana)
    await enCaja(P, 'credito', 2500, 0, null)
    await enCaja(P, 'transferencia', 1200, 120, ana)
    await enCaja(P, 'efectivo', 999, 99, zoe, 'pendiente')
    await enCaja(P, 'debito', 888, 88, ana, 'cancelado')
    await enCaja(B, 'efectivo', 1500, 150, zoe)

    // Mercado Pago (sin caja): las fechas salen del abiertoEn que puso Postgres, no del reloj de Node.
    const anterior = await fx.turnoCerrado(rest, owner, { abiertoEn: ms(abiertoEn, -3 * 3_600_000), cerradoEn: ms(abiertoEn, -2 * 3_600_000) })
    // Un pago aprobado en una caja del turno anterior: no cuenta en este.
    const aperturaAnterior = await prisma.turnoCaja.create({
      data: { turnoId: anterior, cajaId: principal, fondoInicial: 0, abiertoEn: ms(abiertoEn, -3 * 3_600_000), cerradoEn: ms(abiertoEn, -2 * 3_600_000) },
    })
    await enCaja(aperturaAnterior.id, 'efectivo', 7777, 77, zoe)
    const mp = (sesionId: string, monto: number, fechaCobro: Date, extra: { estado?: string; requiereRevision?: boolean } = {}) =>
      fx.pago({ sesionId, turnoCajaId: null, metodo: 'mercadopago', estado: extra.estado ?? 'aprobado', monto, fechaCobro, requiereRevision: extra.requiereRevision })
    const mpDentro = await mp(s2, 800, ms(abiertoEn, 1))
    const mpRevision = await mp(s1, 450, ms(abiertoEn, 2), { requiereRevision: true })
    await mp(s1, 11, ms(abiertoEn, -1))
    await mp(await sesionEn(await fx.restaurante(marcaId, 'E2E Caja otro restaurante')), 22, ms(abiertoEn, 1))
    await mp(s1, 33, ms(abiertoEn, 1), { estado: 'pendiente' })
    await mp(s1, 44, ms(abiertoEn, -2.5 * 3_600_000))

    // Principal: efectivo 4000 + débito 3000 + crédito 2500 + transferencia 1200; Barra: efectivo 1500.
    const lasCajas = {
      porMetodo: [
        { metodo: 'efectivo', cantidad: 2, monto: 5500, propina: 550 },
        { metodo: 'debito', cantidad: 1, monto: 3000, propina: 300 },
        { metodo: 'credito', cantidad: 1, monto: 2500, propina: 0 },
        { metodo: 'transferencia', cantidad: 1, monto: 1200, propina: 120 },
      ],
      // Ana: 3000 + 1200 y 300 + 120. Zoe: 4000 + 1500 y 400 + 150. Sin mozo: el crédito.
      porMozo: [
        { mozoId: ana, mozoNombre: 'Ana', cantidad: 2, monto: 4200, propina: 420 },
        { mozoId: zoe, mozoNombre: 'Zoe', cantidad: 2, monto: 5500, propina: 550 },
        { mozoId: null, mozoNombre: null, cantidad: 1, monto: 2500, propina: 0 },
      ],
      total: { cantidad: 5, monto: 12200, propina: 970 },
    }
    const pagosDeMercadoPago = [
      { id: mpDentro, mesaNumero: mesa2.numero, monto: 800, propina: 0, fechaCobro: ms(abiertoEn, 1).toISOString(), requiereRevision: false },
      { id: mpRevision, mesaNumero: mesa1.numero, monto: 450, propina: 0, fechaCobro: ms(abiertoEn, 2).toISOString(), requiereRevision: true },
    ]

    const antes = Date.now()
    const abierto = await resumen(turnoId)
    const despues = Date.now()
    expect(abierto.status).toBe(200)
    expect(abierto.body).toEqual({
      turno: { id: turnoId, abiertoEn: abiertoEn.toISOString(), cerradoEn: null },
      ...lasCajas,
      mercadoPago: { desde: abiertoEn.toISOString(), hasta: expect.any(String), cantidad: 2, monto: 1250, propina: 0, pagos: pagosDeMercadoPago },
    })
    const hasta = new Date(abierto.body.mercadoPago.hasta).getTime()
    expect(hasta).toBeGreaterThanOrEqual(antes)
    expect(hasta).toBeLessThanOrEqual(despues)

    // Principal: efectivo 10000 + 4000 + 400 + 2000 − 750,50 = 15649,50; débito 3300; crédito 2500; transferencia 1320.
    // Barra: efectivo 5000 + 1500 + 150 = 6650.
    const cierre = await api.pedir('post', `/turnos/${turnoId}/cierre`, {
      usuarioId: owner,
      body: {
        cajas: [
          { cajaId: principal, declarado: declarado(15700, 3300, 2400, 1320) },
          { cajaId: barra, declarado: declarado(6650) },
        ],
      },
    })
    expect(cierre.status).toBe(200)
    const cerradoEn = (await prisma.turno.findUniqueOrThrow({ where: { id: turnoId } })).cerradoEn as Date

    const cerrado = await resumen(turnoId)
    expect(cerrado.status).toBe(200)
    expect(cerrado.body).toEqual({
      turno: { id: turnoId, abiertoEn: abiertoEn.toISOString(), cerradoEn: cerradoEn.toISOString() },
      ...lasCajas,
      mercadoPago: { desde: abiertoEn.toISOString(), hasta: cerradoEn.toISOString(), cantidad: 2, monto: 1250, propina: 0, pagos: pagosDeMercadoPago },
    })

    const ceros = (efectivo: [number, number, number]) => [
      { metodo: 'efectivo', esperado: efectivo[0], declarado: efectivo[1], diferencia: efectivo[2] },
      { metodo: 'debito', esperado: 0, declarado: 0, diferencia: 0 },
      { metodo: 'credito', esperado: 0, declarado: 0, diferencia: 0 },
      { metodo: 'transferencia', esperado: 0, declarado: 0, diferencia: 0 },
    ]
    const nombreDelOwner = (await prisma.usuario.findUniqueOrThrow({ where: { id: owner } })).nombre
    const movimientoDe = (m: { id: string; tipo: string; monto: { toNumber(): number }; motivo: string; createdAt: Date }) => ({
      id: m.id,
      cajaId: principal,
      cajaNombre: 'Principal',
      tipo: m.tipo,
      monto: m.monto.toNumber(),
      motivo: m.motivo,
      usuario: { id: owner, nombre: nombreDelOwner },
      createdAt: m.createdAt.toISOString(),
    })
    const movimientos = await prisma.movimientoCaja.findMany({ where: { turnoCajaId: P }, orderBy: { createdAt: 'asc' } })
    expect(movimientos.map((m) => [m.tipo, m.monto.toFixed(2)])).toEqual([
      ['INGRESO', '2000.00'],
      ['EGRESO', '750.50'],
    ])

    const det = await detalle(turnoId)
    expect(det.status).toBe(200)
    const cabecera = {
      id: turnoId,
      abiertoEn: abiertoEn.toISOString(),
      abiertoPor: { id: owner, nombre: nombreDelOwner },
      cerradoEn: cerradoEn.toISOString(),
      cerradoPor: { id: owner, nombre: nombreDelOwner },
      observaciones: null,
    }
    const arqueoPrincipal = [
      { metodo: 'efectivo', esperado: 15649.5, declarado: 15700, diferencia: 50.5 },
      { metodo: 'debito', esperado: 3300, declarado: 3300, diferencia: 0 },
      { metodo: 'credito', esperado: 2500, declarado: 2400, diferencia: -100 },
      { metodo: 'transferencia', esperado: 1320, declarado: 1320, diferencia: 0 },
    ]
    expect(det.body).toEqual({
      ...cabecera,
      cajas: [
        { id: B, cajaId: barra, nombre: 'Barra', fondoInicial: 5000, arqueo: ceros([6650, 6650, 0]), movimientos: [] },
        { id: P, cajaId: principal, nombre: 'Principal', fondoInicial: 10000, arqueo: arqueoPrincipal, movimientos: movimientos.map(movimientoDe) },
      ],
      asignaciones: [
        { mesaId: mesa1.id, mesaNumero: mesa1.numero, mozoId: zoe, mozoNombre: 'Zoe' },
        { mesaId: mesa2.id, mesaNumero: mesa2.numero, mozoId: ana, mozoNombre: 'Ana' },
      ],
    })

    const hist = await historial(rest)
    expect(hist.status).toBe(200)
    expect(hist.body.siguiente).toBeNull()
    expect(hist.body.items.map((t: { id: string }) => t.id)).toEqual([turnoId, anterior])
    expect(hist.body.items[0]).toEqual({
      ...cabecera,
      cajas: [
        { id: B, cajaId: barra, nombre: 'Barra', fondoInicial: 5000, arqueo: ceros([6650, 6650, 0]), movimientos: { cantidad: 0, ingresos: 0, egresos: 0 } },
        { id: P, cajaId: principal, nombre: 'Principal', fondoInicial: 10000, arqueo: arqueoPrincipal, movimientos: { cantidad: 2, ingresos: 2000, egresos: 750.5 } },
      ],
    })
  })

  it('2. decimales exactos: 0,10 + 0,20 con una propina de 0,05 dan 0.3 y 0.05 como number', async () => {
    const rest = await fx.restaurante(marcaId)
    const caja = await fx.caja(rest)
    const { turnoId, aperturas } = await abrirTurno(rest, [{ cajaId: caja, fondoInicial: 0 }])
    const sesionId = await sesionEn(rest)
    await fx.pago({ sesionId, turnoCajaId: aperturas[caja], metodo: 'efectivo', estado: 'aprobado', monto: '0.10', propina: '0.05', mozoId: null })
    await fx.pago({ sesionId, turnoCajaId: aperturas[caja], metodo: 'efectivo', estado: 'aprobado', monto: '0.20', mozoId: null })

    const res = await resumen(turnoId)

    expect(res.body.porMetodo[0]).toEqual({ metodo: 'efectivo', cantidad: 2, monto: 0.3, propina: 0.05 })
    expect(res.body.total).toEqual({ cantidad: 2, monto: 0.3, propina: 0.05 })
    expect(res.body.porMozo).toEqual([{ mozoId: null, mozoNombre: null, cantidad: 2, monto: 0.3, propina: 0.05 }])
  })

  it('3. la franja de Mercado Pago incluye los extremos exactos (leídos de la base) y no 1 ms antes ni 1 ms después', async () => {
    const rest = await fx.restaurante(marcaId)
    const turnoId = await fx.turnoCerrado(rest, owner, { abiertoEn: new Date('2026-10-20T20:00:00.123Z'), cerradoEn: new Date('2026-10-21T02:30:00.456Z') })
    const { abiertoEn, cerradoEn } = await prisma.turno.findUniqueOrThrow({ where: { id: turnoId } })
    const sesionId = await sesionEn(rest)
    const mp = (fechaCobro: Date, monto: number) =>
      fx.pago({ sesionId, turnoCajaId: null, metodo: 'mercadopago', estado: 'aprobado', monto, fechaCobro })
    const enAbiertoEn = await mp(abiertoEn, 1)
    const enCerradoEn = await mp(cerradoEn as Date, 2)
    await mp(ms(abiertoEn, -1), 4)
    await mp(ms(cerradoEn as Date, 1), 8)

    const res = await resumen(turnoId)

    expect(res.body.mercadoPago).toMatchObject({
      desde: '2026-10-20T20:00:00.123Z',
      hasta: '2026-10-21T02:30:00.456Z',
      cantidad: 2,
      monto: 3,
    })
    expect(res.body.mercadoPago.pagos.map((p: { id: string }) => p.id)).toEqual([enAbiertoEn, enCerradoEn])
  })

  describe('4 y 5. el historial: paginación y validación de la query', () => {
    let rest = ''
    let abiertoId = ''
    // Ids con un prefijo de la corrida y un número al final: así el desempate por id es el orden de los números.
    const prefijo = randomUUID().slice(0, 24)
    const idDe = (n: number) => `${prefijo}${String(n).padStart(12, '0')}`
    const hora = (h: number) => new Date(Date.UTC(2026, 9, 1, h))

    beforeAll(async () => {
      rest = await fx.restaurante(marcaId)
      const caja = await fx.caja(rest)
      // 35 turnos cerrados; del 11 al 15 con el mismo abiertoEn (cargados fuera de orden), y uno abierto, el más nuevo.
      const orden = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 11, 15, 12, 14, ...Array.from({ length: 20 }, (_, i) => i + 16)]
      for (const n of orden) {
        const abiertoEn = n >= 11 && n <= 15 ? hora(13) : hora(n)
        await fx.turnoCerrado(rest, owner, { id: idDe(n), abiertoEn, cerradoEn: ms(abiertoEn, 3_600_000) })
      }
      abiertoId = (await abrirTurno(rest, [{ cajaId: caja, fondoInicial: 0 }])).turnoId
    })

    /** Recorre todas las páginas con ese limite. */
    async function paginas(limite: number) {
      const resultado: { id: string; arqueo: unknown }[][] = []
      let cursor: string | undefined
      do {
        const res = await historial(rest, { limite: String(limite), ...(cursor ? { cursor } : {}) })
        expect(res.status).toBe(200)
        resultado.push(res.body.items.map((t: { id: string; cajas: { arqueo: unknown }[] }) => ({ id: t.id, arqueo: t.cajas[0]?.arqueo })))
        cursor = res.body.siguiente ?? undefined
      } while (cursor)
      return resultado
    }

    // Por abiertoEn descendente; el 11 al 15 empatan y van por id descendente.
    const ESPERADO = [35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]

    it('4. con limite=10 son 10/10/10/6, sin huecos ni repetidos, con el abierto primero y su arqueo en null', async () => {
      const recorridas = await paginas(10)

      expect(recorridas.map((p) => p.length)).toEqual([10, 10, 10, 6])
      expect(recorridas.flat().map((t) => t.id)).toEqual([abiertoId, ...ESPERADO.map(idDe)])
      expect(recorridas[0][0]).toEqual({ id: abiertoId, arqueo: null })
    })

    it('4. con limite=12 son 12/12/12: la última trae exactamente 12 y siguiente es null', async () => {
      const ultima = await historial(rest, { limite: '12', cursor: idDe(12) })
      const recorridas = await paginas(12)

      expect(recorridas.map((p) => p.length)).toEqual([12, 12, 12])
      expect(recorridas.flat().map((t) => t.id)).toEqual([abiertoId, ...ESPERADO.map(idDe)])
      expect(ultima.body.items).toHaveLength(12)
      expect(ultima.body.siguiente).toBeNull()
    })

    it.each(['0', '101', 'abc', '2.5', '-1'])('5. limite=%s es 400', async (limite) => {
      expect((await historial(rest, { limite })).status).toBe(400)
    })

    it('5. limite=100 trae los 36 y limite=1 trae uno; sin restauranteId es 400', async () => {
      expect((await historial(rest, { limite: '100' })).body.items).toHaveLength(36)
      expect((await historial(rest, { limite: '1' })).body.items.map((t: { id: string }) => t.id)).toEqual([abiertoId])
      expect((await api.pedir('get', '/turnos', { usuarioId: owner })).status).toBe(400)
    })

    it('5. un cursor de otro restaurante, uno que no existe y uno que no es un uuid son 400', async () => {
      const otro = await fx.restaurante(marcaId)
      const ajeno = await fx.turnoCerrado(otro, owner, { abiertoEn: hora(1), cerradoEn: hora(2) })

      for (const cursor of [ajeno, randomUUID()]) {
        const res = await historial(rest, { cursor })
        expect(res.status).toBe(400)
        expect(res.body.message).toBe(MENSAJE_CURSOR_INVALIDO)
      }
      expect((await historial(rest, { cursor: 'no-es-un-uuid' })).status).toBe(400)
    })
  })

  describe('6 y 7. permisos con los guards reales, y GET /turnos/actual', () => {
    let rest = ''
    let caja = ''
    let turnoId = ''
    let ajeno = ''
    const usuarios: Record<string, string> = {}

    beforeAll(async () => {
      rest = await fx.restaurante(marcaId)
      caja = await fx.caja(rest)
      for (const rol of ['GERENTE', 'JEFE_SALON', 'MOZO', 'COCINA'] as const) usuarios[rol] = await fx.usuario(rol, { restauranteId: rest })
      turnoId = (await abrirTurno(rest, [{ cajaId: caja, fondoInicial: 0 }])).turnoId
      ajeno = await fx.turnoCerrado(await fx.restaurante(marcaId), owner, { abiertoEn: new Date('2026-10-01T10:00:00Z'), cerradoEn: new Date('2026-10-01T11:00:00Z') })
    })

    it.each(['OWNER', 'GERENTE', 'JEFE_SALON'])('6. %s del restaurante ve el historial, el detalle y el resumen (200)', async (rol) => {
      const usuarioId = rol === 'OWNER' ? owner : usuarios[rol]

      expect((await historial(rest, {}, usuarioId)).status).toBe(200)
      expect((await detalle(turnoId, usuarioId)).status).toBe(200)
      expect((await resumen(turnoId, usuarioId)).status).toBe(200)
    })

    it.each([
      ['el MOZO', () => usuarios.MOZO],
      ['COCINA', () => usuarios.COCINA],
      ['el OWNER de otra marca', () => ownerDeOtraMarca],
    ])('6. %s recibe 403 en los tres', async (_caso, usuarioId) => {
      expect((await historial(rest, {}, usuarioId())).status).toBe(403)
      expect((await detalle(turnoId, usuarioId())).status).toBe(403)
      expect((await resumen(turnoId, usuarioId())).status).toBe(403)
    })

    it('6. sin token, 401; un turno de otro restaurante, 403 (el GERENTE); uno que no existe, 404', async () => {
      for (const ruta of ['/turnos', `/turnos/${turnoId}`, `/turnos/${turnoId}/resumen`]) {
        expect((await api.pedir('get', ruta, { query: { restauranteId: rest } })).status).toBe(401)
      }
      expect((await detalle(ajeno, usuarios.GERENTE)).status).toBe(403)
      expect((await resumen(ajeno, usuarios.GERENTE)).status).toBe(403)
      const inexistente = randomUUID()
      expect((await detalle(inexistente)).status).toBe(404)
      expect((await resumen(inexistente)).status).toBe(404)
    })

    it('7. GET /turnos/actual sigue respondiendo lo de siempre, con y sin turno abierto (no lo tapa GET /turnos/:id)', async () => {
      const conTurno = await api.pedir('get', '/turnos/actual', { usuarioId: owner, query: { restauranteId: rest } })
      expect(conTurno.status).toBe(200)
      expect(conTurno.body.turno.id).toBe(turnoId)

      const sinTurno = await api.pedir('get', '/turnos/actual', { usuarioId: owner, query: { restauranteId: await fx.restaurante(marcaId) } })
      expect(sinTurno.status).toBe(200)
      expect(sinTurno.body).toEqual({ turno: null })
    })
  })
})
