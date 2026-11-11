import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO } from '../test/app-endpoints'
import { BaseDeCaja, baseDeCajaVacia, conectarBaseDeCaja } from '../test/caja-en-memoria'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { AperturaService } from './apertura.service'
import { HistorialService, MENSAJE_CURSOR_INVALIDO } from './historial.service'
import { TurnosController } from './turnos.controller'

// La ruta (con MembresiaGuard por el restaurante de la query), el ValidationPipe y el service reales; la base, en memoria.
describe('endpoints del historial de turnos', () => {
  let api: AppDeEndpoints
  let prisma: PrismaMock
  let base: BaseDeCaja
  const REST = MUNDO.REST_1
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

  const listar = (query: Record<string, string> = {}, cuenta: (typeof CUENTAS)[keyof typeof CUENTAS] = CUENTAS.OWNER_A) =>
    api.pedir('get', '/turnos', { cuenta, query: { restauranteId: REST, ...query } })

  beforeAll(async () => {
    prisma = crearPrismaMock()
    api = await crearAppDeEndpoints(TurnosController, [AperturaService, HistorialService, { provide: PrismaService, useValue: comoPrisma(prisma) }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    base = baseDeCajaVacia()
    base.usuarios = { 'u-abre': 'Ana' }
    base.cajas.push({ id: 'caja-1', restauranteId: REST, nombre: 'Principal', activa: true })
    for (let n = 1; n <= 3; n++) {
      base.turnos.push({ id: id(n), restauranteId: REST, abiertoPorUsuarioId: 'u-abre', abiertoEn: new Date(Date.UTC(2026, 10, n, 20)), cerradoEn: null, observaciones: null })
    }
    base.turnos.push({ id: id(9), restauranteId: MUNDO.REST_B, abiertoPorUsuarioId: 'u-abre', abiertoEn: new Date(), cerradoEn: null, observaciones: null })
    base.turnoCajas.push({ id: 'ap-3', turnoId: id(3), cajaId: 'caja-1', fondoInicial: new Prisma.Decimal('100.50'), abiertoEn: new Date(), cerradoEn: null })
    conectarBaseDeCaja(prisma, base)
  })

  describe('el grupo CAJA del restaurante de la query', () => {
    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE', CUENTAS.GERENTE],
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
    ])('%s ve el historial: 200, con las fechas en ISO y los montos como number', async (_caso, cuenta) => {
      const res = await listar({ limite: '1' }, cuenta)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        items: [
          {
            id: id(3),
            abiertoEn: '2026-11-03T20:00:00.000Z',
            abiertoPor: { id: 'u-abre', nombre: 'Ana' },
            cerradoEn: null,
            cerradoPor: null,
            observaciones: null,
            cajas: [{ id: 'ap-3', cajaId: 'caja-1', nombre: 'Principal', fondoInicial: 100.5, arqueo: null, movimientos: { cantidad: 0, ingresos: 0, egresos: 0 } }],
          },
        ],
        siguiente: id(2),
      })
    })

    it.each([
      ['el MOZO', CUENTAS.MOZO],
      ['COCINA', CUENTAS.COCINA],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['ROOT', CUENTAS.ROOT],
    ])('%s recibe 403', async (_caso, cuenta) => {
      expect((await listar({}, cuenta)).status).toBe(403)
      expect(prisma.turno.findMany).not.toHaveBeenCalled()
    })

    it('sin token, 401; sin restauranteId, 400', async () => {
      expect((await api.pedir('get', '/turnos', { query: { restauranteId: REST } })).status).toBe(401)
      expect((await api.pedir('get', '/turnos', { cuenta: CUENTAS.OWNER_A })).status).toBe(400)
      expect(prisma.turno.findMany).not.toHaveBeenCalled()
    })
  })

  describe('la query', () => {
    it.each(['0', '101', 'abc', '2.5', '-1', '1e2'])('limite=%s es 400', async (limite) => {
      expect((await listar({ limite })).status).toBe(400)
      expect(prisma.turno.findMany).not.toHaveBeenCalled()
    })

    it('limite=1 y limite=100 están en el rango; vacío es el por defecto', async () => {
      expect((await listar({ limite: '1' })).body.items).toHaveLength(1)
      expect((await listar({ limite: '100' })).body.items).toHaveLength(3)
      const vacio = await listar({ limite: '' })
      expect(vacio.status).toBe(200)
      expect(vacio.body.items).toHaveLength(3)
    })

    it('el cursor: de otro restaurante o que no existe, 400 con el mensaje; que no es un uuid, 400', async () => {
      for (const cursor of [id(9), id(99)]) {
        const res = await listar({ cursor })
        expect(res.status).toBe(400)
        expect(res.body.message).toBe(MENSAJE_CURSOR_INVALIDO)
      }
      expect((await listar({ cursor: 'turno-1' })).status).toBe(400)
      expect(prisma.turno.findMany).not.toHaveBeenCalled()
    })

    it('con el siguiente de una página, la próxima arranca en ese turno', async () => {
      const primera = await listar({ limite: '2' })
      const segunda = await listar({ limite: '2', cursor: primera.body.siguiente })

      expect(primera.body.items.map((t: { id: string }) => t.id)).toEqual([id(3), id(2)])
      expect(segunda.body).toMatchObject({ siguiente: null })
      expect(segunda.body.items.map((t: { id: string }) => t.id)).toEqual([id(1)])
    })
  })

  describe('GET /turnos/:id (el detalle)', () => {
    const detalle = (turnoId: string, cuenta: (typeof CUENTAS)[keyof typeof CUENTAS] = CUENTAS.OWNER_A) =>
      api.pedir('get', `/turnos/${turnoId}`, { cuenta })

    it('GET /turnos/actual sigue llegando a actual, no al detalle', async () => {
      const res = await api.pedir('get', '/turnos/actual', { cuenta: CUENTAS.OWNER_A, query: { restauranteId: REST } })

      expect(res.status).toBe(200)
      expect(Object.keys(res.body)).toEqual(['turno'])
      expect(prisma.turno.findUniqueOrThrow).not.toHaveBeenCalled()
    })

    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE', CUENTAS.GERENTE],
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
    ])('%s ve el detalle: 200, con las fechas en ISO, los montos como number y los movimientos en lista', async (_caso, cuenta) => {
      base.movimientos.push({
        id: 'm-1',
        turnoCajaId: 'ap-3',
        tipo: 'INGRESO',
        monto: new Prisma.Decimal('20.25'),
        motivo: 'Cambio',
        usuarioId: 'u-abre',
        createdAt: new Date('2026-11-03T21:00:00.000Z'),
      })

      const res = await detalle(id(3), cuenta)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        id: id(3),
        abiertoEn: '2026-11-03T20:00:00.000Z',
        abiertoPor: { id: 'u-abre', nombre: 'Ana' },
        cerradoEn: null,
        cerradoPor: null,
        observaciones: null,
        cajas: [
          {
            id: 'ap-3',
            cajaId: 'caja-1',
            nombre: 'Principal',
            fondoInicial: 100.5,
            arqueo: null,
            movimientos: [
              {
                id: 'm-1',
                cajaId: 'caja-1',
                cajaNombre: 'Principal',
                tipo: 'INGRESO',
                monto: 20.25,
                motivo: 'Cambio',
                usuario: { id: 'u-abre', nombre: 'Ana' },
                createdAt: '2026-11-03T21:00:00.000Z',
              },
            ],
          },
        ],
        asignaciones: [],
      })
    })

    it('un turno cerrado también responde, con su arqueo', async () => {
      base.turnos[0].cerradoEn = new Date('2026-11-02T02:00:00.000Z')
      base.turnoCajas.push({ id: 'ap-1', turnoId: id(1), cajaId: 'caja-1', fondoInicial: new Prisma.Decimal(0), abiertoEn: new Date(), cerradoEn: new Date() })
      for (const metodo of ['efectivo', 'debito', 'credito', 'transferencia']) {
        base.arqueos.push({ turnoCajaId: 'ap-1', metodo, esperado: new Prisma.Decimal(0), declarado: new Prisma.Decimal(0), diferencia: new Prisma.Decimal(0) })
      }

      const res = await detalle(id(1))

      expect(res.status).toBe(200)
      expect(res.body.cerradoEn).toBe('2026-11-02T02:00:00.000Z')
      expect(res.body.cajas[0].arqueo.map((a: { metodo: string }) => a.metodo)).toEqual(['efectivo', 'debito', 'credito', 'transferencia'])
    })

    it.each([
      ['el MOZO', CUENTAS.MOZO],
      ['COCINA', CUENTAS.COCINA],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['ROOT', CUENTAS.ROOT],
    ])('%s recibe 403', async (_caso, cuenta) => {
      expect((await detalle(id(3), cuenta)).status).toBe(403)
      expect(prisma.turno.findUniqueOrThrow).not.toHaveBeenCalled()
    })

    it('un turno de otro restaurante, 403; uno que no existe, 404; sin token, 401', async () => {
      expect((await detalle(id(9))).status).toBe(403)
      expect((await detalle(id(99))).status).toBe(404)
      expect((await api.pedir('get', `/turnos/${id(3)}`)).status).toBe(401)
      expect(prisma.turno.findUniqueOrThrow).not.toHaveBeenCalled()
    })
  })
})
