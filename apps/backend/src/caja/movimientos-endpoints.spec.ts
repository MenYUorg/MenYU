import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO } from '../test/app-endpoints'
import { BaseDeCaja, baseDeCajaVacia, conectarBaseDeCaja } from '../test/caja-en-memoria'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { MovimientosController } from './movimientos.controller'
import { MovimientosService } from './movimientos.service'

// La ruta, el ValidationPipe y el service reales (que pide el rol con el restaurante del turno); la base, en memoria.
describe('endpoints de los movimientos de caja', () => {
  let api: AppDeEndpoints
  let prisma: PrismaMock
  let base: BaseDeCaja
  const REST = MUNDO.REST_1
  const RUTA = '/turnos/turno-1/movimientos'
  const CAJA = '6f1c2a40-5555-4a1b-9c3d-000000000001'
  const VALIDO = { cajaId: CAJA, tipo: 'INGRESO', monto: 500, motivo: 'Cambio para la caja' }

  const registrar = (body: object | undefined, cuenta = CUENTAS.OWNER_A, ruta = RUTA) => api.pedir('post', ruta, { cuenta, body })

  beforeAll(async () => {
    prisma = crearPrismaMock()
    api = await crearAppDeEndpoints(MovimientosController, [
      MovimientosService,
      { provide: PrismaService, useValue: comoPrisma(prisma) },
    ])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    base = baseDeCajaVacia()
    base.cajas.push({ id: CAJA, restauranteId: REST, nombre: 'Principal', activa: true })
    base.turnos.push(
      { id: 'turno-1', restauranteId: REST, abiertoPorUsuarioId: 'u', abiertoEn: new Date(), cerradoEn: null, observaciones: null },
      { id: 'turno-ajeno', restauranteId: MUNDO.REST_B, abiertoPorUsuarioId: 'u', abiertoEn: new Date(), cerradoEn: null, observaciones: null },
    )
    base.turnoCajas.push({ id: 'ap-1', turnoId: 'turno-1', cajaId: CAJA, fondoInicial: new Prisma.Decimal(0), abiertoEn: new Date() })
    conectarBaseDeCaja(prisma, base)
  })

  describe('el grupo CAJA del restaurante del turno', () => {
    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE', CUENTAS.GERENTE],
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
    ])('%s registra: 201 con el movimiento', async (_caso, cuenta) => {
      const res = await registrar(VALIDO, cuenta)

      expect(res.status).toBe(201)
      expect(res.body.movimiento).toMatchObject({ cajaId: CAJA, cajaNombre: 'Principal', tipo: 'INGRESO', monto: 500 })
      expect(base.movimientos).toHaveLength(1)
    })

    it.each([
      ['el MOZO', CUENTAS.MOZO],
      ['COCINA', CUENTAS.COCINA],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['ROOT', CUENTAS.ROOT],
    ])('%s recibe 403 y no se registra nada', async (_caso, cuenta) => {
      const res = await registrar(VALIDO, cuenta)

      expect(res.status).toBe(403)
      expect(base.movimientos).toEqual([])
    })

    it('un turno de otro restaurante, 403; uno que no existe, 404; sin token, 401', async () => {
      expect((await registrar(VALIDO, CUENTAS.OWNER_A, '/turnos/turno-ajeno/movimientos')).status).toBe(403)
      expect((await registrar(VALIDO, CUENTAS.OWNER_A, '/turnos/no-existe/movimientos')).status).toBe(404)
      expect((await api.pedir('post', RUTA, { body: VALIDO })).status).toBe(401)
      expect(base.movimientos).toEqual([])
    })
  })

  describe('el body', () => {
    it.each([
      ['sin body', undefined],
      ['vacío', {}],
      ['con un tipo que no existe', { ...VALIDO, tipo: 'AJUSTE' }],
      ['con el tipo en minúsculas', { ...VALIDO, tipo: 'ingreso' }],
      ['con monto 0', { ...VALIDO, monto: 0 }],
      ['con un monto negativo', { ...VALIDO, monto: -10 }],
      ['con un monto de 3 decimales', { ...VALIDO, monto: 10.123 }],
      ['con un monto mayor a 99999999.99', { ...VALIDO, monto: 100_000_000 }],
      ['con el monto como texto', { ...VALIDO, monto: '500' }],
      ['con el motivo vacío', { ...VALIDO, motivo: '' }],
      ['con el motivo solo con espacios', { ...VALIDO, motivo: '   ' }],
      ['con un motivo de 201 caracteres', { ...VALIDO, motivo: 'x'.repeat(201) }],
      ['con un cajaId que no es un uuid', { ...VALIDO, cajaId: 'caja-1' }],
    ])('%s es 400 y no se registra nada', async (_caso, body) => {
      const res = await registrar(body)

      expect(res.status).toBe(400)
      expect(base.movimientos).toEqual([])
    })

    it('en el borde: 0,01, 99999999.99 y un motivo de 200 caracteres', async () => {
      expect((await registrar({ ...VALIDO, monto: 0.01 })).status).toBe(201)
      expect((await registrar({ ...VALIDO, monto: 99_999_999.99, motivo: 'x'.repeat(200) })).status).toBe(201)
      expect(base.movimientos.map((m) => m.monto.toFixed(2))).toEqual(['0.01', '99999999.99'])
    })

    it('el motivo se guarda sin espacios en los costados', async () => {
      await registrar({ ...VALIDO, motivo: '  Cambio  ' })

      expect(base.movimientos[0].motivo).toBe('Cambio')
    })

    it('los campos que no van se descartan: quién lo carga sale de la cuenta, y no se elige el id ni la fecha', async () => {
      const res = await registrar({ ...VALIDO, usuarioId: 'otra-cuenta', id: 'elegido', createdAt: '2020-01-01T00:00:00Z' }, CUENTAS.GERENTE)

      expect(res.status).toBe(201)
      expect(base.movimientos).toEqual([
        expect.objectContaining({ usuarioId: CUENTAS.GERENTE.id, id: expect.not.stringMatching('elegido') }),
      ])
      expect(base.movimientos[0].createdAt.toISOString()).not.toBe('2020-01-01T00:00:00.000Z')
    })
  })
})
