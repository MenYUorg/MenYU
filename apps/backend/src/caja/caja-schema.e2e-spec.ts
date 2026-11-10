import 'reflect-metadata'
import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { METODOS_ARQUEO, TIPOS_MOVIMIENTO_CAJA } from '../common/caja.constant'
import { PrismaService } from '../prisma/prisma.service'

// El schema de la caja (#355) contra Postgres: lo que la migración agrega a mano y Prisma no ve (los dos índices únicos
// parciales y los siete CHECK, que el chequeo de drift no compara), los únicos y el Restrict de las FKs. No hay
// servicios todavía (#357 a #361): se usa el cliente de Prisma directo, sin levantar Nest.
//
// Cada caso comprueba cuál restricción saltó. Con Prisma 6.19.3 y el adapter de pg:
// - un único, común o parcial, es P2002 con `meta: { modelName, target: [columnas] }`, sin el nombre del índice: el
//   parcial se reconoce por sus columnas (`restaurante_id` en Turno, `caja_id` en TurnoCaja), y el catálogo de abajo
//   ata esas columnas al índice;
// - un CHECK es un PrismaClientUnknownRequestError sin código: el mensaje trae el 23514 de Postgres y el nombre;
// - una FK es P2003 con `meta.constraint`.
// Las consultas al catálogo pasan las columnas de tipo `name` a `text`: el adapter de pg no las deserializa en
// $queryRaw (P2010).
//
// Todo lo que crea esta corrida lleva su marcador (en el slug de la marca y en el email de los usuarios), como en los
// otros e2e: la limpieza borra solo eso, en el orden que impone Restrict.

const E2E_MARCADOR = process.env.GITHUB_RUN_ID
  ? `e2e-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}-caja-`
  : `e2e-local-${randomUUID().slice(0, 8)}-caja-`

const DE_LA_CORRIDA = { restaurante: { marca: { slug: { startsWith: E2E_MARCADOR } } } }

const CHECKS = [
  'arqueo_metodo_diferencia_check',
  'arqueo_metodo_metodo_check',
  'movimiento_caja_monto_check',
  'movimiento_caja_tipo_check',
  'pago_propina_check',
  'turno_caja_fondo_inicial_check',
  'turno_cierre_check',
]

const FKS = [
  'arqueo_metodo_turno_caja_id_fkey',
  'asignacion_turno_mesa_id_fkey',
  'asignacion_turno_mozo_id_fkey',
  'asignacion_turno_turno_id_fkey',
  'caja_restaurante_id_fkey',
  'movimiento_caja_turno_caja_id_fkey',
  'movimiento_caja_usuario_id_fkey',
  'pago_turno_caja_id_fkey',
  'turno_abierto_por_usuario_id_fkey',
  'turno_caja_caja_id_fkey',
  'turno_caja_turno_id_fkey',
  'turno_cerrado_por_usuario_id_fkey',
  'turno_restaurante_id_fkey',
]

const errorDe = (operacion: Promise<unknown>) => operacion.then(() => undefined, (e: unknown) => e)

async function fallaPorUnico(operacion: Promise<unknown>, modelName: string, target: string[]) {
  const e = await errorDe(operacion)
  expect(e).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
  expect(e).toMatchObject({ code: 'P2002', meta: { modelName, target } })
}

async function fallaPorCheck(operacion: Promise<unknown>, nombre: string) {
  const e = await errorDe(operacion)
  expect(e).toBeInstanceOf(Prisma.PrismaClientUnknownRequestError)
  expect((e as Error).message).toMatch(new RegExp(String.raw`code: "23514".*violates check constraint \\"${nombre}\\"`))
}

async function fallaPorFk(operacion: Promise<unknown>, constraint: string) {
  const e = await errorDe(operacion)
  expect(e).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
  expect(e).toMatchObject({ code: 'P2003', meta: { constraint } })
}

