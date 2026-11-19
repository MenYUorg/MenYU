import { PrismaService } from '../prisma/prisma.service'
import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO } from '../test/app-endpoints'
import { baseDeCajaVacia, conectarBaseDeCaja } from '../test/caja-en-memoria'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { AperturaService } from './apertura.service'
import { HistorialService } from './historial.service'
import { TurnosController } from './turnos.controller'

// GET /turnos/preparacion (#359): la ruta, los guards de permisos y el service reales; la base, en memoria
// (test/caja-en-memoria.ts). Qué filtra cada consulta lo prueban preparacion-de-turno.spec.ts y el e2e.
describe('endpoints de la preparación del turno', () => {
  let api: AppDeEndpoints
  let prisma: PrismaMock
  const REST = MUNDO.REST_1
  const MESA_1 = '6f1c2a40-4444-4a1b-9c3d-000000000001'
  const MOZO_1 = '6f1c2a40-3333-4a1b-9c3d-000000000006'

  const preparacion = (cuenta?: (typeof CUENTAS)[keyof typeof CUENTAS], query: Record<string, string> = { restauranteId: REST }) =>
    api.pedir('get', '/turnos/preparacion', { cuenta, query })

  beforeAll(async () => {
    prisma = crearPrismaMock()
    api = await crearAppDeEndpoints(TurnosController, [AperturaService, HistorialService, { provide: PrismaService, useValue: comoPrisma(prisma) }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    const base = baseDeCajaVacia()
    base.mesas.push({ id: MESA_1, restauranteId: REST, numero: '1', activo: true })
    base.mozos.push({ id: MOZO_1, restauranteId: REST, nombre: 'Ana', activo: true, usuarioId: 'usuario-ana' })
    base.mozoMesas.push({ mesaId: MESA_1, mozoId: MOZO_1 })
    conectarBaseDeCaja(prisma, base)
  })

  it.each([
    ['el OWNER de la marca', CUENTAS.OWNER_A],
    ['el GERENTE', CUENTAS.GERENTE],
    ['el JEFE_SALON', CUENTAS.JEFE_SALON],
  ])('%s la lee: los mozos, las mesas y la precarga, sin turno abierto', async (_caso, cuenta) => {
    const res = await preparacion(cuenta)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      mozos: [{ id: MOZO_1, nombre: 'Ana' }],
      mesas: [{ id: MESA_1, numero: '1' }],
      precarga: { asignaciones: [{ mesaId: MESA_1, mozoId: MOZO_1 }], avisos: [] },
    })
  })

  it('no cae en GET /turnos/:id: no busca un turno "preparacion"', async () => {
    const res = await preparacion(CUENTAS.OWNER_A)

    expect(res.status).toBe(200)
    expect(prisma.turno.findUnique).not.toHaveBeenCalled()
    expect(prisma.turno.findFirst).not.toHaveBeenCalled()
  })

  it.each([
    ['el MOZO', CUENTAS.MOZO],
    ['COCINA', CUENTAS.COCINA],
    ['el OWNER de otra marca', CUENTAS.OWNER_B],
    ['ROOT', CUENTAS.ROOT],
  ])('%s recibe 403', async (_caso, cuenta) => {
    const res = await preparacion(cuenta)

    expect(res.status).toBe(403)
    expect(prisma.mozo.findMany).not.toHaveBeenCalled()
    expect(prisma.mesa.findMany).not.toHaveBeenCalled()
  })

  it('sin token, 401; sin restauranteId, 400; con un restaurante que no existe, 403', async () => {
    expect((await preparacion(undefined)).status).toBe(401)
    expect((await preparacion(CUENTAS.OWNER_A, {})).status).toBe(400)
    expect((await preparacion(CUENTAS.OWNER_A, { restauranteId: '6f1c2a40-9999-4a1b-9c3d-000000000999' })).status).toBe(403)
    expect(prisma.mesa.findMany).not.toHaveBeenCalled()
  })
})
