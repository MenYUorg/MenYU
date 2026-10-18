import { PrismaMock, comoPrisma, crearPrismaMock } from '../test/prisma-mock'
import { ReportesService } from './reportes.service'

const DESDE = '2026-10-01'
const HASTA = '2026-10-17'

/** Los valores interpolados en la última llamada a $queryRaw (la plantilla SQL es el primer argumento). */
const valoresDelQuery = (prisma: PrismaMock) => prisma.$queryRaw.mock.calls[prisma.$queryRaw.mock.calls.length - 1].slice(1)

describe('ReportesService', () => {
  let prisma: PrismaMock
  let service: ReportesService

  beforeEach(() => {
    prisma = crearPrismaMock()
    service = new ReportesService(comoPrisma(prisma))
  })

  describe('ventasHoy', () => {
    it('suma precio × cantidad, cuenta pedidos distintos y redondea a centavos', async () => {
      // Arrange
      prisma.pedidoItem.findMany.mockResolvedValue([
        { cantidad: 2, precioUnitario: '1000.105', pedidoId: 'p1' },
        { cantidad: 1, precioUnitario: '500', pedidoId: 'p1' },
        { cantidad: 3, precioUnitario: '100', pedidoId: 'p2' },
      ])
      prisma.sesionMesa.count.mockResolvedValue(2)
      prisma.$queryRaw.mockResolvedValue([{ ticket_promedio: '1400.456' }])

      // Act
      const resumen = await service.ventasHoy('rest-1', DESDE, HASTA)

      // Assert
      expect(resumen).toEqual({ total: 2800.21, cantidadPedidos: 2, ticketPromedio: 1400.46, cantidadSesiones: 2 })
    })

    it('sin sesiones cerradas el ticket promedio es 0', async () => {
      // Arrange
      prisma.pedidoItem.findMany.mockResolvedValue([])
      prisma.sesionMesa.count.mockResolvedValue(0)
      prisma.$queryRaw.mockResolvedValue([{ ticket_promedio: null }])

      // Act
      const resumen = await service.ventasHoy('rest-1', DESDE, HASTA)

      // Assert
      expect(resumen).toEqual({ total: 0, cantidadPedidos: 0, ticketPromedio: 0, cantidadSesiones: 0 })
    })

    it('el rango va del inicio del día "desde" al final del día "hasta" y filtra por restaurante', async () => {
      // Arrange
      prisma.pedidoItem.findMany.mockResolvedValue([])
      prisma.sesionMesa.count.mockResolvedValue(0)
      prisma.$queryRaw.mockResolvedValue([])

      // Act
      await service.ventasHoy('rest-1', DESDE, HASTA)

      // Assert
      const { where } = prisma.pedidoItem.findMany.mock.calls[0][0]
      expect(where.pedido).toEqual({
        createdAt: { gte: new Date('2026-10-01T00:00:00.000Z'), lte: new Date('2026-10-17T23:59:59.999Z') },
        mesa: { restauranteId: 'rest-1' },
      })
      expect(prisma.sesionMesa.count.mock.calls[0][0].where).toMatchObject({ estado: 'cerrada', mesa: { restauranteId: 'rest-1' } })
    })

    it('sin rango toma el día actual: el rango contiene el momento de la consulta', async () => {
      // Arrange
      prisma.pedidoItem.findMany.mockResolvedValue([])
      prisma.sesionMesa.count.mockResolvedValue(0)
      prisma.$queryRaw.mockResolvedValue([])
      const ahora = Date.now()

      // Act
      await service.ventasHoy('rest-1')

      // Assert
      const { gte, lte } = prisma.pedidoItem.findMany.mock.calls[0][0].where.pedido.createdAt
      expect(gte.getTime()).toBeLessThanOrEqual(ahora)
      expect(lte.getTime()).toBeGreaterThanOrEqual(ahora)
      expect(lte.getTime() - gte.getTime()).toBe(24 * 60 * 60 * 1000 - 1)
    })
  })

  describe('reportes con SQL', () => {
    it('ventasPorHora convierte la hora (bigint) y el total a números', async () => {
      // Arrange
      prisma.$queryRaw.mockResolvedValue([
        { hora: BigInt(12), total: '15300.5' },
        { hora: BigInt(21), total: '980.004' },
      ])

      // Act
      const porHora = await service.ventasPorHora('rest-1', DESDE, HASTA)

      // Assert
      expect(porHora).toEqual([
        { hora: 12, total: 15300.5 },
        { hora: 21, total: 980 },
      ])
      expect(valoresDelQuery(prisma)).toEqual(['rest-1', new Date('2026-10-01T00:00:00.000Z'), new Date('2026-10-17T23:59:59.999Z')])
    })

    it('topItems mapea las columnas, respeta el límite y conserva la categoría (o null)', async () => {
      // Arrange
      prisma.$queryRaw.mockResolvedValue([
        { item_id: 'i1', nombre: 'Milanesa', cantidad: BigInt(14), total: '58800', categoria_id: 'c1', categoria_nombre: 'Principales' },
        { item_id: 'i2', nombre: 'Agua', cantidad: BigInt(9), total: '9000', categoria_id: null, categoria_nombre: null },
      ])

      // Act
      const top = await service.topItems('rest-1', 2, DESDE, HASTA)

      // Assert
      expect(top).toEqual([
        { itemId: 'i1', nombre: 'Milanesa', cantidad: 14, total: 58800, categoriaId: 'c1', categoriaNombre: 'Principales' },
        { itemId: 'i2', nombre: 'Agua', cantidad: 9, total: 9000, categoriaId: null, categoriaNombre: null },
      ])
      expect(valoresDelQuery(prisma)).toEqual(['rest-1', expect.any(Date), expect.any(Date), 2])
    })

    it('ventasPorDia devuelve fecha, total y pedidos por día', async () => {
      // Arrange
      prisma.$queryRaw.mockResolvedValue([{ fecha: '2026-10-16', total: '120000.999', pedidos: 31 }])

      // Act
      const porDia = await service.ventasPorDia('rest-1', DESDE, HASTA)

      // Assert
      expect(porDia).toEqual([{ fecha: '2026-10-16', total: 120001, pedidos: 31 }])
    })
  })
})
