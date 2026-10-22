import * as request from 'supertest'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PrismaService } from '../prisma/prisma.service'
import { HealthController } from './health.controller'
import { HealthService } from './health.service'

// Caracterización de GET /health con la base caída (SCRUM-16): el controller y el service son los reales y
// solo se reemplaza PrismaService. Fija lo que hace hoy: 200 con "degraded", no 503 (ver health.controller.ts).
describe('GET /health con la base caída', () => {
  let app: INestApplication
  const prisma = { $queryRaw: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, { provide: PrismaService, useValue: prisma }],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('responde 200 con status "degraded" y db "error"', async () => {
    // Arrange
    prisma.$queryRaw.mockRejectedValue(new Error('connect ECONNREFUSED'))

    // Act
    const res = await request(app.getHttpServer()).get('/health')

    // Assert
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'degraded', db: 'error' })
  })
})
