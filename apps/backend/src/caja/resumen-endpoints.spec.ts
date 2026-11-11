import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO } from '../test/app-endpoints'
import { BaseDeCaja, baseDeCajaVacia, conectarBaseDeCaja } from '../test/caja-en-memoria'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { ResumenController } from './resumen.controller'
import { ResumenService } from './resumen.service'

// La ruta y el service reales (que pide el rol con el restaurante del turno); la base, en memoria.
describe('endpoints del resumen del turno', () => {
  let api: AppDeEndpoints
  let prisma: PrismaMock
  let base: BaseDeCaja
  const REST = MUNDO.REST_1
  const ABRE = new Date('2026-11-10T20:00:00.000Z')
  const CIERRA = new Date('2026-11-11T02:00:00.000Z')

  const pedir = (cuenta: (typeof CUENTAS)[keyof typeof CUENTAS] | undefined = CUENTAS.OWNER_A, turnoId = 'turno-1') =>
    api.pedir('get', `/turnos/${turnoId}/resumen`, { cuenta })

  beforeAll(async () => {
    prisma = crearPrismaMock()
    api = await crearAppDeEndpoints(ResumenController, [ResumenService, { provide: PrismaService, useValue: comoPrisma(prisma) }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    base = baseDeCajaVacia()
    base.mesas.push({ id: 'mesa-1', restauranteId: REST, numero: '4', activo: true })
    base.sesiones.push({ id: 's1', mesaId: 'mesa-1', estado: 'cerrada', iniciadaEn: ABRE })
    base.mozos.push({ id: 'm-ana', restauranteId: REST, nombre: 'Ana', activo: true, usuarioId: 'u-ana' })
    base.turnos.push(
      { id: 'turno-1', restauranteId: REST, abiertoPorUsuarioId: 'u', abiertoEn: ABRE, cerradoEn: CIERRA, observaciones: null },
      { id: 'turno-abierto', restauranteId: REST, abiertoPorUsuarioId: 'u', abiertoEn: CIERRA, cerradoEn: null, observaciones: null },
      { id: 'turno-ajeno', restauranteId: MUNDO.REST_B, abiertoPorUsuarioId: 'u', abiertoEn: ABRE, cerradoEn: null, observaciones: null },
    )
    base.turnoCajas.push({ id: 'ap-1', turnoId: 'turno-1', cajaId: 'caja-1', fondoInicial: new Prisma.Decimal(0), abiertoEn: ABRE, cerradoEn: CIERRA })
    base.pagos.push(
      { id: 'p1', turnoCajaId: 'ap-1', metodo: 'debito', estado: 'aprobado', monto: new Prisma.Decimal('1500.50'), propina: new Prisma.Decimal(150), sesionId: 's1', mozoId: 'm-ana' },
      { id: 'mp-1', turnoCajaId: null, metodo: 'mercadopago', estado: 'aprobado', monto: new Prisma.Decimal(800), propina: new Prisma.Decimal(0), sesionId: 's1', mozoId: null, fechaCobro: new Date('2026-11-10T22:00:00.000Z'), requiereRevision: true },
    )
    conectarBaseDeCaja(prisma, base)
  })

  describe('el grupo CAJA del restaurante del turno', () => {
    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE', CUENTAS.GERENTE],
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
    ])('%s ve el resumen de un turno cerrado: 200, con los montos como number y las fechas en ISO', async (_caso, cuenta) => {
      const res = await pedir(cuenta)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        turno: { id: 'turno-1', abiertoEn: '2026-11-10T20:00:00.000Z', cerradoEn: '2026-11-11T02:00:00.000Z' },
        porMetodo: [
          { metodo: 'efectivo', cantidad: 0, monto: 0, propina: 0 },
          { metodo: 'debito', cantidad: 1, monto: 1500.5, propina: 150 },
          { metodo: 'credito', cantidad: 0, monto: 0, propina: 0 },
          { metodo: 'transferencia', cantidad: 0, monto: 0, propina: 0 },
        ],
        porMozo: [{ mozoId: 'm-ana', mozoNombre: 'Ana', cantidad: 1, monto: 1500.5, propina: 150 }],
        total: { cantidad: 1, monto: 1500.5, propina: 150 },
        mercadoPago: {
          desde: '2026-11-10T20:00:00.000Z',
          hasta: '2026-11-11T02:00:00.000Z',
          cantidad: 1,
          monto: 800,
          propina: 0,
          pagos: [{ id: 'mp-1', mesaNumero: '4', monto: 800, propina: 0, fechaCobro: '2026-11-10T22:00:00.000Z', requiereRevision: true }],
        },
      })
    })

    it('un turno abierto también responde 200, con cerradoEn null', async () => {
      const res = await pedir(CUENTAS.JEFE_SALON, 'turno-abierto')

      expect(res.status).toBe(200)
      expect(res.body.turno).toEqual({ id: 'turno-abierto', abiertoEn: CIERRA.toISOString(), cerradoEn: null })
    })

    it.each([
      ['el MOZO', CUENTAS.MOZO],
      ['COCINA', CUENTAS.COCINA],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['ROOT', CUENTAS.ROOT],
    ])('%s recibe 403', async (_caso, cuenta) => {
      expect((await pedir(cuenta)).status).toBe(403)
      expect(prisma.pago.findMany).not.toHaveBeenCalled()
    })

    it('un turno de otro restaurante, 403; uno que no existe, 404; sin token, 401', async () => {
      expect((await pedir(CUENTAS.OWNER_A, 'turno-ajeno')).status).toBe(403)
      expect((await pedir(CUENTAS.OWNER_A, 'no-existe')).status).toBe(404)
      expect((await api.pedir('get', '/turnos/turno-1/resumen')).status).toBe(401)
      expect(prisma.pago.findMany).not.toHaveBeenCalled()
    })
  })
})
