import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO } from '../test/app-endpoints'
import { ReportesController } from './reportes.controller'
import { ReportesService } from './reportes.service'

describe('endpoints de reportes', () => {
  let api: AppDeEndpoints
  const reportes = { ventasHoy: jest.fn(), ventasPorHora: jest.fn(), topItems: jest.fn(), ventasPorDia: jest.fn() }
  const RANGO = { restauranteId: MUNDO.REST_1, desde: '2026-10-01', hasta: '2026-10-17' }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(ReportesController, [{ provide: ReportesService, useValue: reportes }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => jest.clearAllMocks())

  it.each([
    ['ventas-hoy', 'ventasHoy'],
    ['ventas-por-hora', 'ventasPorHora'],
    ['ventas-por-dia', 'ventasPorDia'],
  ] as const)('GET /reportes/%s pasa restaurante, desde y hasta', async (ruta, metodo) => {
    // Arrange
    reportes[metodo].mockResolvedValue([])

    // Act
    const res = await api.pedir('get', `/reportes/${ruta}`, { cuenta: CUENTAS.OWNER_A, query: RANGO })

    // Assert
    expect(res.status).toBe(200)
    expect(reportes[metodo]).toHaveBeenCalledWith(MUNDO.REST_1, '2026-10-01', '2026-10-17')
  })

  it('GET /reportes/top-items sin limit usa 5', async () => {
    // Arrange
    reportes.topItems.mockResolvedValue([])

    // Act
    await api.pedir('get', '/reportes/top-items', { cuenta: CUENTAS.OWNER_A, query: { restauranteId: MUNDO.REST_1 } })

    // Assert
    expect(reportes.topItems).toHaveBeenCalledWith(MUNDO.REST_1, 5, undefined, undefined)
  })

  it('GET /reportes/top-items convierte limit a número', async () => {
    // Arrange
    reportes.topItems.mockResolvedValue([])

    // Act
    await api.pedir('get', '/reportes/top-items', { cuenta: CUENTAS.OWNER_A, query: { ...RANGO, limit: '10' } })

    // Assert
    expect(reportes.topItems).toHaveBeenCalledWith(MUNDO.REST_1, 10, '2026-10-01', '2026-10-17')
  })

  it('GET /reportes/top-items con un limit que no es número usa el valor por defecto (5)', async () => {
    // Arrange: el ValidationPipe global (transform) convierte "diez" en NaN y DefaultValuePipe trata NaN como ausente.
    reportes.topItems.mockResolvedValue([])

    // Act
    const res = await api.pedir('get', '/reportes/top-items', { cuenta: CUENTAS.OWNER_A, query: { restauranteId: MUNDO.REST_1, limit: 'diez' } })

    // Assert
    expect(res.status).toBe(200)
    expect(reportes.topItems).toHaveBeenCalledWith(MUNDO.REST_1, 5, undefined, undefined)
  })

  it.each([
    ['el GERENTE', CUENTAS.GERENTE],
    ['el OWNER de otra marca (antes no se chequeaba la pertenencia)', CUENTAS.OWNER_B],
    ['ROOT (no es un bypass)', CUENTAS.ROOT],
  ])('%s no ve reportes (403)', async (_caso, cuenta) => {
    // Act
    const res = await api.pedir('get', '/reportes/ventas-hoy', { cuenta, query: RANGO })

    // Assert
    expect(res.status).toBe(403)
    expect(reportes.ventasHoy).not.toHaveBeenCalled()
  })

  it('sin restauranteId: 400', async () => {
    // Act
    const res = await api.pedir('get', '/reportes/ventas-por-dia', { cuenta: CUENTAS.OWNER_A })

    // Assert
    expect(res.status).toBe(400)
    expect(reportes.ventasPorDia).not.toHaveBeenCalled()
  })
})
