import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaMock, comoPrisma, crearPrismaMock } from '../test/prisma-mock'
import { ComensalesService } from './comensales.service'

const SESION = 'sesion-1'
const ANA = { id: 'com-ana', sesionId: SESION, nombre: 'Ana', creadoPorComensalId: null }
const BETO = { id: 'com-beto', sesionId: SESION, nombre: 'Beto', creadoPorComensalId: 'com-ana' }
const ITEM_DE_LA_SESION = { id: 'pi-1', pedido: { sesionId: SESION } }

describe('ComensalesService', () => {
  let prisma: PrismaMock
  let service: ComensalesService

  /** Con un pago aprobado la sesión queda "congelada": la cuenta ya empezó a pagarse. */
  const congelada = (si: boolean) => prisma.pago.findFirst.mockResolvedValue(si ? { id: 'pago-1' } : null)

  /** prisma.comensal.findUnique por id, sobre los comensales dados. */
  const comensalesEnLaBase = (...comensales: object[]) =>
    prisma.comensal.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(comensales.find((c) => (c as { id: string }).id === where.id) ?? null),
    )

  beforeEach(() => {
    prisma = crearPrismaMock()
    service = new ComensalesService(comoPrisma(prisma))
    congelada(false)
  })

  describe('crearComensal', () => {
    beforeEach(() => {
      prisma.sesionMesa.findUnique.mockResolvedValue({ id: SESION, estado: 'activa' })
    })

    it('crea al comensal con el nombre normalizado (sin espacios y en minúsculas) para detectar repetidos', async () => {
      // Arrange
      prisma.comensal.create.mockImplementation(({ data }) => Promise.resolve({ id: 'com-1', ...data }))

      // Act
      await service.crearComensal(SESION, { nombre: '  Ana María ' })

      // Assert
      expect(prisma.comensal.create).toHaveBeenCalledWith({
        data: { sesionId: SESION, nombre: '  Ana María ', nombreNormalizado: 'ana maría', esOwner: false, creadoPorComensalId: null },
      })
    })

    it('un nombre repetido en la sesión (clave única P2002) responde 409', async () => {
      // Arrange
      prisma.comensal.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
      )

      // Act
      const alta = service.crearComensal(SESION, { nombre: 'Ana' })

      // Assert
      await expect(alta).rejects.toThrow(new ConflictException('Ya existe un comensal con ese nombre en esta sesión'))
    })

    it('cualquier otro error de la base se propaga tal cual', async () => {
      // Arrange
      const caida = new Error('conexión perdida')
      prisma.comensal.create.mockRejectedValue(caida)

      // Act
      const alta = service.crearComensal(SESION, { nombre: 'Ana' })

      // Assert
      await expect(alta).rejects.toBe(caida)
    })

    it('una sesión que no existe responde 404 y una que no está activa, 400', async () => {
      // Arrange
      prisma.sesionMesa.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: SESION, estado: 'cerrada' })

      // Act
      const inexistente = service.crearComensal(SESION, { nombre: 'Ana' })
      const cerrada = service.crearComensal(SESION, { nombre: 'Ana' })

      // Assert
      await expect(inexistente).rejects.toThrow(NotFoundException)
      await expect(cerrada).rejects.toThrow(new BadRequestException('La sesión no está activa'))
      expect(prisma.comensal.create).not.toHaveBeenCalled()
    })

    it('si la cuenta ya empezó a pagarse responde 409 y explica cómo recuperar el nombre', async () => {
      // Arrange
      congelada(true)

      // Act
      const alta = service.crearComensal(SESION, { nombre: 'Ana' })

      // Assert
      await expect(alta).rejects.toThrow(/podés recuperar tu nombre con el PIN/)
      expect(prisma.comensal.create).not.toHaveBeenCalled()
    })

    it('solo puede haber un comensal owner por sesión', async () => {
      // Arrange
      prisma.comensal.findFirst.mockResolvedValue({ id: 'com-owner', esOwner: true })

      // Act
      const alta = service.crearComensal(SESION, { nombre: 'Ana', esOwner: true })

      // Assert
      await expect(alta).rejects.toThrow(new BadRequestException('La sesión ya tiene un comensal owner'))
    })

    it('el primer owner se crea con esOwner y quién lo creó', async () => {
      // Arrange
      prisma.comensal.findFirst.mockResolvedValue(null)
      prisma.comensal.create.mockResolvedValue({ id: 'com-1' })

      // Act
      await service.crearComensal(SESION, { nombre: 'Ana', esOwner: true, creadoPorComensalId: 'com-x' })

      // Assert
      expect(prisma.comensal.create.mock.calls[0][0].data).toMatchObject({ esOwner: true, creadoPorComensalId: 'com-x' })
    })
  })

  describe('borrarComensal', () => {
    it('quien creó a un comensal puede borrarlo: se borran sus etiquetas y el comensal', async () => {
      // Arrange
      comensalesEnLaBase(ANA, BETO)

      // Act
      const resultado = await service.borrarComensal(SESION, 'com-beto', 'com-ana')

      // Assert
      expect(resultado).toEqual({ id: 'com-beto' })
      expect(prisma.itemComensal.deleteMany).toHaveBeenCalledWith({ where: { comensalId: 'com-beto' } })
      expect(prisma.comensal.delete).toHaveBeenCalledWith({ where: { id: 'com-beto' } })
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    it('otro comensal que no lo creó recibe 403', async () => {
      // Arrange
      const carla = { id: 'com-carla', sesionId: SESION, creadoPorComensalId: null }
      comensalesEnLaBase(ANA, BETO, carla)

      // Act
      const baja = service.borrarComensal(SESION, 'com-beto', 'com-carla')

      // Assert
      await expect(baja).rejects.toThrow(new ForbiddenException('Solo quien creó a este comensal puede borrarlo'))
      expect(prisma.comensal.delete).not.toHaveBeenCalled()
    })

    it('un comensal que se registró solo no se borra desde acá (400)', async () => {
      // Arrange
      comensalesEnLaBase(ANA, BETO)

      // Act
      const baja = service.borrarComensal(SESION, 'com-ana', 'com-beto')

      // Assert
      await expect(baja).rejects.toThrow(BadRequestException)
    })

    it('un comensal de otra sesión responde 404', async () => {
      // Arrange
      comensalesEnLaBase({ ...BETO, sesionId: 'otra-sesion' }, ANA)

      // Act
      const baja = service.borrarComensal(SESION, 'com-beto', 'com-ana')

      // Assert
      await expect(baja).rejects.toThrow(new NotFoundException('Comensal no encontrado en esta sesión'))
    })

    it('con la sesión congelada responde 409 sin buscar al comensal', async () => {
      // Arrange
      congelada(true)

      // Act
      const baja = service.borrarComensal(SESION, 'com-beto', 'com-ana')

      // Assert
      await expect(baja).rejects.toThrow(ConflictException)
      expect(prisma.comensal.findUnique).not.toHaveBeenCalled()
    })
  })

  describe('reclamarComensal', () => {
    const sesionConPin = (estado = 'activa') =>
      prisma.sesionMesa.findUnique.mockResolvedValue({ id: SESION, estado, mesa: { pin: '1234' } })

    it('con el PIN de la mesa y un nombre existente (sin importar mayúsculas) devuelve el comensal', async () => {
      // Arrange
      sesionConPin()
      prisma.comensal.findUnique.mockResolvedValue(ANA)

      // Act
      const comensal = await service.reclamarComensal(SESION, { nombre: ' ANA ', pin: '1234' })

      // Assert
      expect(comensal).toEqual(ANA)
      expect(prisma.comensal.findUnique).toHaveBeenCalledWith({
        where: { sesionId_nombreNormalizado: { sesionId: SESION, nombreNormalizado: 'ana' } },
      })
    })

    it.each([
      ['el PIN es incorrecto', () => sesionConPin(), '9999'],
      ['la sesión no está activa', () => sesionConPin('cerrada'), '1234'],
      ['la sesión no existe', () => undefined, '1234'],
    ])('si %s responde el mismo 404 genérico (no revela qué falló)', async (_caso, preparar, pin) => {
      // Arrange
      preparar()

      // Act
      const reclamo = service.reclamarComensal(SESION, { nombre: 'Ana', pin })

      // Assert
      await expect(reclamo).rejects.toThrow(new NotFoundException('PIN incorrecto o el comensal no existe en esta sesión'))
    })

    it('con un nombre que no existe responde el mismo 404 genérico', async () => {
      // Arrange
      sesionConPin()
      prisma.comensal.findUnique.mockResolvedValue(null)

      // Act
      const reclamo = service.reclamarComensal(SESION, { nombre: 'Zoe', pin: '1234' })

      // Assert
      await expect(reclamo).rejects.toThrow('PIN incorrecto o el comensal no existe en esta sesión')
    })
  })

  describe('etiquetas de ítems', () => {
    beforeEach(() => {
      comensalesEnLaBase(ANA)
      prisma.pedidoItem.findUnique.mockResolvedValue(ITEM_DE_LA_SESION)
    })

    it('etiquetarItem asigna el ítem al comensal (upsert idempotente)', async () => {
      // Arrange
      prisma.itemComensal.upsert.mockResolvedValue({ pedidoItemId: 'pi-1', comensalId: 'com-ana' })

      // Act
      await service.etiquetarItem(SESION, { pedidoItemId: 'pi-1', comensalId: 'com-ana' })

      // Assert
      expect(prisma.itemComensal.upsert).toHaveBeenCalledWith({
        where: { pedidoItemId_comensalId: { pedidoItemId: 'pi-1', comensalId: 'com-ana' } },
        create: { pedidoItemId: 'pi-1', comensalId: 'com-ana' },
        update: {},
      })
    })

    it('con la sesión congelada solo se etiquetan ítems huérfanos (sin ninguna etiqueta)', async () => {
      // Arrange
      congelada(true)
      prisma.itemComensal.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2)

      // Act
      await service.etiquetarItem(SESION, { pedidoItemId: 'pi-1', comensalId: 'com-ana' })
      const conEtiquetas = service.etiquetarItem(SESION, { pedidoItemId: 'pi-1', comensalId: 'com-ana' })

      // Assert
      await expect(conEtiquetas).rejects.toThrow(ConflictException)
      expect(prisma.itemComensal.upsert).toHaveBeenCalledTimes(1)
    })

    it('un ítem de otra sesión responde 404', async () => {
      // Arrange
      prisma.pedidoItem.findUnique.mockResolvedValue({ id: 'pi-9', pedido: { sesionId: 'otra' } })

      // Act
      const etiqueta = service.etiquetarItem(SESION, { pedidoItemId: 'pi-9', comensalId: 'com-ana' })

      // Assert
      await expect(etiqueta).rejects.toThrow(new NotFoundException('Ítem no encontrado en esta sesión'))
    })

    it('desetiquetarItem borra la asignación existente', async () => {
      // Arrange
      prisma.itemComensal.findUnique.mockResolvedValue({ pedidoItemId: 'pi-1', comensalId: 'com-ana' })

      // Act
      await service.desetiquetarItem(SESION, 'pi-1', 'com-ana')

      // Assert
      expect(prisma.itemComensal.delete).toHaveBeenCalledWith({
        where: { pedidoItemId_comensalId: { pedidoItemId: 'pi-1', comensalId: 'com-ana' } },
      })
    })

    it('desetiquetarItem de una asignación que no existe responde 404', async () => {
      // Arrange
      prisma.itemComensal.findUnique.mockResolvedValue(null)

      // Act
      const baja = service.desetiquetarItem(SESION, 'pi-1', 'com-ana')

      // Assert
      await expect(baja).rejects.toThrow(new NotFoundException('La asignación no existe'))
      expect(prisma.itemComensal.delete).not.toHaveBeenCalled()
    })

    it('desetiquetarItem con la sesión congelada responde 409', async () => {
      // Arrange
      congelada(true)

      // Act
      const baja = service.desetiquetarItem(SESION, 'pi-1', 'com-ana')

      // Assert
      await expect(baja).rejects.toThrow(new ConflictException('La sesión está congelada; no se pueden quitar etiquetas'))
      expect(prisma.itemComensal.delete).not.toHaveBeenCalled()
    })

    it('listarEtiquetasDeItem devuelve las etiquetas con el comensal', async () => {
      // Arrange
      prisma.itemComensal.findMany.mockResolvedValue([{ comensal: ANA }])

      // Act
      const etiquetas = await service.listarEtiquetasDeItem(SESION, 'pi-1')

      // Assert
      expect(etiquetas).toEqual([{ comensal: ANA }])
      expect(prisma.itemComensal.findMany).toHaveBeenCalledWith({ where: { pedidoItemId: 'pi-1' }, include: { comensal: true } })
    })
  })

  it('listarComensales ordena por fecha de alta', async () => {
    // Arrange
    prisma.comensal.findMany.mockResolvedValue([ANA, BETO])

    // Act
    const comensales = await service.listarComensales(SESION)

    // Assert
    expect(comensales).toEqual([ANA, BETO])
    expect(prisma.comensal.findMany).toHaveBeenCalledWith({ where: { sesionId: SESION }, orderBy: { createdAt: 'asc' } })
  })
})
