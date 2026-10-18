import { AppDeEndpoints, USUARIOS, crearAppDeEndpoints } from '../test/app-endpoints'
import { ReportesController } from './reportes.controller'
import { ReportesService } from './reportes.service'

describe('endpoints de reportes', () => {
  let api: AppDeEndpoints
  const reportes = { ventasHoy: jest.fn(), ventasPorHora: jest.fn(), topItems: jest.fn(), ventasPorDia: jest.fn() }
  const RANGO = { restauranteId: 'rest-1', desde: '2026-10-01', hasta: '2026-10-17' }

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
    const res = await api.pedir('get', `/reportes/${ruta}`, { usuario: USUARIOS.OWNER, query: RANGO })

    // Assert
    expect(res.status).toBe(200)
    expect(reportes[metodo]).toHaveBeenCalledWith('rest-1', '2026-10-01', '2026-10-17')
  })

  it('GET /reportes/top-items sin limit usa 5', async () => {
    // Arrange
    reportes.topItems.mockResolvedValue([])

    // Act
    await api.pedir('get', '/reportes/top-items', { usuario: USUARIOS.OWNER, query: { restauranteId: 'rest-1' } })

    // Assert
    expect(reportes.topItems).toHaveBeenCalledWith('rest-1', 5, undefined, undefined)
  })

  it('GET /reportes/top-items convierte limit a número', async () => {
    // Arrange
    reportes.topItems.mockResolvedValue([])

    // Act
    await api.pedir('get', '/reportes/top-items', { usuario: USUARIOS.OWNER, query: { ...RANGO, limit: '10' } })

    // Assert
    expect(reportes.topItems).toHaveBeenCalledWith('rest-1', 10, '2026-10-01', '2026-10-17')
  })

  it('GET /reportes/top-items con un limit que no es número usa el valor por defecto (5)', async () => {
    // Arrange: el ValidationPipe global (transform) convierte "diez" en NaN y DefaultValuePipe trata NaN como ausente.
    reportes.topItems.mockResolvedValue([])

    // Act
    const res = await api.pedir('get', '/reportes/top-items', { usuario: USUARIOS.OWNER, query: { restauranteId: 'rest-1', limit: 'diez' } })

    // Assert
    expect(res.status).toBe(200)
    expect(reportes.topItems).toHaveBeenCalledWith('rest-1', 5, undefined, undefined)
  })

  it('un GERENTE no ve reportes (403)', async () => {
    // Act
    const res = await api.pedir('get', '/reportes/ventas-hoy', { usuario: USUARIOS.GERENTE, query: RANGO })

    // Assert
    expect(res.status).toBe(403)
    expect(reportes.ventasHoy).not.toHaveBeenCalled()
  })
})
