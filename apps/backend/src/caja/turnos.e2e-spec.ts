import { PrismaService } from '../prisma/prisma.service'
import { AppE2e, contar, contarReintentos, crearAppE2e, mostrarDistribucion } from '../test/app-e2e'
import { FixtureDeCaja, marcadorDeLaCorrida } from '../test/fixture-de-caja'
import { MENSAJE_CAJA_ABIERTA, MENSAJE_NOMBRE_REPETIDO } from './cajas.service'
import { MENSAJE_CAJA_YA_ABIERTA, MENSAJE_OPERACION_SIMULTANEA, MENSAJE_TURNO_ABIERTO } from './conflictos'

// La apertura de turnos y el ABM de cajas (#357) por HTTP, contra Postgres, con los guards de permisos reales: solo se
// reemplaza SupabaseAuthGuard, que toma el usuario de la base por un header (test/app-e2e.ts). Cada caso dice qué
// invariante prueba. Todo lo que crea la corrida cuelga de marcas con su marcador (test/fixture-de-caja.ts).

/** Las rondas de las carreras (casos 5 y 6). E2E_RONDAS las cambia, por ejemplo para correr una sola muchas veces. */
const RONDAS = Number(process.env.E2E_RONDAS ?? 10)

describe('Turnos de la caja contra Postgres (e2e)', () => {
  let api: AppE2e
  let prisma: PrismaService
  let fx: FixtureDeCaja
  let marcaId = ''
  let owner = ''
  let ownerDeOtraMarca = ''
  let reintentos: ReturnType<typeof contarReintentos>

  const abrir = (usuarioId: string, body: object) => api.pedir('post', '/turnos', { usuarioId, body })
  const actual = (usuarioId: string, restauranteId: string) =>
    api.pedir('get', '/turnos/actual', { usuarioId, query: { restauranteId } })
  const turnosDe = (restauranteId: string) => prisma.turno.count({ where: { restauranteId } })
  const abiertosDe = (restauranteId: string) => prisma.turno.count({ where: { restauranteId, cerradoEn: null } })

  /** Cierra un turno y sus cajas como lo hará el cierre (#357, PR A2): fecha y quién, juntos. */
  async function cerrarAMano(turnoId: string, usuarioId: string) {
    const ahora = new Date()
    await prisma.turnoCaja.updateMany({ where: { turnoId, cerradoEn: null }, data: { cerradoEn: ahora } })
    await prisma.turno.update({ where: { id: turnoId }, data: { cerradoEn: ahora, cerradoPorUsuarioId: usuarioId } })
  }

  beforeAll(async () => {
    api = await crearAppE2e()
    prisma = api.prisma
    fx = new FixtureDeCaja(prisma, marcadorDeLaCorrida('turnos'))
    marcaId = await fx.marca()
    owner = await fx.usuario('OWNER', { marcaId })
    ownerDeOtraMarca = await fx.usuario('OWNER', { marcaId: await fx.marca('E2E Caja otra marca') })
    reintentos = contarReintentos()
  })

  afterAll(async () => {
    if (reintentos) mostrarDistribucion(`[turnos e2e] reintentos por P2034: ${JSON.stringify(reintentos.total)}`)
    jest.restoreAllMocks()
    try {
      if (fx) await fx.limpiar()
    } finally {
      if (api) await api.cerrar()
    }
  })

  it('1. ciclo por HTTP: la apertura deja en la base lo que dice la respuesta, y un segundo turno abierto es 409', async () => {
    const rest = await fx.restaurante(marcaId)
    const jefe = await fx.usuario('JEFE_SALON', { restauranteId: rest })
    const principal = await fx.caja(rest, { nombre: 'Principal' })
    const barra = await fx.caja(rest, { nombre: 'Barra' })
    const otra = await fx.caja(rest, { nombre: 'Terraza' })
    const ana = await fx.mozo(rest, { nombre: 'Ana' })
    const [m1, m2] = [await fx.mesa(rest), await fx.mesa(rest)]

    // Sin turno: un null con envoltorio, un JSON válido.
    const sinTurno = await actual(jefe, rest)
    expect(sinTurno.status).toBe(200)
    expect(JSON.parse(sinTurno.text)).toEqual({ turno: null })

    const res = await abrir(jefe, {
      restauranteId: rest,
      cajas: [
        { cajaId: principal, fondoInicial: 15000.5 },
        { cajaId: barra, fondoInicial: 0.1 },
      ],
      asignaciones: [
        { mesaId: m1.id, mozoId: ana },
        { mesaId: m2.id, mozoId: ana },
      ],
    })
    expect(res.status).toBe(201)

    const turnos = await prisma.turno.findMany({ where: { restauranteId: rest }, include: { cajas: true, asignaciones: true } })
    expect(turnos).toHaveLength(1)
    const [turno] = turnos
    expect(turno).toMatchObject({ id: res.body.turno.id, cerradoEn: null, abiertoPorUsuarioId: jefe })
    expect(Object.fromEntries(turno.cajas.map((c) => [c.cajaId, c.fondoInicial.toFixed(2)]))).toEqual({
      [principal]: '15000.50',
      [barra]: '0.10',
    })
    expect(turno.asignaciones.map((a) => `${a.mesaId}:${a.mozoId}`).sort()).toEqual([`${m1.id}:${ana}`, `${m2.id}:${ana}`].sort())

    const consulta = await actual(jefe, rest)
    expect(consulta.status).toBe(200)
    expect(consulta.body.turno).toEqual(res.body.turno)

    const segundo = await abrir(jefe, { restauranteId: rest, cajas: [{ cajaId: otra, fondoInicial: 0 }] })
    expect(segundo.status).toBe(409)
    expect(segundo.body.message).toBe(MENSAJE_TURNO_ABIERTO)
    expect(await turnosDe(rest)).toBe(1)
  })

  it('2. reabrir: con el turno cerrado, uno nuevo con la misma caja abre (el índice parcial ignora los cerrados)', async () => {
    const rest = await fx.restaurante(marcaId)
    const caja = await fx.caja(rest)
    const cuerpo = { restauranteId: rest, cajas: [{ cajaId: caja, fondoInicial: 100 }] }

    const primero = await abrir(owner, cuerpo)
    expect(primero.status).toBe(201)
    await cerrarAMano(primero.body.turno.id, owner)

    const segundo = await abrir(owner, cuerpo)
    expect(segundo.status).toBe(201)
    expect(await turnosDe(rest)).toBe(2)
    expect(await abiertosDe(rest)).toBe(1)
  })

  it('3. precarga real: asigna las mesas con un solo mozo válido y avisa las que no pudo', async () => {
    const rest = await fx.restaurante(marcaId)
    const caja = await fx.caja(rest)
    const ana = await fx.mozo(rest, { nombre: 'Ana' })
    const beto = await fx.mozo(rest, { nombre: 'Beto' })
    const sinCuenta = await fx.mozo(rest, { nombre: 'Sin cuenta', conCuenta: false })
    const deBaja = await fx.mozo(rest, { nombre: 'De baja', activo: false })
    const conUno = await fx.mesa(rest)
    const conDos = await fx.mesa(rest)
    const sinMozos = await fx.mesa(rest)
    const conSinCuenta = await fx.mesa(rest)
    const conDeBaja = await fx.mesa(rest)
    const inactiva = await fx.mesa(rest, { activo: false })
    await fx.mozoMesa(conUno.id, ana)
    await fx.mozoMesa(conDos.id, ana)
    await fx.mozoMesa(conDos.id, beto)
    await fx.mozoMesa(conSinCuenta.id, sinCuenta)
    await fx.mozoMesa(conDeBaja.id, deBaja)
    await fx.mozoMesa(inactiva.id, beto)

    const res = await abrir(owner, { restauranteId: rest, cajas: [{ cajaId: caja, fondoInicial: 0 }] })

    expect(res.status).toBe(201)
    const filas = await prisma.asignacionTurno.findMany({ where: { turnoId: res.body.turno.id }, select: { mesaId: true, mozoId: true } })
    expect(filas).toEqual([{ mesaId: conUno.id, mozoId: ana }])
    expect(res.body.avisos).toHaveLength(3)
    expect(res.body.avisos).toEqual(
      expect.arrayContaining([
        { mesaId: conDos.id, mesaNumero: conDos.numero, motivo: 'varios-mozos' },
        { mesaId: conSinCuenta.id, mesaNumero: conSinCuenta.numero, motivo: 'mozo-sin-cuenta' },
        { mesaId: conDeBaja.id, mesaNumero: conDeBaja.numero, motivo: 'mozo-inactivo' },
      ]),
    )
    expect(res.body.avisos.map((a: { mesaId: string }) => a.mesaId)).not.toContain(sinMozos.id)
  })

  it('4. el P2002 del índice parcial de la caja llega con la forma que traduce conflictos.ts, y no queda nada a medias', async () => {
    // Un estado que la app no genera: un turno cerrado con su caja abierta.
    const rest = await fx.restaurante(marcaId)
    const caja = await fx.caja(rest)
    await prisma.turno.create({
      data: {
        restauranteId: rest,
        abiertoPorUsuarioId: owner,
        cerradoEn: new Date(),
        cerradoPorUsuarioId: owner,
        cajas: { create: { cajaId: caja, fondoInicial: 0 } },
      },
    })

    const res = await abrir(owner, { restauranteId: rest, cajas: [{ cajaId: caja, fondoInicial: 0 }] })

    expect(res.status).toBe(409)
    expect(res.body.message).toBe(MENSAJE_CAJA_YA_ABIERTA)
    expect(await turnosDe(rest)).toBe(1)
    expect(await abiertosDe(rest)).toBe(0)
  })

  it(`5. dos aperturas a la vez (${RONDAS} rondas): un 201 y un 409, nunca un 500, y un solo turno sin cajas huérfanas`, async () => {
    const porMensaje: Record<string, number> = {}
    const reintentosAntes = reintentos.foto()

    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const rest = await fx.restaurante(marcaId)
      const [cajaA, cajaB] = [await fx.caja(rest), await fx.caja(rest)]

      const respuestas = await Promise.all([
        abrir(owner, { restauranteId: rest, cajas: [{ cajaId: cajaA, fondoInicial: 100 }] }),
        abrir(owner, { restauranteId: rest, cajas: [{ cajaId: cajaB, fondoInicial: 200 }] }),
      ])

      expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409])
      const ganadora = respuestas.find((r) => r.status === 201)
      const perdedora = respuestas.find((r) => r.status === 409)
      expect([MENSAJE_TURNO_ABIERTO, MENSAJE_OPERACION_SIMULTANEA]).toContain(perdedora?.body.message)
      contar(porMensaje, perdedora?.body.message)

      expect(await abiertosDe(rest)).toBe(1)
      expect(await turnosDe(rest)).toBe(1)
      const aperturas = await prisma.turnoCaja.findMany({ where: { caja: { restauranteId: rest } }, select: { turnoId: true } })
      expect(aperturas).toEqual([{ turnoId: ganadora?.body.turno.id }])
    }

    mostrarDistribucion(`[turnos e2e] caso 5, el 409 por mensaje: ${JSON.stringify(porMensaje)}; reintentos: ${reintentos.desde(reintentosAntes)}`)
  }, 120_000)

  it(`6. desactivar una caja mientras se abre un turno con ella (${RONDAS} rondas): nunca una caja inactiva abierta`, async () => {
    const porPar: Record<string, number> = {}
    const reintentosAntes = reintentos.foto()

    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const rest = await fx.restaurante(marcaId)
      const caja = await fx.caja(rest)

      const [patch, post] = await Promise.all([
        api.pedir('patch', `/cajas/${caja}`, { usuarioId: owner, body: { activa: false } }),
        abrir(owner, { restauranteId: rest, cajas: [{ cajaId: caja, fondoInicial: 0 }] }),
      ])
      contar(porPar, `POST ${post.status} / PATCH ${patch.status}`)

      expect([200, 409]).toContain(patch.status)
      expect([201, 400, 409]).toContain(post.status)
      if (patch.status === 409) expect([MENSAJE_CAJA_ABIERTA, MENSAJE_OPERACION_SIMULTANEA]).toContain(patch.body.message)
      if (post.status === 409) expect(post.body.message).toBe(MENSAJE_OPERACION_SIMULTANEA)
      // Las dos no pueden haber ganado.
      expect(post.status === 201 && patch.status === 200).toBe(false)

      const fila = await prisma.caja.findUniqueOrThrow({ where: { id: caja }, select: { activa: true } })
      const abiertas = await prisma.turnoCaja.count({ where: { cajaId: caja, cerradoEn: null } })
      expect(!fila.activa && abiertas > 0).toBe(false)
      // Y la base dice lo mismo que las respuestas.
      expect(abiertas).toBe(post.status === 201 ? 1 : 0)
      expect(fila.activa).toBe(patch.status !== 200)
    }

    mostrarDistribucion(`[turnos e2e] caso 6, POST / PATCH: ${JSON.stringify(porPar)}; reintentos: ${reintentos.desde(reintentosAntes)}`)
  }, 120_000)

  describe('7. permisos y aislamiento con los guards reales', () => {
    let rest = ''
    let caja = ''
    const usuarios: Record<string, string> = {}
    const ajenos: Record<string, string> = {}
    const propios: Record<string, string> = {}

    beforeAll(async () => {
      rest = await fx.restaurante(marcaId)
      const otroRest = await fx.restaurante(marcaId, 'E2E Caja otro restaurante')
      caja = await fx.caja(rest)
      usuarios.GERENTE = await fx.usuario('GERENTE', { restauranteId: rest })
      usuarios.JEFE_SALON = await fx.usuario('JEFE_SALON', { restauranteId: rest })
      usuarios.MOZO = await fx.usuario('MOZO', { restauranteId: rest })
      usuarios.COCINA = await fx.usuario('COCINA', { restauranteId: rest })
      usuarios.GERENTE_DE_OTRO = await fx.usuario('GERENTE', { restauranteId: otroRest })
      ajenos.caja = await fx.caja(otroRest)
      ajenos.mesa = (await fx.mesa(otroRest)).id
      ajenos.mozo = await fx.mozo(otroRest)
      propios.mesa = (await fx.mesa(rest)).id
      propios.mozo = await fx.mozo(rest)
      propios.mozoSinCuenta = await fx.mozo(rest, { conCuenta: false })
      propios.mozoInactivo = await fx.mozo(rest, { activo: false })
      propios.cajaInactiva = await fx.caja(rest, { activa: false })
    })

    // Si un caso deja un turno abierto (por ejemplo, porque un 400 esperado salió 201), el siguiente no lo arrastra.
    afterEach(async () => {
      const abierto = await prisma.turno.findFirst({ where: { restauranteId: rest, cerradoEn: null }, select: { id: true } })
      if (abierto) await cerrarAMano(abierto.id, owner)
    })

    /** Nada nuevo en la base: ni turnos, ni aperturas, ni asignaciones del restaurante. */
    async function contarFilas() {
      return {
        turnos: await turnosDe(rest),
        aperturas: await prisma.turnoCaja.count({ where: { turno: { restauranteId: rest } } }),
        asignaciones: await prisma.asignacionTurno.count({ where: { turno: { restauranteId: rest } } }),
      }
    }

    it.each(['OWNER', 'GERENTE', 'JEFE_SALON'])('%s del restaurante abre: 201', async (rol) => {
      const usuarioId = rol === 'OWNER' ? owner : usuarios[rol]

      const res = await abrir(usuarioId, { restauranteId: rest, cajas: [{ cajaId: caja, fondoInicial: 0 }] })

      expect(res.status).toBe(201)
      expect(res.body.turno.abiertoPor.id).toBe(usuarioId)
      await cerrarAMano(res.body.turno.id, usuarioId)
    })

    it.each([
      ['el MOZO', () => usuarios.MOZO],
      ['COCINA', () => usuarios.COCINA],
      ['el GERENTE de otro restaurante', () => usuarios.GERENTE_DE_OTRO],
      ['el OWNER de otra marca', () => ownerDeOtraMarca],
    ])('%s recibe 403 y no se crea nada', async (_caso, usuarioId) => {
      const antes = await contarFilas()

      const res = await abrir(usuarioId(), { restauranteId: rest, cajas: [{ cajaId: caja, fondoInicial: 0 }] })

      expect(res.status).toBe(403)
      expect(await contarFilas()).toEqual(antes)
    })

    it.each([
      ['una caja de otro restaurante', () => ({ cajas: [{ cajaId: ajenos.caja, fondoInicial: 0 }] })],
      ['una caja inactiva', () => ({ cajas: [{ cajaId: propios.cajaInactiva, fondoInicial: 0 }] })],
      ['una mesa de otro restaurante', () => ({ asignaciones: [{ mesaId: ajenos.mesa, mozoId: propios.mozo }] })],
      ['un mozo de otro restaurante', () => ({ asignaciones: [{ mesaId: propios.mesa, mozoId: ajenos.mozo }] })],
      ['un mozo sin cuenta', () => ({ asignaciones: [{ mesaId: propios.mesa, mozoId: propios.mozoSinCuenta }] })],
      ['un mozo inactivo', () => ({ asignaciones: [{ mesaId: propios.mesa, mozoId: propios.mozoInactivo }] })],
    ])('con %s en el body: 400 y no se crea nada', async (_caso, cambios) => {
      const antes = await contarFilas()

      const res = await abrir(owner, { restauranteId: rest, cajas: [{ cajaId: caja, fondoInicial: 0 }], ...cambios() })

      expect(res.status).toBe(400)
      expect(await contarFilas()).toEqual(antes)
    })
  })

  describe('8. PATCH /cajas/:id con los guards reales y la base real', () => {
    let rest = ''
    let principal = ''
    let barra = ''
    let gerente = ''
    let jefe = ''

    beforeAll(async () => {
      rest = await fx.restaurante(marcaId)
      principal = await fx.caja(rest, { nombre: 'Principal' })
      barra = await fx.caja(rest, { nombre: 'Barra' })
      gerente = await fx.usuario('GERENTE', { restauranteId: rest })
      jefe = await fx.usuario('JEFE_SALON', { restauranteId: rest })
    })

    const patch = (usuarioId: string, cajaId: string, body: object) => api.pedir('patch', `/cajas/${cajaId}`, { usuarioId, body })

    it('el JEFE_SALON recibe 403; el OWNER y el GERENTE editan', async () => {
      expect((await patch(jefe, barra, { nombre: 'Barra del jefe' })).status).toBe(403)
      expect((await patch(owner, barra, { nombre: 'Barra 1' })).status).toBe(200)
      expect((await patch(gerente, barra, { nombre: 'Barra 2' })).status).toBe(200)
      expect((await prisma.caja.findUniqueOrThrow({ where: { id: barra } })).nombre).toBe('Barra 2')
    })

    it('un nombre repetido es 409: el P2002 real del único de Caja tiene la forma que traduce el service', async () => {
      const res = await patch(owner, barra, { nombre: 'Principal' })

      expect(res.status).toBe(409)
      expect(res.body.message).toBe(MENSAJE_NOMBRE_REPETIDO)
    })

    it('desactivar una caja con el turno abierto es 409 y la caja sigue activa', async () => {
      expect((await abrir(owner, { restauranteId: rest, cajas: [{ cajaId: principal, fondoInicial: 0 }] })).status).toBe(201)

      const res = await patch(gerente, principal, { activa: false })

      expect(res.status).toBe(409)
      expect(res.body.message).toBe(MENSAJE_CAJA_ABIERTA)
      expect((await prisma.caja.findUniqueOrThrow({ where: { id: principal } })).activa).toBe(true)
    })
  })
})
