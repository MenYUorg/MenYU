import { ForbiddenException } from '@nestjs/common'
import { GERENTE, OWNER, PrismaMock, comoPrisma, crearPrismaMock, ownerDeLaMarca, ownerDeOtraMarca } from '../test/prisma-mock'
import { assertStaffAccess } from './assert-staff-access'

describe('assertStaffAccess', () => {
  let prisma: PrismaMock

  beforeEach(() => {
    prisma = crearPrismaMock()
  })

  it('un mozo opera sobre su restaurante sin consultar la base', async () => {
    // Act
    const acceso = assertStaffAccess(comoPrisma(prisma), 'rest-1', { sub: 'mozo-1', tipo: 'mozo', restauranteId: 'rest-1' })

    // Assert
    await expect(acceso).resolves.toBeUndefined()
    expect(prisma.admin.findUnique).not.toHaveBeenCalled()
  })

  it('un mozo de otro restaurante recibe 403', async () => {
    // Act
    const acceso = assertStaffAccess(comoPrisma(prisma), 'rest-1', { sub: 'mozo-1', tipo: 'mozo', restauranteId: 'rest-2' })

    // Assert
    await expect(acceso).rejects.toThrow(new ForbiddenException('No tenés acceso a este restaurante'))
  })

  it('un OWNER de la marca del restaurante tiene acceso', async () => {
    // Arrange
    ownerDeLaMarca(prisma)

    // Act
    const acceso = assertStaffAccess(comoPrisma(prisma), 'rest-1', OWNER)

    // Assert
    await expect(acceso).resolves.toBeUndefined()
  })

  it('un OWNER de otra marca recibe 403', async () => {
    // Arrange
    ownerDeOtraMarca(prisma)

    // Act
    const acceso = assertStaffAccess(comoPrisma(prisma), 'rest-1', OWNER)

    // Assert
    await expect(acceso).rejects.toThrow(ForbiddenException)
  })

  it('un GERENTE tiene acceso solo si está asignado al restaurante', async () => {
    // Arrange
    prisma.adminRestaurante.findUnique.mockResolvedValueOnce({ adminId: GERENTE.sub }).mockResolvedValueOnce(null)

    // Act
    const asignado = assertStaffAccess(comoPrisma(prisma), 'rest-1', GERENTE)
    const sinAsignar = assertStaffAccess(comoPrisma(prisma), 'rest-2', GERENTE)

    // Assert
    await expect(asignado).resolves.toBeUndefined()
    await expect(sinAsignar).rejects.toThrow(ForbiddenException)
  })

  it('un JWT de comensal recibe 403', async () => {
    // Act
    const acceso = assertStaffAccess(comoPrisma(prisma), 'rest-1', { sub: 'cliente-1', tipo: 'cliente' })

    // Assert
    await expect(acceso).rejects.toThrow(ForbiddenException)
  })
})
