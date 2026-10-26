import { HttpException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { AccesoService } from '../auth/supabase/acceso.service'
import { CuentaDeClienteService } from '../auth/supabase/cuenta-de-cliente.service'
import { DivisionService } from '../comensales/division.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { PrismaService } from '../prisma/prisma.service'
import { SessionsService } from './sessions.service'

// Límite de intentos fallidos al entrar a una mesa: el PIN (4 dígitos) se cuenta por
// restaurante y el código de sesión (3 dígitos, modo seguro) por mesa.

const mockPrisma = {
  mesa: { findFirst: jest.fn(), update: jest.fn() },
  sesionMesa: { findFirst: jest.fn(), create: jest.fn() },
  sesionMesaCliente: { count: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
  cliente: { create: jest.fn() },
  $transaction: jest.fn((operaciones: Promise<unknown>[]) => Promise.all(operaciones)),
}

/** El código HTTP con el que falla la promesa (o null si se resuelve). */
async function estadoHttp(promesa: Promise<unknown>): Promise<number | null> {
  try {
    await promesa
    return null
  } catch (e) {
    return e instanceof HttpException ? e.getStatus() : -1
  }
}

const PIN_INCORRECTO = { restauranteId: 'rest-1', pin: '0000' }
const PIN_CORRECTO = { restauranteId: 'rest-1', pin: '1234' }
const MINUTO = 60_000

/** Mesas de la base: la 1 se encuentra por PIN; la A y la B por QR, en modo seguro y con sesión activa. */
const DISPONIBLE = { activo: true, marca: { activo: true } }
const MESAS: Record<string, object> = {
  'pin:1234': { id: 'mesa-1', numero: '1', restauranteId: 'rest-1', restaurante: { modoSesion: 'abierto', ...DISPONIBLE } },
  'qr:qr-A': { id: 'mesa-A', numero: 'A', restauranteId: 'rest-1', restaurante: { modoSesion: 'seguro', ...DISPONIBLE } },
  'qr:qr-B': { id: 'mesa-B', numero: 'B', restauranteId: 'rest-1', restaurante: { modoSesion: 'seguro', ...DISPONIBLE } },
}
const CODIGO_DE_LA_MESA: Record<string, string> = { 'mesa-A': '111', 'mesa-B': '222' }

function configurarBase() {
  mockPrisma.cliente.create.mockResolvedValue({ id: 'invitado-1' })
  mockPrisma.mesa.findFirst.mockImplementation(({ where }) =>
    Promise.resolve(MESAS[where.qrToken ? `qr:${where.qrToken}` : `pin:${where.pin}`] ?? null),
  )
  // La mesa 1 está libre; la A y la B tienen una sesión activa abierta por un comensal.
  mockPrisma.sesionMesa.findFirst.mockImplementation(({ where }) =>
    Promise.resolve(
      CODIGO_DE_LA_MESA[where.mesaId]
        ? { id: `sesion-${where.mesaId}`, clienteId: 'anfitrion', codigoSesion: CODIGO_DE_LA_MESA[where.mesaId] }
        : null,
    ),
  )
  mockPrisma.sesionMesa.create.mockResolvedValue({ id: 'sesion-nueva' })
  mockPrisma.mesa.update.mockResolvedValue({})
  mockPrisma.sesionMesaCliente.count.mockResolvedValue(1)
  mockPrisma.sesionMesaCliente.findUnique.mockResolvedValue(null)
  mockPrisma.sesionMesaCliente.create.mockResolvedValue({})
}

async function fallarPin(veces: number, servicio: SessionsService) {
  for (let i = 0; i < veces; i++) expect(await estadoHttp(servicio.open(PIN_INCORRECTO))).toBe(404)
}

describe('SessionsService.open: límite de intentos fallidos', () => {
  let service: SessionsService

  beforeEach(async () => {
    jest.clearAllMocks()
    const module = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('jwt'), verify: jest.fn() } },
        { provide: MenyuGateway, useValue: {} },
        { provide: DivisionService, useValue: {} },
        { provide: AccesoService, useValue: {} },
        { provide: CuentaDeClienteService, useValue: {} },
      ],
    }).compile()
    service = module.get(SessionsService)
    configurarBase()
    // Solo Date es falso: las promesas y el resto de los timers siguen reales.
    jest.useFakeTimers({
      now: new Date('2026-10-18T20:00:00.000Z'),
      doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'],
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('después de 10 PIN incorrectos en un restaurante, el intento 11 responde 429', async () => {
    // Arrange
    mockPrisma.mesa.findFirst.mockResolvedValue(null)
    for (let i = 0; i < 10; i++) await estadoHttp(service.open(PIN_INCORRECTO))

    // Act
    const estado = await estadoHttp(service.open(PIN_INCORRECTO))

    // Assert
    expect(estado).toBe(429)
  })

  describe('PIN, por restaurante (10 fallos en 10 min → 15 min de bloqueo)', () => {
    it('con 9 fallos, un PIN correcto sigue abriendo la sesión', async () => {
      // Arrange
      await fallarPin(9, service)

      // Act
      const sesion = await service.open(PIN_CORRECTO)

      // Assert
      expect(sesion.mesaId).toBe('mesa-1')
    })

    it('el 429 dice cuánto esperar y bloquea también al PIN correcto', async () => {
      // Arrange
      await fallarPin(10, service)

      // Act
      const intento = service.open(PIN_CORRECTO)

      // Assert
      await expect(intento).rejects.toThrow('Demasiados intentos fallidos. Probá de nuevo en 15 minutos.')
      expect(mockPrisma.mesa.findFirst).toHaveBeenCalledTimes(10) // bloqueado: ni busca la mesa
    })

    it('si la ventana de 10 minutos vence, el conteo vuelve a cero', async () => {
      // Arrange
      await fallarPin(9, service)
      jest.setSystemTime(Date.now() + 10 * MINUTO)

      // Act
      const estados = [await estadoHttp(service.open(PIN_INCORRECTO)), await estadoHttp(service.open(PIN_INCORRECTO))]

      // Assert
      expect(estados).toEqual([404, 404])
    })

    it('el bloqueo vence a los 15 minutos', async () => {
      // Arrange
      await fallarPin(10, service)
      jest.setSystemTime(Date.now() + 15 * MINUTO)

      // Act
      const sesion = await service.open(PIN_CORRECTO)

      // Assert
      expect(sesion.mesaId).toBe('mesa-1')
    })

    it('un acierto no reinicia el contador', async () => {
      // Arrange
      await fallarPin(9, service)
      await service.open(PIN_CORRECTO)
      await fallarPin(1, service) // décimo fallo

      // Act
      const estado = await estadoHttp(service.open(PIN_CORRECTO))

      // Assert
      expect(estado).toBe(429)
    })

    it('el bloqueo es de ese restaurante: otro restaurante sigue respondiendo normal', async () => {
      // Arrange
      await fallarPin(10, service)

      // Act
      const estado = await estadoHttp(service.open({ restauranteId: 'rest-2', pin: '0000' }))

      // Assert
      expect(estado).toBe(404)
    })

    it('el ingreso por QR no se bloquea aunque el PIN del restaurante esté bloqueado', async () => {
      // Arrange
      await fallarPin(10, service)

      // Act
      const sesion = await service.open({ tableCode: 'qr-A', codigoSesion: '111' })

      // Assert
      expect(sesion.mesaId).toBe('mesa-A')
    })
  })

  describe('código de sesión, por mesa (5 fallos en 10 min → 15 min de bloqueo)', () => {
    async function fallarCodigo(veces: number, tableCode: string) {
      for (let i = 0; i < veces; i++) {
        expect(await estadoHttp(service.open({ tableCode, codigoSesion: '999' }))).toBe(403)
      }
    }

    it('después de 5 códigos incorrectos en una mesa, el intento 6 responde 429 aunque el código sea correcto', async () => {
      // Arrange
      await fallarCodigo(5, 'qr-A')

      // Act
      const estado = await estadoHttp(service.open({ tableCode: 'qr-A', codigoSesion: '111' }))

      // Assert
      expect(estado).toBe(429)
    })

    it('con 4 fallos, el código correcto deja unirse a la sesión', async () => {
      // Arrange
      await fallarCodigo(4, 'qr-A')

      // Act
      const sesion = await service.open({ tableCode: 'qr-A', codigoSesion: '111' })

      // Assert
      expect(sesion.sesionId).toBe('sesion-mesa-A')
    })

    it('los fallos en la mesa A no bloquean la mesa B', async () => {
      // Arrange
      await fallarCodigo(5, 'qr-A')

      // Act
      const sesion = await service.open({ tableCode: 'qr-B', codigoSesion: '222' })

      // Assert
      expect(sesion.sesionId).toBe('sesion-mesa-B')
    })

    it('sin código no cuenta como fallo: sigue respondiendo 403 "requiere código"', async () => {
      // Arrange
      for (let i = 0; i < 6; i++) await estadoHttp(service.open({ tableCode: 'qr-A' }))

      // Act
      const intento = service.open({ tableCode: 'qr-A' })

      // Assert
      await expect(intento).rejects.toThrow('Esta mesa requiere código de sesión para unirse')
    })
  })
})
