import { PrismaService } from '../prisma/prisma.service'
import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO } from '../test/app-endpoints'
import { BaseDeCaja, baseDeCajaVacia, conectarBaseDeCaja } from '../test/caja-en-memoria'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { AsignacionesController } from './asignaciones.controller'
import { ReasignacionService } from './reasignacion.service'

// La ruta, el ValidationPipe y el service reales (que pide el rol con el restaurante del turno); la base, en memoria.
describe('endpoints de la reasignación de mesas', () => {
  let api: AppDeEndpoints
  let prisma: PrismaMock
  let base: BaseDeCaja
  const REST = MUNDO.REST_1
  const TURNO = 'turno-1'
  const RUTA = `/turnos/${TURNO}/asignaciones`
  const MOZO = '6f1c2a40-3333-4a1b-9c3d-000000000006'
  const mesaId = (i: number) => `6f1c2a40-4444-4a1b-9c3d-${String(i).padStart(12, '0')}`
  const asignaciones = (cantidad: number) => Array.from({ length: cantidad }, (_, i) => ({ mesaId: mesaId(i + 1), mozoId: MOZO }))

  const reasignar = (body: object | undefined, cuenta = CUENTAS.OWNER_A, ruta = RUTA) => api.pedir('put', ruta, { cuenta, body })

  beforeAll(async () => {
    prisma = crearPrismaMock()
    api = await crearAppDeEndpoints(AsignacionesController, [
      ReasignacionService,
      { provide: PrismaService, useValue: comoPrisma(prisma) },
    ])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    base = baseDeCajaVacia()
    base.turnos.push(
      { id: TURNO, restauranteId: REST, abiertoPorUsuarioId: 'u', abiertoEn: new Date(), cerradoEn: null, observaciones: null },
      { id: 'turno-ajeno', restauranteId: MUNDO.REST_B, abiertoPorUsuarioId: 'u', abiertoEn: new Date(), cerradoEn: null, observaciones: null },
    )
    for (let i = 1; i <= 501; i++) base.mesas.push({ id: mesaId(i), restauranteId: REST, numero: String(i), activo: true })
    base.mozos.push({ id: MOZO, restauranteId: REST, nombre: 'Ana', activo: true, usuarioId: 'usuario-ana' })
    base.asignaciones.push({ turnoId: TURNO, mesaId: mesaId(1), mozoId: MOZO })
    conectarBaseDeCaja(prisma, base)
  })

  describe('el grupo CAJA del restaurante del turno', () => {
    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE', CUENTAS.GERENTE],
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
    ])('%s reasigna: 200 con el turno', async (_caso, cuenta) => {
      const res = await reasignar({ asignaciones: asignaciones(2) }, cuenta)

      expect(res.status).toBe(200)
      expect(res.body.turno.asignaciones.map((a: { mesaId: string }) => a.mesaId)).toEqual([mesaId(1), mesaId(2)])
    })

    it.each([
      ['el MOZO', CUENTAS.MOZO],
      ['COCINA', CUENTAS.COCINA],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['ROOT', CUENTAS.ROOT],
    ])('%s recibe 403 y las asignaciones no cambian', async (_caso, cuenta) => {
      const res = await reasignar({ asignaciones: [] }, cuenta)

      expect(res.status).toBe(403)
      expect(base.asignaciones).toHaveLength(1)
    })

    it('un turno de otro restaurante, 403; uno que no existe, 404; sin token, 401', async () => {
      expect((await reasignar({ asignaciones: [] }, CUENTAS.OWNER_A, '/turnos/turno-ajeno/asignaciones')).status).toBe(403)
      expect((await reasignar({ asignaciones: [] }, CUENTAS.OWNER_A, '/turnos/no-existe/asignaciones')).status).toBe(404)
      expect((await api.pedir('put', RUTA, { body: { asignaciones: [] } })).status).toBe(401)
    })
  })

  describe('el body', () => {
    it.each([
      ['sin body', undefined],
      ['vacío (sin el campo)', {}],
      ['con asignaciones en null', { asignaciones: null }],
      ['con asignaciones que no es una lista', { asignaciones: 'todas' }],
      ['con 501 asignaciones', { asignaciones: asignaciones(501) }],
      [
        'con una mesa repetida',
        {
          asignaciones: [
            { mesaId: mesaId(1), mozoId: MOZO },
            { mesaId: mesaId(1), mozoId: MOZO },
          ],
        },
      ],
      ['con un mesaId que no es un uuid', { asignaciones: [{ mesaId: 'mesa-1', mozoId: MOZO }] }],
      ['con una asignación sin mozo', { asignaciones: [{ mesaId: mesaId(1) }] }],
    ])('%s es 400 y las asignaciones no cambian', async (_caso, body) => {
      const res = await reasignar(body)

      expect(res.status).toBe(400)
      expect(base.asignaciones).toEqual([{ turnoId: TURNO, mesaId: mesaId(1), mozoId: MOZO }])
    })

    it('con [] el turno queda sin asignaciones: 200', async () => {
      const res = await reasignar({ asignaciones: [] })

      expect(res.status).toBe(200)
      expect(base.asignaciones).toEqual([])
    })

    it('500 asignaciones entran', async () => {
      const res = await reasignar({ asignaciones: asignaciones(500) })

      expect(res.status).toBe(200)
      expect(base.asignaciones).toHaveLength(500)
    })

    it('los campos que no van se descartan: el turno sale de la ruta, nunca del body', async () => {
      const res = await reasignar({
        turnoId: 'turno-ajeno',
        restauranteId: MUNDO.REST_B,
        asignaciones: [{ mesaId: mesaId(2), mozoId: MOZO, turnoId: 'turno-ajeno', id: 'elegido' }],
      })

      expect(res.status).toBe(200)
      expect(base.asignaciones).toEqual([{ turnoId: TURNO, mesaId: mesaId(2), mozoId: MOZO }])
    })
  })
})
