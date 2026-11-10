import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { AppE2e, contar, contarReintentos, crearAppE2e, mostrarDistribucion } from '../test/app-e2e'
import { FixtureDeCaja, marcadorDeLaCorrida } from '../test/fixture-de-caja'
import { MENSAJE_OPERACION_SIMULTANEA, MENSAJE_TURNO_CERRADO } from './conflictos'

// La reasignación de mesas de un turno abierto (#357) por HTTP, contra Postgres, con los guards de permisos reales
// (test/app-e2e.ts). El turno se abre por HTTP y las asignaciones se miran en la base. Cada caso dice qué invariante
// prueba.

/** Las rondas de la carrera (caso 6). E2E_RONDAS las cambia. */
const RONDAS = Number(process.env.E2E_RONDAS ?? 10)

type Asignacion = { mesaId: string; mozoId: string }

/** Una lista de asignaciones como conjunto comparable: "mesa:mozo", ordenado. */
const comoConjunto = (asignaciones: Asignacion[]) => asignaciones.map((a) => `${a.mesaId}:${a.mozoId}`).sort()

describe('Reasignación de mesas contra Postgres (e2e)', () => {
  let api: AppE2e
  let prisma: PrismaService
  let fx: FixtureDeCaja
  let marcaId = ''
  let owner = ''
  let ownerDeOtraMarca = ''
  let reintentos: ReturnType<typeof contarReintentos>

  const reasignar = (usuarioId: string, turnoId: string, asignaciones: Asignacion[]) =>
    api.pedir('put', `/turnos/${turnoId}/asignaciones`, { usuarioId, body: { asignaciones } })
  const asignacionesDe = async (turnoId: string) =>
    comoConjunto(await prisma.asignacionTurno.findMany({ where: { turnoId }, select: { mesaId: true, mozoId: true } }))

  /** Un restaurante con 4 mesas, 2 mozos y un turno abierto por HTTP con la mesa 1 y la 2 de Ana. */
  async function turnoAbierto() {
    const rest = await fx.restaurante(marcaId)
    const caja = await fx.caja(rest)
    const mesas = [await fx.mesa(rest), await fx.mesa(rest), await fx.mesa(rest), await fx.mesa(rest)].map((m) => m.id)
    const ana = await fx.mozo(rest, { nombre: 'Ana' })
    const beto = await fx.mozo(rest, { nombre: 'Beto' })
    const iniciales = [
      { mesaId: mesas[0], mozoId: ana },
      { mesaId: mesas[1], mozoId: ana },
    ]
    const res = await api.pedir('post', '/turnos', {
      usuarioId: owner,
      body: { restauranteId: rest, cajas: [{ cajaId: caja, fondoInicial: 0 }], asignaciones: iniciales },
    })
    expect(res.status).toBe(201)
    return { rest, turnoId: res.body.turno.id as string, mesas, ana, beto, iniciales }
  }

  beforeAll(async () => {
    api = await crearAppE2e()
    prisma = api.prisma
    fx = new FixtureDeCaja(prisma, marcadorDeLaCorrida('asignaciones'))
    marcaId = await fx.marca()
    owner = await fx.usuario('OWNER', { marcaId })
    ownerDeOtraMarca = await fx.usuario('OWNER', { marcaId: await fx.marca('E2E Caja otra marca') })
    reintentos = contarReintentos()
  })

  afterAll(async () => {
    if (reintentos) mostrarDistribucion(`[asignaciones e2e] reintentos por P2034: ${JSON.stringify(reintentos.total)}`)
    jest.restoreAllMocks()
    try {
      if (fx) await fx.limpiar()
    } finally {
      if (api) await api.cerrar()
    }
  })

  it('1. reemplazo: las asignaciones viejas desaparecen y quedan exactamente las nuevas', async () => {
    const { turnoId, mesas, beto } = await turnoAbierto()
    const nuevas = [
      { mesaId: mesas[1], mozoId: beto },
      { mesaId: mesas[2], mozoId: beto },
    ]

    const res = await reasignar(owner, turnoId, nuevas)

    expect(res.status).toBe(200)
    expect(await asignacionesDe(turnoId)).toEqual(comoConjunto(nuevas))
    expect(comoConjunto(res.body.turno.asignaciones)).toEqual(comoConjunto(nuevas))
  })

  it('2. con [] el turno queda sin asignaciones', async () => {
    const { turnoId } = await turnoAbierto()

    const res = await reasignar(owner, turnoId, [])

    expect(res.status).toBe(200)
    expect(await asignacionesDe(turnoId)).toEqual([])
  })

  it('3. un turno cerrado es 409 y sus asignaciones quedan intactas', async () => {
    const { turnoId, mesas, beto, iniciales } = await turnoAbierto()
    const ahora = new Date()
    await prisma.turnoCaja.updateMany({ where: { turnoId }, data: { cerradoEn: ahora } })
    await prisma.turno.update({ where: { id: turnoId }, data: { cerradoEn: ahora, cerradoPorUsuarioId: owner } })

    const res = await reasignar(owner, turnoId, [{ mesaId: mesas[2], mozoId: beto }])

    expect(res.status).toBe(409)
    expect(res.body.message).toBe(MENSAJE_TURNO_CERRADO)
    expect(await asignacionesDe(turnoId)).toEqual(comoConjunto(iniciales))
  })

  describe('4. un body inválido es 400 y las asignaciones anteriores quedan intactas (no hay reemplazo a medias)', () => {
    let turno: Awaited<ReturnType<typeof turnoAbierto>>
    const otros: Record<string, string> = {}

    beforeAll(async () => {
      turno = await turnoAbierto()
      const otroRest = await fx.restaurante(marcaId, 'E2E Caja otro restaurante')
      otros.mesaAjena = (await fx.mesa(otroRest)).id
      otros.mozoAjeno = await fx.mozo(otroRest)
      otros.mozoSinCuenta = await fx.mozo(turno.rest, { conCuenta: false })
      otros.mozoInactivo = await fx.mozo(turno.rest, { activo: false })
    })

    // Si un caso reemplaza las asignaciones (un 400 esperado que salió 200), el siguiente arranca de las iniciales igual.
    afterEach(async () => {
      await prisma.asignacionTurno.deleteMany({ where: { turnoId: turno.turnoId } })
      await prisma.asignacionTurno.createMany({ data: turno.iniciales.map((a) => ({ turnoId: turno.turnoId, ...a })) })
    })

    it.each([
      ['una mesa de otro restaurante', () => ({ mesaId: otros.mesaAjena, mozoId: turno.beto })],
      ['un mozo de otro restaurante', () => ({ mesaId: turno.mesas[2], mozoId: otros.mozoAjeno })],
      ['un mozo sin cuenta', () => ({ mesaId: turno.mesas[2], mozoId: otros.mozoSinCuenta })],
      ['un mozo inactivo', () => ({ mesaId: turno.mesas[2], mozoId: otros.mozoInactivo })],
    ])('con %s', async (_caso, invalida) => {
      // La primera es válida: si el reemplazo se hiciera a medias, borraría las anteriores o dejaría esta.
      const res = await reasignar(owner, turno.turnoId, [{ mesaId: turno.mesas[3], mozoId: turno.beto }, invalida()])

      expect(res.status).toBe(400)
      expect(await asignacionesDe(turno.turnoId)).toEqual(comoConjunto(turno.iniciales))
    })
  })

  describe('5. permisos con los guards reales', () => {
    let turno: Awaited<ReturnType<typeof turnoAbierto>>
    const usuarios: Record<string, string> = {}

    beforeAll(async () => {
      turno = await turnoAbierto()
      const otroRest = await fx.restaurante(marcaId, 'E2E Caja otro restaurante')
      usuarios.GERENTE = await fx.usuario('GERENTE', { restauranteId: turno.rest })
      usuarios.JEFE_SALON = await fx.usuario('JEFE_SALON', { restauranteId: turno.rest })
      usuarios.MOZO = await fx.usuario('MOZO', { restauranteId: turno.rest })
      usuarios.COCINA = await fx.usuario('COCINA', { restauranteId: turno.rest })
      usuarios.GERENTE_DE_OTRO = await fx.usuario('GERENTE', { restauranteId: otroRest })
    })

    it.each(['OWNER', 'GERENTE', 'JEFE_SALON'])('%s del restaurante reasigna: 200', async (rol) => {
      const usuarioId = rol === 'OWNER' ? owner : usuarios[rol]
      const nuevas = [{ mesaId: turno.mesas[0], mozoId: turno.beto }]

      const res = await reasignar(usuarioId, turno.turnoId, nuevas)

      expect(res.status).toBe(200)
      expect(await asignacionesDe(turno.turnoId)).toEqual(comoConjunto(nuevas))
    })

    it.each([
      ['el MOZO', () => usuarios.MOZO],
      ['COCINA', () => usuarios.COCINA],
      ['el GERENTE de otro restaurante', () => usuarios.GERENTE_DE_OTRO],
      ['el OWNER de otra marca', () => ownerDeOtraMarca],
    ])('%s recibe 403 y las asignaciones no cambian', async (_caso, usuarioId) => {
      const antes = await asignacionesDe(turno.turnoId)

      const res = await reasignar(usuarioId(), turno.turnoId, [])

      expect(res.status).toBe(403)
      expect(await asignacionesDe(turno.turnoId)).toEqual(antes)
    })

    it('un turno que no existe es 404', async () => {
      expect((await reasignar(owner, randomUUID(), [])).status).toBe(404)
    })
  })

  it(`6. dos reemplazos a la vez (${RONDAS} rondas): nunca un 500, y la base queda con una de las dos listas, nunca una mezcla`, async () => {
    const { turnoId, mesas, ana, beto } = await turnoAbierto()
    const porRonda: Record<string, number> = {}
    const reintentosAntes = reintentos.foto()

    for (let ronda = 0; ronda < RONDAS; ronda++) {
      // Las rondas pares no comparten mesas (una mezcla sería la unión); las impares comparten una (pueden chocar en el
      // único turno_id + mesa_id).
      const sinMesasEnComun = ronda % 2 === 0
      const a = [
        { mesaId: mesas[0], mozoId: ana },
        { mesaId: mesas[1], mozoId: ana },
      ]
      const b = sinMesasEnComun
        ? [
            { mesaId: mesas[2], mozoId: beto },
            { mesaId: mesas[3], mozoId: beto },
          ]
        : [
            { mesaId: mesas[1], mozoId: beto },
            { mesaId: mesas[2], mozoId: beto },
          ]

      const [ra, rb] = await Promise.all([reasignar(owner, turnoId, a), reasignar(owner, turnoId, b)])

      for (const r of [ra, rb]) {
        expect([200, 409]).toContain(r.status)
        if (r.status === 409) expect(r.body.message).toBe(MENSAJE_OPERACION_SIMULTANEA)
      }
      const ganadoras = [ra.status === 200 ? a : null, rb.status === 200 ? b : null].filter((l): l is Asignacion[] => l !== null)
      expect(ganadoras.map(comoConjunto)).toContainEqual(await asignacionesDe(turnoId))

      contar(porRonda, `${sinMesasEnComun ? 'sin mesas en común' : 'con una mesa en común'}: ${ganadoras.length} con 200`)
    }

    mostrarDistribucion(`[asignaciones e2e] caso 6, rondas: ${JSON.stringify(porRonda)}; reintentos: ${reintentos.desde(reintentosAntes)}`)
  }, 120_000)
})