/** Los valores de un CHECK `IN (...)`, como los muestra Postgres: `CHECK ((x = ANY (ARRAY['a'::text, ...])))`. */
const valoresDelIn = (definicion: string) => new Set([...definicion.matchAll(/'([^']*)'::text/g)].map((m) => m[1]))

describe('Schema de la caja contra Postgres (e2e)', () => {
  const prisma = new PrismaService()

  let marcaId = ''
  let usuarioId = ''
  let restaurantes = 0

  async function crearRestaurante() {
    restaurantes += 1
    return (await prisma.restaurante.create({ data: { nombre: `E2E Caja ${restaurantes}`, marcaId } })).id
  }

  async function crearUsuario(nombre: string) {
    const email = `${E2E_MARCADOR}${nombre}-${randomUUID().slice(0, 8)}@menyu.test`
    return (await prisma.usuario.create({ data: { supabaseUserId: randomUUID(), email, nombre } })).id
  }

  const abrirTurno = (restauranteId: string) => prisma.turno.create({ data: { restauranteId, abiertoPorUsuarioId: usuarioId } })
  const turnoCerrado = (restauranteId: string) =>
    prisma.turno.create({
      data: { restauranteId, abiertoPorUsuarioId: usuarioId, cerradoEn: new Date(), cerradoPorUsuarioId: usuarioId },
    })
  const cerrarTurno = (id: string) =>
    prisma.turno.update({ where: { id }, data: { cerradoEn: new Date(), cerradoPorUsuarioId: usuarioId } })
  const crearCaja = (restauranteId: string, nombre = `Caja ${randomUUID().slice(0, 8)}`) =>
    prisma.caja.create({ data: { restauranteId, nombre } })
  const abrirCaja = (turnoId: string, cajaId: string, fondoInicial = 0) =>
    prisma.turnoCaja.create({ data: { turnoId, cajaId, fondoInicial } })

  /** Un restaurante con un turno abierto y una caja abierta en ese turno. */
  async function cajaAbierta() {
    const restauranteId = await crearRestaurante()
    const turno = await abrirTurno(restauranteId)
    const caja = await crearCaja(restauranteId)
    const apertura = await abrirCaja(turno.id, caja.id)
    return { restauranteId, turno, caja, apertura }
  }

  const movimiento = (turnoCajaId: string, tipo: string, monto: number) =>
    prisma.movimientoCaja.create({ data: { turnoCajaId, tipo, monto, motivo: 'e2e', usuarioId } })
  const arqueo = (turnoCajaId: string, metodo: string, esperado: number, declarado: number, diferencia: number) =>
    prisma.arqueoMetodo.create({ data: { turnoCajaId, metodo, esperado, declarado, diferencia } })

  async function crearMesa(restauranteId: string) {
    const pin = randomUUID().slice(0, 4)
    return prisma.mesa.create({ data: { restauranteId, numero: pin, pin, qrToken: `${E2E_MARCADOR}qr-${randomUUID()}` } })
  }

  async function limpiar() {
    const deLaCaja = { turnoCaja: { caja: DE_LA_CORRIDA } }
    await prisma.arqueoMetodo.deleteMany({ where: deLaCaja })
    await prisma.movimientoCaja.deleteMany({ where: deLaCaja })
    await prisma.pago.updateMany({ where: deLaCaja, data: { turnoCajaId: null } })
    await prisma.asignacionTurno.deleteMany({ where: { turno: DE_LA_CORRIDA } })
    await prisma.turnoCaja.deleteMany({ where: { caja: DE_LA_CORRIDA } })
    await prisma.turno.deleteMany({ where: DE_LA_CORRIDA })
    await prisma.caja.deleteMany({ where: DE_LA_CORRIDA })

    await prisma.pago.deleteMany({ where: { sesion: { mesa: DE_LA_CORRIDA } } })
    await prisma.sesionMesa.deleteMany({ where: { mesa: DE_LA_CORRIDA } })
    await prisma.mesa.deleteMany({ where: DE_LA_CORRIDA })
    await prisma.mozo.deleteMany({ where: DE_LA_CORRIDA })
    await prisma.usuario.deleteMany({ where: { email: { startsWith: E2E_MARCADOR } } })
    const marcaIds = (await prisma.marca.findMany({ where: { slug: { startsWith: E2E_MARCADOR } }, select: { id: true } })).map(
      (m) => m.id,
    )
    await prisma.restaurante.deleteMany({ where: { marcaId: { in: marcaIds } } })
    await prisma.marca.deleteMany({ where: { id: { in: marcaIds } } })
  }

  beforeAll(async () => {
    await prisma.$connect()
    marcaId = (await prisma.marca.create({ data: { nombre: 'E2E Caja', slug: `${E2E_MARCADOR}${randomUUID()}` } })).id
    usuarioId = await crearUsuario('encargado')
  })

  afterAll(async () => {
    await limpiar()
    await prisma.$disconnect()
  })

  describe('catálogo: lo que la migración agrega a mano', () => {
    it('los dos índices únicos parciales, sobre las columnas que reconoce el P2002 y con cerrado_en IS NULL', async () => {
      const indices = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
        SELECT indexname::text, indexdef FROM pg_indexes
        WHERE indexname IN ('turno_restaurante_id_abierto_key', 'turno_caja_caja_id_abierta_key')
        ORDER BY indexname`
      expect(indices).toEqual([
        {
          indexname: 'turno_caja_caja_id_abierta_key',
          indexdef:
            'CREATE UNIQUE INDEX turno_caja_caja_id_abierta_key ON public.turno_caja USING btree (caja_id) WHERE (cerrado_en IS NULL)',
        },
        {
          indexname: 'turno_restaurante_id_abierto_key',
          indexdef:
            'CREATE UNIQUE INDEX turno_restaurante_id_abierto_key ON public.turno USING btree (restaurante_id) WHERE (cerrado_en IS NULL)',
        },
      ])
    })

    it('los siete CHECK, por nombre', async () => {
      const checks = await prisma.$queryRaw<{ conname: string }[]>`
        SELECT conname::text FROM pg_constraint
        WHERE contype = 'c' AND conrelid::regclass::text IN ('turno', 'turno_caja', 'movimiento_caja', 'arqueo_metodo', 'pago')
        ORDER BY conname`
      expect(checks.map((c) => c.conname)).toEqual(CHECKS)
    })

    it('los valores del CHECK de tipo y del de método son los de caja.constant.ts', async () => {
      const definiciones = await prisma.$queryRaw<{ conname: string; def: string }[]>`
        SELECT conname::text, pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname IN ('movimiento_caja_tipo_check', 'arqueo_metodo_metodo_check')`
      const valores = Object.fromEntries(definiciones.map((d) => [d.conname, valoresDelIn(d.def)]))
      expect(valores).toEqual({
        movimiento_caja_tipo_check: new Set(TIPOS_MOVIMIENTO_CAJA),
        arqueo_metodo_metodo_check: new Set(METODOS_ARQUEO),
      })
    })

    it('las trece FKs nuevas son ON DELETE RESTRICT', async () => {
      const fks = await prisma.$queryRaw<{ conname: string; accion: string }[]>`
        SELECT conname::text, confdeltype::text AS accion FROM pg_constraint
        WHERE contype = 'f' AND (
          conrelid::regclass::text IN ('caja', 'turno', 'turno_caja', 'movimiento_caja', 'arqueo_metodo', 'asignacion_turno')
          OR conname = 'pago_turno_caja_id_fkey'
        )
        ORDER BY conname`
      expect(fks).toEqual(FKS.map((conname) => ({ conname, accion: 'r' })))
    })
  })

  describe('un solo turno abierto por restaurante', () => {
    it('un segundo turno abierto falla; cerrado el primero, pasa; en otro restaurante, pasa', async () => {
      const restauranteId = await crearRestaurante()
      const primero = await abrirTurno(restauranteId)

      await fallaPorUnico(abrirTurno(restauranteId), 'Turno', ['restaurante_id'])
      await expect(abrirTurno(await crearRestaurante())).resolves.toBeDefined()

      await cerrarTurno(primero.id)
      await expect(abrirTurno(restauranteId)).resolves.toBeDefined()
    })
  })

  describe('turno_cierre_check', () => {
    it('cerrado con fecha y quién lo cerró pasa', async () => {
      await expect(turnoCerrado(await crearRestaurante())).resolves.toBeDefined()
    })

    it('con fecha de cierre y sin quién lo cerró falla', async () => {
      const restauranteId = await crearRestaurante()
      await fallaPorCheck(
        prisma.turno.create({ data: { restauranteId, abiertoPorUsuarioId: usuarioId, cerradoEn: new Date() } }),
        'turno_cierre_check',
      )
    })

    it('con quién lo cerró y sin fecha falla', async () => {
      const restauranteId = await crearRestaurante()
      await fallaPorCheck(
        prisma.turno.create({ data: { restauranteId, abiertoPorUsuarioId: usuarioId, cerradoPorUsuarioId: usuarioId } }),
        'turno_cierre_check',
      )
    })

    it('un UPDATE que pone solo la fecha de cierre falla', async () => {
      const turno = await abrirTurno(await crearRestaurante())
      await fallaPorCheck(prisma.turno.update({ where: { id: turno.id }, data: { cerradoEn: new Date() } }), 'turno_cierre_check')
    })
  })

  describe('aperturas de caja (TurnoCaja)', () => {
    it('la misma caja abierta dos veces falla; cerrada la primera, pasa; otra caja, pasa', async () => {
      const { restauranteId, caja, apertura } = await cajaAbierta()
      const otroTurno = await turnoCerrado(restauranteId)

      await fallaPorUnico(abrirCaja(otroTurno.id, caja.id), 'TurnoCaja', ['caja_id'])
      await expect(abrirCaja(apertura.turnoId, (await crearCaja(restauranteId)).id)).resolves.toBeDefined()

      await prisma.turnoCaja.update({ where: { id: apertura.id }, data: { cerradoEn: new Date() } })
      await expect(abrirCaja(otroTurno.id, caja.id)).resolves.toBeDefined()
    })

    it('la misma caja dos veces en un turno falla aunque la primera esté cerrada', async () => {
      const { turno, caja, apertura } = await cajaAbierta()
      await prisma.turnoCaja.update({ where: { id: apertura.id }, data: { cerradoEn: new Date() } })

      await fallaPorUnico(abrirCaja(turno.id, caja.id), 'TurnoCaja', ['turno_id', 'caja_id'])
    })

    it('turno_caja_fondo_inicial_check: 0 pasa, negativo falla', async () => {
      const restauranteId = await crearRestaurante()
      const turno = await abrirTurno(restauranteId)

      await expect(abrirCaja(turno.id, (await crearCaja(restauranteId)).id, 0)).resolves.toBeDefined()
      await fallaPorCheck(abrirCaja(turno.id, (await crearCaja(restauranteId)).id, -0.01), 'turno_caja_fondo_inicial_check')
    })
  })

  describe('cajas', () => {
    it('el nombre es único en el restaurante, también contra una inactiva; en otro restaurante, pasa', async () => {
      const restauranteId = await crearRestaurante()
      await crearCaja(restauranteId, 'Principal')
      const inactiva = await crearCaja(restauranteId, 'Barra')
      await prisma.caja.update({ where: { id: inactiva.id }, data: { activa: false } })

      await fallaPorUnico(crearCaja(restauranteId, 'Principal'), 'Caja', ['restaurante_id', 'nombre'])
      await fallaPorUnico(crearCaja(restauranteId, 'Barra'), 'Caja', ['restaurante_id', 'nombre'])
      await expect(crearCaja(await crearRestaurante(), 'Principal')).resolves.toBeDefined()
    })
  })

  describe('movimientos', () => {
    it.each(TIPOS_MOVIMIENTO_CAJA)('movimiento_caja_tipo_check: %s pasa', async (tipo) => {
      const { apertura } = await cajaAbierta()
      await expect(movimiento(apertura.id, tipo, 100)).resolves.toBeDefined()
    })

    it.each(['ingreso', 'AJUSTE'])('movimiento_caja_tipo_check: %s falla', async (tipo) => {
      const { apertura } = await cajaAbierta()
      await fallaPorCheck(movimiento(apertura.id, tipo, 100), 'movimiento_caja_tipo_check')
    })

    it('movimiento_caja_monto_check: 0,01 pasa, 0 y negativo fallan', async () => {
      const { apertura } = await cajaAbierta()
      await expect(movimiento(apertura.id, 'EGRESO', 0.01)).resolves.toBeDefined()
      await fallaPorCheck(movimiento(apertura.id, 'EGRESO', 0), 'movimiento_caja_monto_check')
      await fallaPorCheck(movimiento(apertura.id, 'INGRESO', -5), 'movimiento_caja_monto_check')
    })
  })

  describe('arqueo', () => {
    it('arqueo_metodo_metodo_check: los cuatro métodos pasan; mercadopago y EFECTIVO fallan', async () => {
      const { apertura } = await cajaAbierta()
      for (const metodo of METODOS_ARQUEO) await expect(arqueo(apertura.id, metodo, 0, 0, 0)).resolves.toBeDefined()

      await fallaPorCheck(arqueo(apertura.id, 'mercadopago', 0, 0, 0), 'arqueo_metodo_metodo_check')
      await fallaPorCheck(arqueo(apertura.id, 'EFECTIVO', 0, 0, 0), 'arqueo_metodo_metodo_check')
    })

    it('arqueo_metodo_diferencia_check: bien calculada pasa; mal calculada falla, por INSERT y por UPDATE', async () => {
      const { apertura } = await cajaAbierta()
      const fila = await arqueo(apertura.id, 'efectivo', 100, 90, -10)
      await expect(arqueo(apertura.id, 'credito', 50, 60.5, 10.5)).resolves.toBeDefined()

      await fallaPorCheck(arqueo(apertura.id, 'debito', 100, 90, 10), 'arqueo_metodo_diferencia_check')
      await fallaPorCheck(
        prisma.arqueoMetodo.update({ where: { id: fila.id }, data: { declarado: 95 } }),
        'arqueo_metodo_diferencia_check',
      )
    })

    it('un método por apertura: repetido falla', async () => {
      const { apertura } = await cajaAbierta()
      await arqueo(apertura.id, 'efectivo', 0, 0, 0)

      await fallaPorUnico(arqueo(apertura.id, 'efectivo', 10, 10, 0), 'ArqueoMetodo', ['turno_caja_id', 'metodo'])
    })
  })

  describe('asignaciones de mesas', () => {
    it('una mesa por turno: repetida falla; otra mesa u otro turno, pasa', async () => {
      const restauranteId = await crearRestaurante()
      const turno = await abrirTurno(restauranteId)
      const [mesa, otraMesa] = [await crearMesa(restauranteId), await crearMesa(restauranteId)]
      const mozo = await prisma.mozo.create({ data: { restauranteId, nombre: 'Mozo E2E' } })
      const asignar = (turnoId: string, mesaId: string) =>
        prisma.asignacionTurno.create({ data: { turnoId, mesaId, mozoId: mozo.id } })

      await asignar(turno.id, mesa.id)
      await fallaPorUnico(asignar(turno.id, mesa.id), 'AsignacionTurno', ['turno_id', 'mesa_id'])
      await expect(asignar(turno.id, otraMesa.id)).resolves.toBeDefined()
      await expect(asignar((await turnoCerrado(restauranteId)).id, mesa.id)).resolves.toBeDefined()
    })
  })

  describe('Restrict', () => {
    it('borrar una caja con una apertura falla', async () => {
      const { caja } = await cajaAbierta()
      await fallaPorFk(prisma.caja.delete({ where: { id: caja.id } }), 'turno_caja_caja_id_fkey')
    })

    it('borrar un usuario que abrió un turno falla', async () => {
      const abrio = await crearUsuario('abrio')
      await prisma.turno.create({ data: { restauranteId: await crearRestaurante(), abiertoPorUsuarioId: abrio } })
      await fallaPorFk(prisma.usuario.delete({ where: { id: abrio } }), 'turno_abierto_por_usuario_id_fkey')
    })
  })

  describe('Pago', () => {
    it('sin propina ni caja queda con propina 0 y turnoCajaId null; propina negativa falla; con caja, pasa', async () => {
      const { restauranteId, apertura } = await cajaAbierta()
      const mesa = await crearMesa(restauranteId)
      const sesion = await prisma.sesionMesa.create({ data: { mesaId: mesa.id, codigoSesion: '001' } })
      const pagar = (extra: object = {}) =>
        prisma.pago.create({ data: { sesionId: sesion.id, metodo: 'efectivo', monto: 1000, ...extra } })

      const pago = await pagar()
      expect(pago.propina.toFixed(2)).toBe('0.00')
      expect(pago.turnoCajaId).toBeNull()

      await fallaPorCheck(pagar({ propina: -1 }), 'pago_propina_check')
      const conCaja = await pagar({ propina: 150, turnoCajaId: apertura.id })
      expect(conCaja).toMatchObject({ turnoCajaId: apertura.id })
      expect(conCaja.propina.toFixed(2)).toBe('150.00')
    })
  })
})
