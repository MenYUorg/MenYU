import { PrismaService } from '../prisma/prisma.service'
import { AppE2e, crearAppE2e } from '../test/app-e2e'
import { FixtureDeCaja, marcadorDeLaCorrida } from '../test/fixture-de-caja'

// Las dos lecturas que necesita web-staff para cobrar y armar el turno (#359): GET /cajas/abiertas y GET
// /turnos/preparacion, por HTTP, contra Postgres, con los guards reales (test/app-e2e.ts). Los turnos se abren y se
// cierran por HTTP; el cobro también, para comprobar que el cajaId que devuelve /cajas/abiertas es el que acepta.

const TOTAL = 1000
const declarado = (efectivo: number) => ({ efectivo, debito: 0, credito: 0, transferencia: 0 })

describe('Lecturas de la caja para web-staff contra Postgres (e2e, #359)', () => {
  let api: AppE2e
  let prisma: PrismaService
  let fx: FixtureDeCaja
  let marcaId = ''
  let owner = ''

  const abiertas = (restauranteId: string, usuarioId = owner) => api.pedir('get', '/cajas/abiertas', { usuarioId, query: { restauranteId } })

  /** Abre un turno por HTTP y devuelve su id. */
  async function abrirTurno(restauranteId: string, cajas: { cajaId: string; fondoInicial: number }[]) {
    const res = await api.pedir('post', '/turnos', { usuarioId: owner, body: { restauranteId, cajas, asignaciones: [] } })
    expect(res.status).toBe(201)
    return res.body.turno.id as string
  }

  beforeAll(async () => {
    api = await crearAppE2e()
    prisma = api.prisma
    fx = new FixtureDeCaja(prisma, marcadorDeLaCorrida('lecturas'))
    marcaId = await fx.marca()
    owner = await fx.usuario('OWNER', { marcaId })
  })

  afterAll(async () => {
    try {
      if (fx) await fx.limpiar()
    } finally {
      if (api) await api.cerrar()
    }
  })

  describe('GET /cajas/abiertas', () => {
    it('1. sin turno abierto: { cajas: [] }', async () => {
      const rest = await fx.restaurante(marcaId)
      await fx.caja(rest, { nombre: 'Principal' })

      const res = await abiertas(rest)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ cajas: [] })
    })

    it('2. un turno con 2 cajas: las 2, por nombre, con el id de la Caja; ni la caja sin abrir ni las de otro restaurante', async () => {
      const rest = await fx.restaurante(marcaId)
      const terraza = await fx.caja(rest, { nombre: 'Terraza' })
      const barra = await fx.caja(rest, { nombre: 'Barra' })
      await fx.caja(rest, { nombre: 'Principal' })
      const otro = await fx.restaurante(marcaId, 'E2E Caja otro restaurante')
      await abrirTurno(otro, [{ cajaId: await fx.caja(otro, { nombre: 'Ajena' }), fondoInicial: 0 }])
      const turnoId = await abrirTurno(rest, [
        { cajaId: terraza, fondoInicial: 1000 },
        { cajaId: barra, fondoInicial: 500 },
      ])

      const res = await abiertas(rest)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        cajas: [
          { cajaId: barra, nombre: 'Barra' },
          { cajaId: terraza, nombre: 'Terraza' },
        ],
      })
      const aperturas = await prisma.turnoCaja.findMany({ where: { turnoId }, select: { id: true } })
      expect(res.body.cajas.map((c: { cajaId: string }) => c.cajaId)).not.toEqual(expect.arrayContaining(aperturas.map((a) => a.id)))
    })

    it('3. un MOZO del restaurante la lee y el cajaId sirve en un cobro real; uno de otro restaurante recibe 403; después del cierre, []', async () => {
      const rest = await fx.restaurante(marcaId)
      const principal = await fx.caja(rest, { nombre: 'Principal' })
      const barra = await fx.caja(rest, { nombre: 'Barra' })
      const mozo = await fx.personalConPerfil('MOZO', rest, { nombre: 'Ana' })
      const mozoDeOtro = await fx.personalConPerfil('MOZO', await fx.restaurante(marcaId, 'E2E Caja otro restaurante'))
      const turnoId = await abrirTurno(rest, [
        { cajaId: principal, fondoInicial: 0 },
        { cajaId: barra, fondoInicial: 0 },
      ])

      const delMozo = await abiertas(rest, mozo.usuarioId)
      expect(delMozo.status).toBe(200)
      expect(delMozo.body.cajas.map((c: { nombre: string }) => c.nombre)).toEqual(['Barra', 'Principal'])
      const ajeno = await abiertas(rest, mozoDeOtro.usuarioId)
      expect(ajeno.status).toBe(403)

      // Con dos cajas el cobro exige cajaId: el que devolvió la lectura es el que acepta.
      const mesa = await fx.mesa(rest)
      const sesion = await fx.sesion(mesa.id)
      await fx.consumo(sesion, mesa.id, rest, TOTAL)
      const elegida = delMozo.body.cajas[1].cajaId as string
      const cobro = await api.pedir('patch', `/sessions/${sesion}/cobro`, {
        usuarioId: mozo.usuarioId,
        body: { metodoPago: 'efectivo', cajaId: elegida },
      })
      expect(cobro.status).toBe(200)
      const [pago] = await prisma.pago.findMany({ where: { sesionId: sesion }, select: { turnoCaja: { select: { cajaId: true } } } })
      expect(pago.turnoCaja?.cajaId).toBe(principal)

      const cierre = await api.pedir('post', `/turnos/${turnoId}/cierre`, {
        usuarioId: owner,
        body: {
          cajas: [
            { cajaId: principal, declarado: declarado(TOTAL) },
            { cajaId: barra, declarado: declarado(0) },
          ],
        },
      })
      expect(cierre.status).toBe(200)
      expect((await abiertas(rest, mozo.usuarioId)).body).toEqual({ cajas: [] })
    })
  })
})
