import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { accesoDeTest, CUENTAS, MUNDO } from '../test/acceso-de-test'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { CAJA_SELECT } from './caja.select'
import { CajasService, MENSAJE_CAJA_ABIERTA, MENSAJE_NOMBRE_REPETIDO } from './cajas.service'
import { MENSAJE_OPERACION_SIMULTANEA } from './conflictos'

const REST = MUNDO.REST_1
const CAJA = { id: 'caja-1', restauranteId: REST, nombre: 'Principal', activa: true, createdAt: new Date('2026-11-10T12:00:00Z') }

/** El P2002 del único (restaurante_id, nombre) de Caja, como lo arma Prisma 6.19.3 con el adapter de pg. */
const nombreRepetido = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { modelName: 'Caja', target: ['restaurante_id', 'nombre'] },
  })
const operacionSimultanea = () =>
  new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict', { code: 'P2034', clientVersion: 'test' })

describe('CajasService', () => {
  let prisma: PrismaMock
  let service: CajasService

  beforeEach(() => {
    prisma = crearPrismaMock()
    service = new CajasService(comoPrisma(prisma), accesoDeTest())
    prisma.caja.findUnique.mockResolvedValue({ restauranteId: REST })
    prisma.caja.update.mockImplementation(async ({ data }) => ({ ...CAJA, ...data }))
    prisma.turnoCaja.findFirst.mockResolvedValue(null)
  })

  it('listar: todas las cajas del restaurante, activas e inactivas, por nombre', async () => {
    prisma.caja.findMany.mockResolvedValue([CAJA])

    await expect(service.listar(REST)).resolves.toEqual([CAJA])
    expect(prisma.caja.findMany).toHaveBeenCalledWith({ where: { restauranteId: REST }, orderBy: { nombre: 'asc' }, select: CAJA_SELECT })
  })

  describe('crear', () => {
    it('crea la caja en el restaurante del body', async () => {
      prisma.caja.create.mockResolvedValue(CAJA)

      await expect(service.crear({ restauranteId: REST, nombre: 'Principal' })).resolves.toEqual(CAJA)
      expect(prisma.caja.create).toHaveBeenCalledWith({ data: { restauranteId: REST, nombre: 'Principal' }, select: CAJA_SELECT })
    })

    it('un nombre repetido (P2002 del único de Caja) es 409', async () => {
      prisma.caja.create.mockRejectedValue(nombreRepetido())

      const error = await service.crear({ restauranteId: REST, nombre: 'Principal' }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ConflictException)
      expect((error as Error).message).toBe(MENSAJE_NOMBRE_REPETIDO)
    })

    it('un P2002 de otro único no se disfraza de nombre repetido', async () => {
      const otro = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { modelName: 'Caja', target: ['id'] },
      })
      prisma.caja.create.mockRejectedValue(otro)

      await expect(service.crear({ restauranteId: REST, nombre: 'Principal' })).rejects.toBe(otro)
    })
  })

  describe('actualizar', () => {
    it('sin nombre ni activa es 400, sin tocar la base', async () => {
      await expect(service.actualizar('caja-1', {}, CUENTAS.OWNER_A)).rejects.toThrow(BadRequestException)
      expect(prisma.caja.findUnique).not.toHaveBeenCalled()
    })

    it('una caja que no existe es 404', async () => {
      prisma.caja.findUnique.mockResolvedValue(null)

      await expect(service.actualizar('caja-x', { nombre: 'Otra' }, CUENTAS.OWNER_A)).rejects.toThrow(NotFoundException)
    })

    it.each([
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
      ['el MOZO', CUENTAS.MOZO],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
    ])('%s recibe 403 y no se escribe nada', async (_caso, cuenta) => {
      await expect(service.actualizar('caja-1', { activa: false }, cuenta)).rejects.toThrow(ForbiddenException)
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(prisma.caja.update).not.toHaveBeenCalled()
    })

    it('renombrar no mira las aperturas', async () => {
      await expect(service.actualizar('caja-1', { nombre: 'Barra' }, CUENTAS.GERENTE)).resolves.toMatchObject({ nombre: 'Barra' })
      expect(prisma.turnoCaja.findFirst).not.toHaveBeenCalled()
      expect(prisma.caja.update).toHaveBeenCalledWith({
        where: { id: 'caja-1' },
        data: { nombre: 'Barra', activa: undefined },
        select: CAJA_SELECT,
      })
    })

    it('activar no mira las aperturas', async () => {
      await expect(service.actualizar('caja-1', { activa: true }, CUENTAS.OWNER_A)).resolves.toMatchObject({ activa: true })
      expect(prisma.turnoCaja.findFirst).not.toHaveBeenCalled()
    })

    it('desactivar sin una apertura abierta: busca la apertura dentro de una transacción serializable y desactiva', async () => {
      await expect(service.actualizar('caja-1', { activa: false }, CUENTAS.OWNER_A)).resolves.toMatchObject({ activa: false })
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
      expect(prisma.turnoCaja.findFirst).toHaveBeenCalledWith({ where: { cajaId: 'caja-1', cerradoEn: null }, select: { id: true } })
      expect(prisma.caja.update).toHaveBeenCalledWith(expect.objectContaining({ data: { nombre: undefined, activa: false } }))
    })

    it('desactivar una caja con una apertura abierta es 409 y no se desactiva', async () => {
      prisma.turnoCaja.findFirst.mockResolvedValue({ id: 'apertura-1' })

      const error = await service.actualizar('caja-1', { activa: false }, CUENTAS.GERENTE).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ConflictException)
      expect((error as Error).message).toBe(MENSAJE_CAJA_ABIERTA)
      expect(prisma.caja.update).not.toHaveBeenCalled()
    })

    it('renombrar a un nombre que ya existe es 409', async () => {
      prisma.caja.update.mockRejectedValue(nombreRepetido())

      const error = await service.actualizar('caja-1', { nombre: 'Barra' }, CUENTAS.OWNER_A).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ConflictException)
      expect((error as Error).message).toBe(MENSAJE_NOMBRE_REPETIDO)
    })

    it('un P2034 que sobrevive al reintento es el 409 genérico', async () => {
      prisma.$transaction.mockRejectedValue(operacionSimultanea())

      const error = await service.actualizar('caja-1', { activa: false }, CUENTAS.OWNER_A).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ConflictException)
      expect((error as Error).message).toBe(MENSAJE_OPERACION_SIMULTANEA)
      expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    })

    it('un P2034 que el reintento resuelve no llega a la respuesta', async () => {
      prisma.$transaction.mockRejectedValueOnce(operacionSimultanea())

      await expect(service.actualizar('caja-1', { activa: false }, CUENTAS.OWNER_A)).resolves.toMatchObject({ activa: false })
      expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    })
  })
})
