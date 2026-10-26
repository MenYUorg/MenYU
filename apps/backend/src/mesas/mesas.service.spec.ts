import { Test } from '@nestjs/testing'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { MesasService } from './mesas.service'
import { PrismaService } from '../prisma/prisma.service'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { accesoDeTest, CUENTAS, MUNDO } from '../test/acceso-de-test'

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock_qr_image'),
}))

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn().mockReturnValue('nuevo-uuid-generado'),
  // Espía sobre el randomInt real: los tests pueden fijar el valor con mockReturnValueOnce.
  randomInt: jest.fn(jest.requireActual('crypto').randomInt),
}))

const OWNER = CUENTAS.OWNER_A
const GERENTE = CUENTAS.GERENTE
const REST = MUNDO.REST_1
const MESA = { id: 'mesa-1', numero: '1', qrToken: 'token-abc', estado: 'libre', restauranteId: REST, activo: true }

const mockPrisma = {
  mesa: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}

describe('MesasService', () => {
  let service: MesasService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MesasService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AccesoService, useValue: accesoDeTest() },
      ],
    }).compile()

    service = module.get(MesasService)
    jest.clearAllMocks()
  })

  // ── create ─────────────────────────────────────────────────────────────

  describe('create (el rol en el restaurante lo exige la ruta)', () => {
    it('crea la mesa con qrToken generado y devuelve imagen QR', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(null)
      mockPrisma.mesa.create.mockResolvedValue({ ...MESA, qrToken: 'nuevo-uuid-generado' })

      const result = await service.create({ numero: '1', restauranteId: REST })

      expect(mockPrisma.mesa.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ qrToken: 'nuevo-uuid-generado' }) }),
      )
      expect(result).toHaveProperty('qrImage', 'data:image/png;base64,mock_qr_image')
    })

    it('lanza 409 si el número de mesa ya existe en ese restaurante', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(MESA)

      await expect(service.create({ numero: '1', restauranteId: REST }))
        .rejects.toThrow(ConflictException)

      expect(mockPrisma.mesa.create).not.toHaveBeenCalled()
    })
  })

  // ── findAll ────────────────────────────────────────────────────────────

  describe('findAll (el rol en el restaurante lo exige la ruta)', () => {
    it('lista las mesas activas del restaurante con su QR', async () => {
      mockPrisma.mesa.findMany.mockResolvedValue([MESA])

      const result = await service.findAll(REST)

      expect(mockPrisma.mesa.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { restauranteId: REST, activo: true } }),
      )
      expect(result[0]).toHaveProperty('qrImage')
    })
  })

  // ── permisos de las rutas de una mesa ──────────────────────────────────

  describe('permisos de las rutas de una mesa (el rol en el restaurante de la mesa)', () => {
    const RUTAS: Array<[string, (u: UsuarioAutenticado) => Promise<unknown>]> = [
      ['findOne', (u) => service.findOne('mesa-1', u)],
      ['update', (u) => service.update('mesa-1', { estado: 'ocupada' }, u)],
      ['regenerarQr', (u) => service.regenerarQr('mesa-1', u)],
      ['cambiarPin', (u) => service.cambiarPin('mesa-1', '0420', u)],
    ]

    beforeEach(() => {
      mockPrisma.mesa.findUnique.mockResolvedValue(MESA)
      mockPrisma.mesa.findFirst.mockResolvedValue(null)
      mockPrisma.mesa.update.mockResolvedValue(MESA)
    })

    it.each(RUTAS)('%s: el OWNER de la marca y el GERENTE del restaurante pasan', async (_ruta, llamar) => {
      await llamar(OWNER)
      await llamar(GERENTE)
    })

    it.each(RUTAS)('%s: ROOT, el OWNER de otra marca, el MOZO y el JEFE_SALON reciben 403', async (_ruta, llamar) => {
      for (const cuenta of [CUENTAS.ROOT, CUENTAS.OWNER_B, CUENTAS.MOZO, CUENTAS.JEFE_SALON]) {
        await expect(llamar(cuenta)).rejects.toThrow(ForbiddenException)
      }
      expect(mockPrisma.mesa.update).not.toHaveBeenCalled()
    })

    it('el GERENTE de otro restaurante de la marca recibe 403', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue({ ...MESA, restauranteId: MUNDO.REST_2 })

      await expect(service.regenerarQr('mesa-1', GERENTE)).rejects.toThrow(ForbiddenException)
      await expect(service.regenerarQr('mesa-1', OWNER)).resolves.toBeDefined()
    })
  })

  // ── findOne ────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('devuelve la mesa con imagen QR', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(MESA)

      const result = await service.findOne('mesa-1', OWNER)

      expect(result).toMatchObject({ id: 'mesa-1', numero: '1' })
      expect(result).toHaveProperty('qrImage')
    })

    it('lanza 404 si la mesa no existe', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(null)

      await expect(service.findOne('no-existe', OWNER))
        .rejects.toThrow(NotFoundException)
    })

    it('lanza 404 si la mesa está inactiva', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue({ ...MESA, activo: false })

      await expect(service.findOne('mesa-1', OWNER))
        .rejects.toThrow(NotFoundException)
    })
  })

  // ── update ─────────────────────────────────────────────────────────────

  describe('update', () => {
    beforeEach(() => {
      mockPrisma.mesa.findUnique.mockResolvedValue(MESA)
    })

    it('actualiza el número y devuelve imagen QR actualizada', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(null)
      mockPrisma.mesa.update.mockResolvedValue({ ...MESA, numero: '2' })

      const result = await service.update('mesa-1', { numero: '2' }, OWNER)

      expect(mockPrisma.mesa.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { numero: '2' } }),
      )
      expect(result).toHaveProperty('qrImage')
    })

    it('lanza 409 si el nuevo número ya lo usa otra mesa del mismo restaurante', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue({ ...MESA, id: 'mesa-otra' })

      await expect(service.update('mesa-1', { numero: '2' }, OWNER))
        .rejects.toThrow(ConflictException)
    })

    it('actualiza el estado', async () => {
      mockPrisma.mesa.update.mockResolvedValue({ ...MESA, estado: 'ocupada' })

      const result = await service.update('mesa-1', { estado: 'ocupada' }, GERENTE)

      expect(result.estado).toBe('ocupada')
    })
  })

  // ── remove (solo el OWNER) ─────────────────────────────────────────────

  describe('remove', () => {
    it('el OWNER hace soft delete (activo: false)', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(MESA)
      mockPrisma.mesa.update.mockResolvedValue({ ...MESA, activo: false })

      await service.remove('mesa-1', OWNER)

      expect(mockPrisma.mesa.update).toHaveBeenCalledWith({
        where: { id: 'mesa-1' },
        data: { activo: false },
      })
    })

    it.each([
      ['el GERENTE', GERENTE],
      ['ROOT', CUENTAS.ROOT],
    ])('%s recibe 403 y la mesa no se toca', async (_caso, cuenta) => {
      mockPrisma.mesa.findUnique.mockResolvedValue(MESA)

      await expect(service.remove('mesa-1', cuenta)).rejects.toThrow(ForbiddenException)
      expect(mockPrisma.mesa.update).not.toHaveBeenCalled()
    })

    it('lanza 404 si la mesa no existe', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(null)

      await expect(service.remove('no-existe', OWNER))
        .rejects.toThrow(NotFoundException)
    })
  })

  // ── generatePin ────────────────────────────────────────────────────────

  describe('generatePin', () => {
    it('genera un string de exactamente 4 caracteres', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(null)
      const pin = await (service as any).generatePin(REST)
      expect(pin).toHaveLength(4)
    })

    it('el valor está entre "0001" y "9999"', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(null)
      const pin = await (service as any).generatePin(REST)
      const num = parseInt(pin, 10)
      expect(num).toBeGreaterThanOrEqual(1)
      expect(num).toBeLessThanOrEqual(9999)
    })

    it('tiene padding con ceros — "0001" no "1"', async () => {
      // randomInt(1, 10000) = 1 → padStart(4, '0') = '0001'
      ;(randomInt as unknown as jest.Mock).mockReturnValueOnce(1)
      mockPrisma.mesa.findFirst.mockResolvedValue(null)
      const pin = await (service as any).generatePin(REST)
      expect(pin).toBe('0001')
    })

    it('lanza ConflictException si todos los PINs están ocupados (100 colisiones seguidas)', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue({ id: 'mesa-existente' })
      await expect((service as any).generatePin(REST)).rejects.toThrow(ConflictException)
      expect(mockPrisma.mesa.findFirst).toHaveBeenCalledTimes(100)
    })
  })

  // ── PIN de la mesa: generador criptográfico (Sonar S2245) ──────────────
  // El PIN permite entrar a la sesión de una mesa: tiene que salir de un generador
  // criptográficamente seguro (crypto.randomInt), no de Math.random, que es predecible.

  describe('PIN de la mesa', () => {
    let mathRandom: jest.SpyInstance

    afterEach(() => {
      mathRandom?.mockRestore()
    })

    it('al crear la mesa, el PIN sale de crypto.randomInt (1 a 9999) y no de Math.random', async () => {
      // Arrange
      mockPrisma.mesa.findFirst.mockResolvedValue(null)
      mockPrisma.mesa.create.mockImplementation(({ data }) => Promise.resolve({ ...MESA, ...data }))
      ;(randomInt as unknown as jest.Mock).mockReturnValueOnce(42)
      mathRandom = jest.spyOn(Math, 'random')

      // Act
      const mesa = await service.create({ numero: '1', restauranteId: REST })

      // Assert
      expect(randomInt).toHaveBeenCalledWith(1, 10000)
      expect(mathRandom).not.toHaveBeenCalled()
      expect(mesa.pin).toBe('0042')
    })
  })

  // ── regenerarQr y cambiarPin ───────────────────────────────────────────

  describe('regenerarQr', () => {
    it('genera un nuevo token UUID y devuelve nueva imagen QR', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(MESA)
      mockPrisma.mesa.update.mockResolvedValue({ ...MESA, qrToken: 'nuevo-uuid-generado' })

      const result = await service.regenerarQr('mesa-1', OWNER)

      expect(mockPrisma.mesa.update).toHaveBeenCalledWith({
        where: { id: 'mesa-1' },
        data: { qrToken: 'nuevo-uuid-generado' },
      })
      expect(result).toHaveProperty('qrImage', 'data:image/png;base64,mock_qr_image')
      expect(result.qrToken).toBe('nuevo-uuid-generado')
    })
  })

  describe('cambiarPin', () => {
    it('con un PIN que ya usa otra mesa del restaurante responde 409', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(MESA)
      mockPrisma.mesa.findFirst.mockResolvedValue({ ...MESA, id: 'mesa-2' })

      await expect(service.cambiarPin('mesa-1', '0420', GERENTE)).rejects.toThrow(
        new ConflictException('El PIN 0420 ya está en uso en este restaurante'),
      )
      expect(mockPrisma.mesa.update).not.toHaveBeenCalled()
    })

    it('guarda el PIN nuevo', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(MESA)
      mockPrisma.mesa.findFirst.mockResolvedValue(null)
      mockPrisma.mesa.update.mockResolvedValue({ ...MESA, pin: '0420' })

      await service.cambiarPin('mesa-1', '0420', GERENTE)

      expect(mockPrisma.mesa.update).toHaveBeenCalledWith({ where: { id: 'mesa-1' }, data: { pin: '0420' } })
    })
  })
})
