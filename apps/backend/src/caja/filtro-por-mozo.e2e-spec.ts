import * as QRCode from 'qrcode'
import { PrismaService } from '../prisma/prisma.service'
import { AppE2e, crearAppE2e } from '../test/app-e2e'
import { FixtureDeCaja, marcadorDeLaCorrida } from '../test/fixture-de-caja'

// El filtro por mozo de GET /mesas y GET /sessions/activas (#357) por HTTP, contra Postgres, con los guards y el
// AccesoService reales (test/app-e2e.ts). Cada test arma su propio mundo; los turnos se abren, se reasignan y se cierran
// por HTTP, y la baja de un mozo es la de la app (DELETE de su membresía en Personal). Cada caso se mira en los dos
// endpoints: los ids por conjunto, y el orden contra la lista de alguien que ve todo.
//
// GET /mesas genera un QR por mesa, y dentro de Jest cada uno tarda alrededor de un segundo (fuera, milisegundos): con
// el QR real cada caso pasa el timeout. Por eso `toDataURL` es un doble en todos los casos menos el a, que mira el real.
const QR_DE_TEST = 'data:image/png;base64,qr-de-test'

const DECLARADO_EN_CERO = { efectivo: 0, debito: 0, credito: 0, transferencia: 0 }

interface Mundo {
  marcaId: string
  rest: string
  caja: string
  /** m1..m5, en ese orden. */
  m: [string, string, string, string, string]
  /** Las mesas con una sesión activa: m1, m3 y m5. */
  conSesion: string[]
  ana: { usuarioId: string; mozoId: string }
  beto: { usuarioId: string; mozoId: string }
  owner: string
  gerente: string
  jefe: string
}

