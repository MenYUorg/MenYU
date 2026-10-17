import { HttpException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { DivisionService } from '../comensales/division.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { SessionsService } from './sessions.service'

// Límite de intentos fallidos al entrar a una mesa: el PIN (4 dígitos) se cuenta por
// restaurante y el código de sesión (3 dígitos, modo seguro) por mesa.

const mockPrisma = {
  mesa: { findFirst: jest.fn(), update: jest.fn() },
  sesionMesa: { findFirst: jest.fn(), create: jest.fn() },
  sesionMesaCliente: { count: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
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

describe('SessionsService.open: límite de intentos fallidos', () => {
  let service: SessionsService

  beforeEach(async () => {
    jest.clearAllMocks()
    const module = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UsersService, useValue: { createCliente: jest.fn().mockResolvedValue({ id: 'invitado-1' }) } },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('jwt'), verify: jest.fn() } },
        { provide: MenyuGateway, useValue: {} },
        { provide: DivisionService, useValue: {} },
      ],
    }).compile()
    service = module.get(SessionsService)
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
})
