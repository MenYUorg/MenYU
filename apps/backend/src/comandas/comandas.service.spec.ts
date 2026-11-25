import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { MENSAJE_OPERACION_SIMULTANEA } from '../caja/conflictos'
import { accesoDeTest, CUENTAS, MUNDO } from '../test/acceso-de-test'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { COMANDA_SELECT } from './comanda.select'
import { ComandasService, MENSAJE_NOMBRE_REPETIDO, mensajeConPlatosAsignados } from './comandas.service'

const REST = MUNDO.REST_1
const COMANDA = { id: 'com-1', restauranteId: REST, nombre: 'Cocina', activa: true }

/** El P2002 del único (restaurante_id, nombre) de Comanda, como lo arma Prisma 6.19.3 con el adapter de pg. */
const nombreRepetido = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { modelName: 'Comanda', target: ['restaurante_id', 'nombre'] },
  })
const operacionSimultanea = () =>
  new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict', { code: 'P2034', clientVersion: 'test' })

describe('ComandasService', () => {
  let prisma: PrismaMock
  let service: ComandasService

  beforeEach(() => {
    prisma = crearPrismaMock()
    service = new ComandasService(comoPrisma(prisma), accesoDeTest())
    prisma.comanda.findUnique.mockResolvedValue({ restauranteId: REST })
    prisma.comanda.update.mockImplementation(async ({ data }) => ({
      ...COMANDA,
      ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
    }))
    prisma.itemMenu.count.mockResolvedValue(0)
  })

  it('listar: todas las comandas del restaurante, activas e inactivas, por nombre', async () => {
    prisma.comanda.findMany.mockResolvedValue([COMANDA])

    await expect(service.listar(REST)).resolves.toEqual([COMANDA])
    expect(prisma.comanda.findMany).toHaveBeenCalledWith({ where: { restauranteId: REST }, orderBy: { nombre: 'asc' }, select: COMANDA_SELECT })
  })

  describe('mensajeConPlatosAsignados', () => {
    it('en singular con 1 plato', () => {
      expect(mensajeConPlatosAsignados(1)).toBe('La comanda tiene 1 plato asignado: cambialo de comanda antes de desactivarla')
    })

    it('en plural con 2 o más', () => {
      expect(mensajeConPlatosAsignados(2)).toBe('La comanda tiene 2 platos asignados: cambialos de comanda antes de desactivarla')
      expect(mensajeConPlatosAsignados(12)).toBe('La comanda tiene 12 platos asignados: cambialos de comanda antes de desactivarla')
    })
  })

  describe('crear', () => {
    // El recorte de los espacios lo hace el DTO (TextoObligatorio), con el ValidationPipe: se prueba en
    // comandas-endpoints.spec.ts ("  Barra  " llega a Prisma como "Barra"). Acá el service pasa el nombre tal cual.
    it('crea la comanda en el restaurante del body', async () => {
      prisma.comanda.create.mockResolvedValue(COMANDA)

      await expect(service.crear({ restauranteId: REST, nombre: 'Cocina' })).resolves.toEqual(COMANDA)
      expect(prisma.comanda.create).toHaveBeenCalledWith({ data: { restauranteId: REST, nombre: 'Cocina' }, select: COMANDA_SELECT })
    })

    it('un nombre repetido (P2002 del único de Comanda) es 409', async () => {
      prisma.comanda.create.mockRejectedValue(nombreRepetido())

      const error = await service.crear({ restauranteId: REST, nombre: 'Cocina' }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ConflictException)
      expect((error as Error).message).toBe(MENSAJE_NOMBRE_REPETIDO)
    })

    it('un P2002 de otro único no se disfraza de nombre repetido', async () => {
      const otro = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { modelName: 'Comanda', target: ['id'] },
      })
      prisma.comanda.create.mockRejectedValue(otro)

      await expect(service.crear({ restauranteId: REST, nombre: 'Cocina' })).rejects.toBe(otro)
    })
  })

  describe('actualizar', () => {
    it('sin nombre ni activa es 400, sin tocar la base', async () => {
      await expect(service.actualizar('com-1', {}, CUENTAS.OWNER_A)).rejects.toThrow(BadRequestException)
      expect(prisma.comanda.findUnique).not.toHaveBeenCalled()
    })

    it('una comanda que no existe es 404', async () => {
      prisma.comanda.findUnique.mockResolvedValue(null)

      await expect(service.actualizar('com-x', { nombre: 'Otra' }, CUENTAS.OWNER_A)).rejects.toThrow(NotFoundException)
    })

    it.each([
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
      ['el MOZO', CUENTAS.MOZO],
      ['COCINA', CUENTAS.COCINA],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
    ])('%s recibe 403 y no se escribe nada', async (_caso, cuenta) => {
      await expect(service.actualizar('com-1', { activa: false }, cuenta)).rejects.toThrow(ForbiddenException)
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(prisma.comanda.update).not.toHaveBeenCalled()
    })

    it('renombrar no cuenta los platos', async () => {
      await expect(service.actualizar('com-1', { nombre: 'Barra' }, CUENTAS.GERENTE)).resolves.toMatchObject({ nombre: 'Barra' })
      expect(prisma.itemMenu.count).not.toHaveBeenCalled()
      expect(prisma.comanda.update).toHaveBeenCalledWith({
        where: { id: 'com-1' },
        data: { nombre: 'Barra', activa: undefined },
        select: COMANDA_SELECT,
      })
    })

    it('desactivar sin platos: los cuenta dentro de una transacción serializable y desactiva', async () => {
      await expect(service.actualizar('com-1', { activa: false }, CUENTAS.OWNER_A)).resolves.toMatchObject({ activa: false })
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
      expect(prisma.itemMenu.count).toHaveBeenCalledWith({ where: { comandaId: 'com-1' } })
      expect(prisma.comanda.update).toHaveBeenCalledWith(expect.objectContaining({ data: { nombre: undefined, activa: false } }))
    })

    it('desactivar con 1 plato asignado es 409, en singular, y no se desactiva', async () => {
      prisma.itemMenu.count.mockResolvedValue(1)

      const error = await service.actualizar('com-1', { activa: false }, CUENTAS.GERENTE).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ConflictException)
      expect((error as Error).message).toBe('La comanda tiene 1 plato asignado: cambialo de comanda antes de desactivarla')
      expect(prisma.comanda.update).not.toHaveBeenCalled()
    })

    it('desactivar con varios platos asignados es 409, en plural, y no se desactiva', async () => {
      prisma.itemMenu.count.mockResolvedValue(4)

      const error = await service.actualizar('com-1', { activa: false }, CUENTAS.OWNER_A).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ConflictException)
      expect((error as Error).message).toBe('La comanda tiene 4 platos asignados: cambialos de comanda antes de desactivarla')
      expect(prisma.comanda.update).not.toHaveBeenCalled()
    })

    it('reactivar siempre se puede: no cuenta los platos', async () => {
      prisma.itemMenu.count.mockResolvedValue(5)

      await expect(service.actualizar('com-1', { activa: true }, CUENTAS.OWNER_A)).resolves.toMatchObject({ activa: true })
      expect(prisma.itemMenu.count).not.toHaveBeenCalled()
      expect(prisma.comanda.update).toHaveBeenCalledWith(expect.objectContaining({ data: { nombre: undefined, activa: true } }))
    })

    it('renombrar a un nombre que ya existe (P2002 del único) es 409', async () => {
      prisma.comanda.update.mockRejectedValue(nombreRepetido())

      const error = await service.actualizar('com-1', { nombre: 'Barra' }, CUENTAS.OWNER_A).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ConflictException)
      expect((error as Error).message).toBe(MENSAJE_NOMBRE_REPETIDO)
    })

    it('un P2034 que sobrevive al reintento es el 409 genérico', async () => {
      prisma.$transaction.mockRejectedValue(operacionSimultanea())

      const error = await service.actualizar('com-1', { activa: false }, CUENTAS.OWNER_A).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ConflictException)
      expect((error as Error).message).toBe(MENSAJE_OPERACION_SIMULTANEA)
      expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    })
  })
})
