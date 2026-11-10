import { Prisma } from '@prisma/client'
import { METODOS_ARQUEO } from '../common/caja.constant'
import { PrismaService } from '../prisma/prisma.service'
import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO } from '../test/app-endpoints'
import { BaseDeCaja, baseDeCajaVacia, conectarBaseDeCaja } from '../test/caja-en-memoria'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { CierreController } from './cierre.controller'
import { CierreService } from './cierre.service'

// La ruta, el ValidationPipe y el service reales (que pide el rol con el restaurante del turno); la base, en memoria.
describe('endpoints del cierre del turno', () => {
  let api: AppDeEndpoints
  let prisma: PrismaMock
  let base: BaseDeCaja
  const REST = MUNDO.REST_1
  const RUTA = '/turnos/turno-1/cierre'
  const CAJA = '6f1c2a40-5555-4a1b-9c3d-000000000001'
  const OTRA = '6f1c2a40-5555-4a1b-9c3d-000000000002'
  const DECLARADO = { efectivo: 1000, debito: 0, credito: 0, transferencia: 0 }
  const VALIDO = { cajas: [{ cajaId: CAJA, declarado: DECLARADO }] }

  const cerrar = (body: object | undefined, cuenta = CUENTAS.OWNER_A, ruta = RUTA) => api.pedir('post', ruta, { cuenta, body })
  const conDeclarado = (declarado: object) => ({ cajas: [{ cajaId: CAJA, declarado }] })

  beforeAll(async () => {
    prisma = crearPrismaMock()
    api = await crearAppDeEndpoints(CierreController, [CierreService, { provide: PrismaService, useValue: comoPrisma(prisma) }])
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
    base.turnoCajas.push({ id: 'ap-1', turnoId: 'turno-1', cajaId: CAJA, fondoInicial: new Prisma.Decimal(1000), abiertoEn: new Date(), cerradoEn: null })
    conectarBaseDeCaja(prisma, base)
  })

  describe('el grupo CAJA del restaurante del turno', () => {
    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE', CUENTAS.GERENTE],
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
    ])('%s cierra: 200 con el turno, el arqueo y los avisos', async (_caso, cuenta) => {
      const res = await cerrar(VALIDO, cuenta)

      expect(res.status).toBe(200)
      expect(res.body.arqueos).toEqual([
        {
          cajaId: CAJA,
          cajaNombre: 'Principal',
          fondoInicial: 1000,
          metodos: METODOS_ARQUEO.map((metodo) => ({
            metodo,
            esperado: metodo === 'efectivo' ? 1000 : 0,
            declarado: metodo === 'efectivo' ? 1000 : 0,
            diferencia: 0,
          })),
        },
      ])
      expect(res.body.avisos).toEqual({ mesasAbiertas: [] })
      expect(base.turnos[0].cerradoPorUsuarioId).toBe(cuenta.id)
    })

    it.each([
      ['el MOZO', CUENTAS.MOZO],
      ['COCINA', CUENTAS.COCINA],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['ROOT', CUENTAS.ROOT],
    ])('%s recibe 403 y no se cierra nada', async (_caso, cuenta) => {
      const res = await cerrar(VALIDO, cuenta)

      expect(res.status).toBe(403)
      expect(base.turnos[0].cerradoEn).toBeNull()
    })

    it('un turno de otro restaurante, 403; uno que no existe, 404; sin token, 401', async () => {
      expect((await cerrar(VALIDO, CUENTAS.OWNER_A, '/turnos/turno-ajeno/cierre')).status).toBe(403)
      expect((await cerrar(VALIDO, CUENTAS.OWNER_A, '/turnos/no-existe/cierre')).status).toBe(404)
      expect((await api.pedir('post', RUTA, { body: VALIDO })).status).toBe(401)
      expect(base.arqueos).toEqual([])
    })
  })

  describe('el body', () => {
    it.each([
      ['sin body', undefined],
      ['vacío', {}],
      ['con cajas vacío', { cajas: [] }],
      ['con cajas que no es una lista', { cajas: { cajaId: CAJA, declarado: DECLARADO } }],
      [
        'con 3 cajas',
        {
          cajas: [
            { cajaId: CAJA, declarado: DECLARADO },
            { cajaId: OTRA, declarado: DECLARADO },
            { cajaId: '6f1c2a40-5555-4a1b-9c3d-000000000003', declarado: DECLARADO },
          ],
        },
      ],
      [
        'con una caja repetida',
        {
          cajas: [
            { cajaId: CAJA, declarado: DECLARADO },
            { cajaId: CAJA, declarado: DECLARADO },
          ],
        },
      ],
      ['con un cajaId que no es un uuid', { cajas: [{ cajaId: 'caja-1', declarado: DECLARADO }] }],
      ['sin el declarado', { cajas: [{ cajaId: CAJA }] }],
      ['con el declarado en null', { cajas: [{ cajaId: CAJA, declarado: null }] }],
      ['con el declarado que no es un objeto', { cajas: [{ cajaId: CAJA, declarado: 1000 }] }],
      ['con un monto negativo', conDeclarado({ ...DECLARADO, debito: -1 })],
      ['con un monto de 3 decimales', conDeclarado({ ...DECLARADO, credito: 10.123 })],
      ['con un monto mayor a 99999999.99', conDeclarado({ ...DECLARADO, efectivo: 100_000_000 })],
      ['con un monto como texto', conDeclarado({ ...DECLARADO, transferencia: '0' })],
      ['con observaciones de 501 caracteres', { ...VALIDO, observaciones: 'x'.repeat(501) }],
    ])('%s es 400 y no se cierra nada', async (_caso, body) => {
      const res = await cerrar(body)

      expect(res.status).toBe(400)
      expect(base.turnos[0].cerradoEn).toBeNull()
      expect(base.arqueos).toEqual([])
    })

    // Si se suma un método a METODOS_ARQUEO, este test lo recorre: el DTO tiene que exigirlo también.
    it.each(METODOS_ARQUEO)('sin %s en el declarado es 400', async (metodo) => {
      const { [metodo]: _omitido, ...incompleto } = DECLARADO

      const res = await cerrar(conDeclarado(incompleto))

      expect(res.status).toBe(400)
      expect(base.turnos[0].cerradoEn).toBeNull()
    })

    it('en el borde: 0 en todos los métodos, 99999999.99 y observaciones de 500 caracteres', async () => {
      base.pagos.push({ id: 'p1', turnoCajaId: 'ap-1', metodo: 'debito', estado: 'aprobado', monto: new Prisma.Decimal('99999999.99'), propina: new Prisma.Decimal(0) })

      const res = await cerrar({ ...conDeclarado({ efectivo: 0, debito: 99_999_999.99, credito: 0, transferencia: 0 }), observaciones: 'x'.repeat(500) })

      expect(res.status).toBe(200)
    })

    it('las observaciones vacías no tocan las del turno', async () => {
      base.turnos[0].observaciones = 'Noche de partido'

      expect((await cerrar({ ...VALIDO, observaciones: '   ' })).status).toBe(200)
      expect(base.turnos[0].observaciones).toBe('Noche de partido')
    })

    it('los campos que no van se descartan: quién cierra sale de la cuenta, y no se elige la fecha ni el esperado', async () => {
      const res = await cerrar(
        {
          cerradoPorUsuarioId: 'otra-cuenta',
          cerradoEn: '2020-01-01T00:00:00Z',
          cajas: [{ cajaId: CAJA, declarado: { ...DECLARADO, mercadopago: 5000 }, esperado: { efectivo: 1 } }],
        },
        CUENTAS.GERENTE,
      )

      expect(res.status).toBe(200)
      expect(base.turnos[0].cerradoPorUsuarioId).toBe(CUENTAS.GERENTE.id)
      expect(base.turnos[0].cerradoEn?.toISOString()).not.toBe('2020-01-01T00:00:00.000Z')
      expect(base.arqueos.map((a) => a.metodo)).toEqual([...METODOS_ARQUEO])
      expect(base.arqueos[0].esperado.toFixed(2)).toBe('1000.00')
    })
  })
})