describe('Filtro por mozo de GET /mesas y GET /sessions/activas contra Postgres (e2e)', () => {
  let api: AppE2e
  let prisma: PrismaService
  let fx: FixtureDeCaja

  /** Una marca con su restaurante R, las mesas m1..m5, Ana y Beto (MOZO), un OWNER, un GERENTE, un JEFE_SALON y una caja. */
  async function mundo(): Promise<Mundo> {
    const marcaId = await fx.marca('E2E Filtro por mozo')
    const rest = await fx.restaurante(marcaId)
    const m: string[] = []
    for (let i = 0; i < 5; i++) m.push((await fx.mesa(rest)).id)
    // Sesiones con iniciadaEn distintos: /sessions/activas ordena por ahí y un empate dejaría el orden librado a Postgres.
    const base = Date.now() - 60 * 60_000
    const conSesion = [m[0], m[2], m[4]]
    for (const [i, mesaId] of conSesion.entries()) await fx.sesion(mesaId, { iniciadaEn: new Date(base + i * 1000) })
    return {
      marcaId,
      rest,
      caja: await fx.caja(rest),
      m: m as Mundo['m'],
      conSesion,
      ana: await fx.personalConPerfil('MOZO', rest, { nombre: 'Ana' }),
      beto: await fx.personalConPerfil('MOZO', rest, { nombre: 'Beto' }),
      owner: await fx.usuario('OWNER', { marcaId }),
      gerente: await fx.usuario('GERENTE', { restauranteId: rest }),
      jefe: (await fx.personalConPerfil('JEFE_SALON', rest, { nombre: 'Jefa' })).usuarioId,
    }
  }

  /** Las asignaciones del mundo base: m1 y m2 a Ana, m3 y m4 a Beto; m5 sin asignar. */
  const asignacionesBase = (w: Mundo) => [
    { mesaId: w.m[0], mozoId: w.ana.mozoId },
    { mesaId: w.m[1], mozoId: w.ana.mozoId },
    { mesaId: w.m[2], mozoId: w.beto.mozoId },
    { mesaId: w.m[3], mozoId: w.beto.mozoId },
  ]

  async function abrirTurno(w: Mundo, asignaciones: { mesaId: string; mozoId: string }[], rest = w.rest, caja = w.caja): Promise<string> {
    const res = await api.pedir('post', '/turnos', {
      usuarioId: w.owner,
      body: { restauranteId: rest, cajas: [{ cajaId: caja, fondoInicial: 0 }], asignaciones },
    })
    expect(res.status).toBe(201)
    return res.body.turno.id
  }

  async function cerrarTurno(w: Mundo, turnoId: string, caja = w.caja): Promise<void> {
    const res = await api.pedir('post', `/turnos/${turnoId}/cierre`, {
      usuarioId: w.owner,
      body: { cajas: [{ cajaId: caja, declarado: DECLARADO_EN_CERO }] },
    })
    expect(res.status).toBe(200)
  }

  const mesas = (usuarioId: string, restauranteId: string) => api.pedir('get', '/mesas', { usuarioId, query: { restauranteId } })
  const activas = (usuarioId: string, restauranteId: string) =>
    api.pedir('get', '/sessions/activas', { usuarioId, query: { restauranteId } })

  async function idsDe(usuarioId: string, restauranteId: string): Promise<{ mesas: string[]; sesiones: string[] }> {
    const [rm, rs] = [await mesas(usuarioId, restauranteId), await activas(usuarioId, restauranteId)]
    expect(rm.status).toBe(200)
    expect(rs.status).toBe(200)
    return {
      mesas: rm.body.map((x: { id: string }) => x.id),
      sesiones: rs.body.map((x: { mesaId: string }) => x.mesaId),
    }
  }

  const ordenadas = (ids: string[]) => [...ids].sort()

  /**
   * Lo que ve `usuarioId` en los dos endpoints: exactamente `visibles` (y las sesiones de esas mesas), en el mismo orden
   * relativo que la lista de `referencia`, que ve todo.
   */
  async function ve(usuarioId: string, restauranteId: string, visibles: string[], conSesion: string[], referencia: string) {
    const lo = await idsDe(usuarioId, restauranteId)
    const todo = await idsDe(referencia, restauranteId)
    expect(ordenadas(lo.mesas)).toEqual(ordenadas(visibles))
    expect(ordenadas(lo.sesiones)).toEqual(ordenadas(conSesion.filter((id) => visibles.includes(id))))
    expect(lo.mesas).toEqual(todo.mesas.filter((id) => visibles.includes(id)))
    expect(lo.sesiones).toEqual(todo.sesiones.filter((id) => visibles.includes(id)))
  }

  /** `ve` en R, con el GERENTE de referencia. */
  const veEnR = (w: Mundo, usuarioId: string, visibles: string[]) => ve(usuarioId, w.rest, visibles, w.conSesion, w.gerente)

  async function prohibido(usuarioId: string | undefined, restauranteId: string, status: number) {
    expect((await mesas(usuarioId as string, restauranteId)).status).toBe(status)
    expect((await activas(usuarioId as string, restauranteId)).status).toBe(status)
  }

  beforeAll(async () => {
    api = await crearAppE2e()
    prisma = api.prisma
    fx = new FixtureDeCaja(prisma, marcadorDeLaCorrida('filtro-por-mozo'))
  })

  beforeEach(() => {
    jest.spyOn(QRCode, 'toDataURL').mockImplementation(async () => QR_DE_TEST)
  })

  afterEach(() => jest.restoreAllMocks())

  afterAll(async () => {
    try {
      if (fx) await fx.limpiar()
    } finally {
      if (api) await api.cerrar()
    }
  })

  it('a. con el turno abierto, cada mozo ve sus mesas más las sin asignar, y GET /mesas sigue trayendo mozoMesas y qrImage', async () => {
    const w = await mundo()
    const [m1, m2, m3, m4, m5] = w.m
    await fx.mozoMesa(m1, w.ana.mozoId)
    await abrirTurno(w, asignacionesBase(w))

    await veEnR(w, w.ana.usuarioId, [m1, m2, m5])
    await veEnR(w, w.beto.usuarioId, [m3, m4, m5])

    // Con el QR real: las 3 mesas de Ana, alrededor de un segundo cada una.
    jest.restoreAllMocks()
    const res = await mesas(w.ana.usuarioId, w.rest)
    expect(res.body).toHaveLength(3)
    for (const mesa of res.body) {
      expect(Array.isArray(mesa.mozoMesas)).toBe(true)
      expect(mesa.qrImage).toMatch(/^data:image\/png;base64,.{100,}/)
    }
    const deM1 = res.body.find((x: { id: string }) => x.id === m1)
    expect(deM1.mozoMesas.map((mm: { mozo: { id: string; nombre: string } }) => mm.mozo)).toEqual([{ id: w.ana.mozoId, nombre: 'Ana' }])
  }, 60_000)

  it('b. OWNER, GERENTE y JEFE_SALON ven las 5 mesas y las 3 sesiones con el turno abierto', async () => {
    const w = await mundo()
    await abrirTurno(w, asignacionesBase(w))

    for (const quien of [w.owner, w.gerente, w.jefe]) {
      const lo = await idsDe(quien, w.rest)
      expect(ordenadas(lo.mesas)).toEqual(ordenadas(w.m))
      expect(ordenadas(lo.sesiones)).toEqual(ordenadas(w.conSesion))
    }
    await veEnR(w, w.owner, w.m)
    await veEnR(w, w.jefe, w.m)
  })

  it('c. la cuenta que es OWNER de la marca y además MOZO del restaurante ve todo', async () => {
    const w = await mundo()
    await abrirTurno(w, asignacionesBase(w))
    const ceci = await fx.personalConPerfil('MOZO', w.rest, { nombre: 'Ceci' })
    // Solo MOZO y sin mesas asignadas: ve la sin asignar.
    await veEnR(w, ceci.usuarioId, [w.m[4]])

    await prisma.membresia.create({ data: { usuarioId: ceci.usuarioId, rol: 'OWNER', marcaId: w.marcaId } })
    await veEnR(w, ceci.usuarioId, w.m)
  })

  it('d. sin turno abierto (nunca se abrió, o se cerró por HTTP con asignaciones) los mozos ven todo', async () => {
    const w = await mundo()
    await veEnR(w, w.ana.usuarioId, w.m)
    await veEnR(w, w.beto.usuarioId, w.m)

    const turnoId = await abrirTurno(w, asignacionesBase(w))
    await veEnR(w, w.ana.usuarioId, [w.m[0], w.m[1], w.m[4]])
    await cerrarTurno(w, turnoId)

    await veEnR(w, w.ana.usuarioId, w.m)
    await veEnR(w, w.beto.usuarioId, w.m)
  })

  it('e. con un turno abierto sin asignaciones los mozos ven todo', async () => {
    const w = await mundo()
    await abrirTurno(w, [])

    await veEnR(w, w.ana.usuarioId, w.m)
    await veEnR(w, w.beto.usuarioId, w.m)
  })

  it('f. una asignación de un turno cerrado no cuenta ni como asignada ni como del mozo', async () => {
    const w = await mundo()
    const [m1, m2, m3, m4, m5] = w.m
    const turno1 = await abrirTurno(w, [
      { mesaId: m1, mozoId: w.beto.mozoId },
      { mesaId: m2, mozoId: w.beto.mozoId },
    ])
    await cerrarTurno(w, turno1)
    await abrirTurno(w, [{ mesaId: m1, mozoId: w.ana.mozoId }])

    await veEnR(w, w.ana.usuarioId, [m1, m2, m3, m4, m5])
    await veEnR(w, w.beto.usuarioId, [m2, m3, m4, m5])
  })

  it('g. al reasignar m1 de Ana a Beto a mitad del turno, la mesa y su sesión pasan de la lista de Ana a la de Beto', async () => {
    const w = await mundo()
    const [m1, m2, m3, m4, m5] = w.m
    const turnoId = await abrirTurno(w, asignacionesBase(w))
    await veEnR(w, w.ana.usuarioId, [m1, m2, m5])
    await veEnR(w, w.beto.usuarioId, [m3, m4, m5])

    const res = await api.pedir('put', `/turnos/${turnoId}/asignaciones`, {
      usuarioId: w.owner,
      body: {
        asignaciones: [
          { mesaId: m1, mozoId: w.beto.mozoId },
          { mesaId: m2, mozoId: w.ana.mozoId },
          { mesaId: m3, mozoId: w.beto.mozoId },
          { mesaId: m4, mozoId: w.beto.mozoId },
        ],
      },
    })
    expect(res.status).toBe(200)

    await veEnR(w, w.ana.usuarioId, [m2, m5])
    await veEnR(w, w.beto.usuarioId, [m1, m3, m4, m5])
  })

  it('h. con Beto dado de baja desde Personal, sus mesas quedan sin asignar para Ana y Beto recibe 403', async () => {
    const w = await mundo()
    const turnoId = await abrirTurno(w, asignacionesBase(w))
    const membresia = await prisma.membresia.findUniqueOrThrow({
      where: { usuarioId_restauranteId: { usuarioId: w.beto.usuarioId, restauranteId: w.rest } },
    })
    const baja = await api.pedir('delete', `/restaurantes/${w.rest}/personal/${membresia.id}`, { usuarioId: w.owner })
    expect(baja.status).toBe(204)
    // Lo que deja la baja: el perfil inactivo y sus asignaciones todavía en el turno abierto.
    expect((await prisma.mozo.findUniqueOrThrow({ where: { id: w.beto.mozoId } })).activo).toBe(false)
    expect(await prisma.asignacionTurno.count({ where: { turnoId, mozoId: w.beto.mozoId } })).toBe(2)

    await veEnR(w, w.ana.usuarioId, w.m)
    await prohibido(w.beto.usuarioId, w.rest, 403)
  })

  it('i. un MOZO con membresía y el perfil inactivo ve solo las mesas sin asignar', async () => {
    const w = await mundo()
    await abrirTurno(w, asignacionesBase(w))
    const inactivo = await fx.personalConPerfil('MOZO', w.rest, { nombre: 'Inactivo', activo: false })

    await veEnR(w, inactivo.usuarioId, [w.m[4]])
  })

  it('j. MOZO en un restaurante y GERENTE en otro de la marca: filtra en el primero y ve todo en el segundo; sin membresía, 403', async () => {
    const w = await mundo()
    await abrirTurno(w, asignacionesBase(w))
    const r2 = await fx.restaurante(w.marcaId, 'E2E Filtro por mozo R2')
    const cajaR2 = await fx.caja(r2)
    const [n1, n2] = [(await fx.mesa(r2)).id, (await fx.mesa(r2)).id]
    await fx.sesion(n1)
    const mozoDeR2 = await fx.personalConPerfil('MOZO', r2, { nombre: 'Mozo R2' })
    await abrirTurno(w, [{ mesaId: n1, mozoId: mozoDeR2.mozoId }], r2, cajaR2)

    const dani = await fx.personalConPerfil('MOZO', w.rest, { nombre: 'Dani' })
    await prisma.membresia.create({ data: { usuarioId: dani.usuarioId, rol: 'GERENTE', restauranteId: r2 } })

    await veEnR(w, dani.usuarioId, [w.m[4]])
    await ve(dani.usuarioId, r2, [n1, n2], [n1], w.owner)
    await prohibido(w.ana.usuarioId, r2, 403)
  })

  it('k. COCINA recibe 403 y sin cuenta, 401, en los dos endpoints', async () => {
    const w = await mundo()
    await abrirTurno(w, asignacionesBase(w))
    const cocina = await fx.usuario('COCINA', { restauranteId: w.rest })

    await prohibido(cocina, w.rest, 403)
    await prohibido(undefined, w.rest, 401)
  })
})
