import { PrismaService } from '../prisma/prisma.service'
import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO } from '../test/app-endpoints'
import { BaseDeCaja, baseDeCajaVacia, conectarBaseDeCaja } from '../test/caja-en-memoria'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { AperturaService } from './apertura.service'
import { TurnosController } from './turnos.controller'

// La ruta, los guards de permisos, el ValidationPipe y el service reales; la base, en memoria (test/caja-en-memoria.ts).
describe('endpoints de los turnos', () => {
  let api: AppDeEndpoints
  let prisma: PrismaMock
  let base: BaseDeCaja
  const REST = MUNDO.REST_1
  const NO_EXISTE = '6f1c2a40-9999-4a1b-9c3d-000000000999'
  const CAJA_1 = '6f1c2a40-5555-4a1b-9c3d-000000000001'
  const CAJA_2 = '6f1c2a40-5555-4a1b-9c3d-000000000002'
  const CAJA_3 = '6f1c2a40-5555-4a1b-9c3d-000000000003'
  const MESA_1 = '6f1c2a40-4444-4a1b-9c3d-000000000001'
  const MOZO_1 = '6f1c2a40-3333-4a1b-9c3d-000000000006'

  const cuerpo = (cambios: object = {}) => ({ restauranteId: REST, cajas: [{ cajaId: CAJA_1, fondoInicial: 1000 }], ...cambios })
  const abrir = (cambios: object = {}, cuenta = CUENTAS.OWNER_A) => api.pedir('post', '/turnos', { cuenta, body: cuerpo(cambios) })

  beforeAll(async () => {
    prisma = crearPrismaMock()
    api = await crearAppDeEndpoints(TurnosController, [AperturaService, { provide: PrismaService, useValue: comoPrisma(prisma) }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    base = baseDeCajaVacia()
    base.cajas.push(
      { id: CAJA_1, restauranteId: REST, nombre: 'Principal', activa: true },
      { id: CAJA_2, restauranteId: REST, nombre: 'Barra', activa: true },
      { id: CAJA_3, restauranteId: REST, nombre: 'Terraza', activa: true },
    )
    base.mesas.push({ id: MESA_1, restauranteId: REST, numero: '1', activo: true })
    base.mozos.push({ id: MOZO_1, restauranteId: REST, nombre: 'Ana', activo: true, usuarioId: 'usuario-ana' })
    conectarBaseDeCaja(prisma, base)
  })

  describe('POST /turnos (el grupo CAJA del restaurante del body)', () => {
    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE', CUENTAS.GERENTE],
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
    ])('%s abre el turno: 201, a su nombre', async (_caso, cuenta) => {
      const res = await abrir({}, cuenta)

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({
        turno: { restauranteId: REST, abiertoPor: { id: cuenta.id }, cajas: [{ cajaId: CAJA_1, fondoInicial: 1000 }] },
        avisos: [],
      })
    })

    it.each([
      ['el MOZO', CUENTAS.MOZO],
      ['COCINA', CUENTAS.COCINA],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['ROOT', CUENTAS.ROOT],
    ])('%s recibe 403 y no se abre nada', async (_caso, cuenta) => {
      const res = await abrir({}, cuenta)

      expect(res.status).toBe(403)
      expect(prisma.turno.create).not.toHaveBeenCalled()
    })

    it('sin token, 401; sin restauranteId, 400; con un restaurante que no existe, 403', async () => {
      expect((await api.pedir('post', '/turnos', { body: cuerpo() })).status).toBe(401)
      expect((await api.pedir('post', '/turnos', { cuenta: CUENTAS.OWNER_A, body: { cajas: cuerpo().cajas } })).status).toBe(400)
      expect((await abrir({ restauranteId: NO_EXISTE })).status).toBe(403)
      expect(prisma.turno.create).not.toHaveBeenCalled()
    })

    it.each([
      ['sin cajas', { cajas: undefined }],
      ['con cajas vacío', { cajas: [] }],
      ['con cajas que no es una lista', { cajas: { cajaId: CAJA_1, fondoInicial: 0 } }],
      [
        'con 3 cajas',
        {
          cajas: [
            { cajaId: CAJA_1, fondoInicial: 0 },
            { cajaId: CAJA_2, fondoInicial: 0 },
            { cajaId: CAJA_3, fondoInicial: 0 },
          ],
        },
      ],
      [
        'con una caja repetida',
        {
          cajas: [
            { cajaId: CAJA_1, fondoInicial: 0 },
            { cajaId: CAJA_1, fondoInicial: 10 },
          ],
        },
      ],
      ['con un cajaId que no es un uuid', { cajas: [{ cajaId: 'caja-1', fondoInicial: 0 }] }],
      ['sin fondo', { cajas: [{ cajaId: CAJA_1 }] }],
      ['con un fondo negativo', { cajas: [{ cajaId: CAJA_1, fondoInicial: -1 }] }],
      ['con un fondo de 3 decimales', { cajas: [{ cajaId: CAJA_1, fondoInicial: 10.123 }] }],
      ['con un fondo mayor a 99999999.99', { cajas: [{ cajaId: CAJA_1, fondoInicial: 100_000_000 }] }],
      ['con un fondo como texto', { cajas: [{ cajaId: CAJA_1, fondoInicial: '1000' }] }],
      ['con asignaciones en null', { asignaciones: null }],
      ['con asignaciones que no es una lista', { asignaciones: 'todas' }],
      ['con una asignación sin mozo', { asignaciones: [{ mesaId: MESA_1 }] }],
      ['con una asignación con un id que no es un uuid', { asignaciones: [{ mesaId: 'mesa-1', mozoId: MOZO_1 }] }],
      [
        'con una mesa repetida',
        {
          asignaciones: [
            { mesaId: MESA_1, mozoId: MOZO_1 },
            { mesaId: MESA_1, mozoId: MOZO_1 },
          ],
        },
      ],
      ['con observaciones de 501 caracteres', { observaciones: 'x'.repeat(501) }],
    ])('un body %s es 400 y no se abre nada', async (_caso, cambios) => {
      const res = await abrir(cambios)

      expect(res.status).toBe(400)
      expect(prisma.turno.create).not.toHaveBeenCalled()
    })

    it('en el borde: fondo de 99999999.99, 2 cajas y observaciones de 500 caracteres', async () => {
      const res = await abrir({
        cajas: [
          { cajaId: CAJA_1, fondoInicial: 99_999_999.99 },
          { cajaId: CAJA_2, fondoInicial: 0.01 },
        ],
        observaciones: 'x'.repeat(500),
      })

      expect(res.status).toBe(201)
      expect(res.body.turno.cajas.map((c: { fondoInicial: number }) => c.fondoInicial)).toEqual([0.01, 99_999_999.99])
    })

    it('hasta 500 asignaciones: 500 pasan y 501 son 400', async () => {
      const mesaId = (i: number) => `6f1c2a40-4444-4a1b-9c3d-${String(i).padStart(12, '0')}`
      for (let i = 2; i <= 501; i++) base.mesas.push({ id: mesaId(i), restauranteId: REST, numero: String(i), activo: true })
      const asignaciones = (cantidad: number) => Array.from({ length: cantidad }, (_, i) => ({ mesaId: mesaId(i + 1), mozoId: MOZO_1 }))

      const quinientas = await abrir({ asignaciones: asignaciones(500) })
      expect(quinientas.status).toBe(201)
      expect(quinientas.body.turno.asignaciones).toHaveLength(500)

      base.turnos.length = 0
      jest.clearAllMocks()
      const quinientasUna = await abrir({ asignaciones: asignaciones(501) })
      expect(quinientasUna.status).toBe(400)
      expect(prisma.turno.create).not.toHaveBeenCalled()
    })

    it('los campos que no van se descartan: quién abre sale de la cuenta, y no se elige el id ni el cierre', async () => {
      const res = await abrir({
        abiertoPorUsuarioId: 'otra-cuenta',
        cerradoEn: '2026-11-10T00:00:00Z',
        id: 'elegido',
        cajas: [{ cajaId: CAJA_1, fondoInicial: 5, id: 'apertura-elegida', cerradoEn: '2026-11-10T00:00:00Z' }],
        asignaciones: [{ mesaId: MESA_1, mozoId: MOZO_1, turnoId: 'otro-turno' }],
      })

      expect(res.status).toBe(201)
      expect(prisma.turno.create).toHaveBeenCalledWith({
        data: { restauranteId: REST, abiertoPorUsuarioId: CUENTAS.OWNER_A.id, observaciones: null },
        select: { id: true },
      })
      expect(prisma.turnoCaja.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ id: expect.anything() }) }),
      )
      expect(base.asignaciones).toEqual([{ turnoId: res.body.turno.id, mesaId: MESA_1, mozoId: MOZO_1 }])
    })

    it('con un turno abierto, 409', async () => {
      expect((await abrir()).status).toBe(201)

      const res = await abrir({ cajas: [{ cajaId: CAJA_2, fondoInicial: 0 }] })

      expect(res.status).toBe(409)
      expect(res.body.message).toBe('Ya hay un turno abierto en este restaurante')
    })
  })

  describe('GET /turnos/actual (el grupo CAJA del restaurante de la query)', () => {
    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE', CUENTAS.GERENTE],
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
    ])('%s lo consulta: { turno: null } sin turno abierto', async (_caso, cuenta) => {
      const res = await api.pedir('get', '/turnos/actual', { cuenta, query: { restauranteId: REST } })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ turno: null })
    })

    it('con un turno abierto, lo devuelve', async () => {
      const abierto = await abrir()

      const res = await api.pedir('get', '/turnos/actual', { cuenta: CUENTAS.GERENTE, query: { restauranteId: REST } })

      expect(res.status).toBe(200)
      expect(res.body.turno).toMatchObject({ id: abierto.body.turno.id, cajas: [{ cajaId: CAJA_1, fondoInicial: 1000 }] })
    })

    it.each([
      ['el MOZO', CUENTAS.MOZO],
      ['COCINA', CUENTAS.COCINA],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['ROOT', CUENTAS.ROOT],
    ])('%s recibe 403', async (_caso, cuenta) => {
      const res = await api.pedir('get', '/turnos/actual', { cuenta, query: { restauranteId: REST } })

      expect(res.status).toBe(403)
      expect(prisma.turno.findFirst).not.toHaveBeenCalled()
    })

    it('sin token, 401; sin restauranteId, 400; con un restaurante que no existe, 403', async () => {
      expect((await api.pedir('get', '/turnos/actual', { query: { restauranteId: REST } })).status).toBe(401)
      expect((await api.pedir('get', '/turnos/actual', { cuenta: CUENTAS.OWNER_A })).status).toBe(400)
      expect((await api.pedir('get', '/turnos/actual', { cuenta: CUENTAS.OWNER_A, query: { restauranteId: NO_EXISTE } })).status).toBe(403)
    })
  })
})
