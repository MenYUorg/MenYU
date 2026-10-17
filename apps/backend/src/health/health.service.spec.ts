import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Test } from '@nestjs/testing'
import { PrismaService } from '../prisma/prisma.service'
import { HealthController } from './health.controller'
import { DB_TIMEOUT_MS, HealthService, leerVersion } from './health.service'

const mockPrisma = { $queryRaw: jest.fn() }

async function crearServicio(): Promise<HealthService> {
  const moduleRef = await Test.createTestingModule({
    providers: [HealthService, { provide: PrismaService, useValue: mockPrisma }],
  }).compile()
  return moduleRef.get(HealthService)
}

describe('HealthService', () => {
  const envOriginal = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...envOriginal }
    delete process.env.APP_COMMIT_SHA
    delete process.env.RAILWAY_GIT_COMMIT_SHA
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  afterAll(() => {
    process.env = envOriginal
  })

  describe('estado de la base', () => {
    it('con la base arriba responde status "ok" y db "ok"', async () => {
      // Arrange
      mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }])
      const service = await crearServicio()

      // Act
      const res = await service.check()

      // Assert
      expect(res.status).toBe('ok')
      expect(res.db).toBe('ok')
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1)
    })

    it('con la base caída responde status "degraded" y db "error"', async () => {
      // Arrange
      mockPrisma.$queryRaw.mockRejectedValue(new Error('connect ECONNREFUSED'))
      const service = await crearServicio()

      // Act
      const res = await service.check()

      // Assert
      expect(res.status).toBe('degraded')
      expect(res.db).toBe('error')
    })

    it(`si la base no contesta en ${DB_TIMEOUT_MS} ms la da por caída`, async () => {
      // Arrange
      jest.useFakeTimers()
      mockPrisma.$queryRaw.mockReturnValue(new Promise(() => undefined))
      const service = await crearServicio()

      // Act
      const pendiente = service.check()
      await jest.advanceTimersByTimeAsync(DB_TIMEOUT_MS)
      const res = await pendiente

      // Assert
      expect(res.status).toBe('degraded')
      expect(res.db).toBe('error')
    })
  })

  describe('sha del commit', () => {
    beforeEach(() => {
      mockPrisma.$queryRaw.mockResolvedValue([])
    })

    it('usa APP_COMMIT_SHA aunque también esté RAILWAY_GIT_COMMIT_SHA', async () => {
      // Arrange
      process.env.APP_COMMIT_SHA = 'abc123'
      process.env.RAILWAY_GIT_COMMIT_SHA = 'def456'
      const service = await crearServicio()

      // Act
      const res = await service.check()

      // Assert
      expect(res.sha).toBe('abc123')
    })

    it('sin APP_COMMIT_SHA usa RAILWAY_GIT_COMMIT_SHA', async () => {
      // Arrange
      process.env.APP_COMMIT_SHA = ''
      process.env.RAILWAY_GIT_COMMIT_SHA = 'def456'
      const service = await crearServicio()

      // Act
      const res = await service.check()

      // Assert
      expect(res.sha).toBe('def456')
    })

    it('sin ninguna de las dos devuelve sha null', async () => {
      // Arrange
      const service = await crearServicio()

      // Act
      const res = await service.check()

      // Assert
      expect(res.sha).toBeNull()
    })
  })

  it('devuelve uptime en segundos enteros y la versión de package.json, sin otros campos', async () => {
    // Arrange
    mockPrisma.$queryRaw.mockResolvedValue([])
    jest.spyOn(process, 'uptime').mockReturnValue(42.9)
    const service = await crearServicio()

    // Act
    const res = await service.check()

    // Assert
    expect(res.uptime).toBe(42)
    expect(res.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(Object.keys(res).sort()).toEqual(['db', 'sha', 'status', 'uptime', 'version'])
  })
})

describe('leerVersion', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'health-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('devuelve la versión del package.json', () => {
    // Arrange
    const ruta = join(dir, 'package.json')
    writeFileSync(ruta, JSON.stringify({ version: '1.2.3' }))

    // Act
    const version = leerVersion(ruta)

    // Assert
    expect(version).toBe('1.2.3')
  })

  it('devuelve null si package.json no tiene version', () => {
    // Arrange
    const ruta = join(dir, 'package.json')
    writeFileSync(ruta, JSON.stringify({ name: 'x' }))

    // Act
    const version = leerVersion(ruta)

    // Assert
    expect(version).toBeNull()
  })

  it('devuelve null si el archivo no existe', () => {
    // Arrange
    const ruta = join(dir, 'no-existe.json')

    // Act
    const version = leerVersion(ruta)

    // Assert
    expect(version).toBeNull()
  })
})

describe('HealthController', () => {
  it('devuelve lo que arma HealthService', async () => {
    // Arrange
    const esperado = { status: 'ok', sha: 'abc123', db: 'ok', uptime: 1, version: '0.0.1' } as const
    const service = { check: jest.fn().mockResolvedValue(esperado) }
    const controller = new HealthController(service as unknown as HealthService)

    // Act
    const res = await controller.check()

    // Assert
    expect(res).toEqual(esperado)
  })
})
