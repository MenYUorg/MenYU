import { UnauthorizedException } from '@nestjs/common'
import { HistorialRootService } from './historial-root.service'
import { EntradaHistorial } from './registrar-historial'

const ROOT = { sub: 'root-1', tipo: 'admin', rol: 'ROOT', email: 'email-viejo-del-token@ejemplo.com' } as const

describe('HistorialRootService', () => {
  const servicio = new HistorialRootService()

  describe('actorDe', () => {
    it('devuelve la cuenta ROOT con el email que tiene AHORA en la base, no el que dice el token', async () => {
      // Arrange
      const tx = { admin: { findUnique: jest.fn().mockResolvedValue({ id: 'root-1', email: 'ana@ejemplo.com', rol: 'ROOT' }) } }

      // Act
      const actor = await servicio.actorDe(tx as never, ROOT)

      // Assert
      expect(actor).toEqual({ tipo: 'ROOT', id: 'root-1', nombre: 'ana@ejemplo.com' })
      expect(tx.admin.findUnique).toHaveBeenCalledWith({ where: { id: 'root-1' }, select: { id: true, email: true, rol: true } })
    })

    it('si la cuenta ya no existe (se retiró y el token sigue vigente), responde 401', async () => {
      const tx = { admin: { findUnique: jest.fn().mockResolvedValue(null) } }

      await expect(servicio.actorDe(tx as never, ROOT)).rejects.toThrow(UnauthorizedException)
    })

    it.each(['OWNER', 'GERENTE'])('si la cuenta dejó de ser ROOT (ahora es %s), responde 401', async (rol) => {
      const tx = { admin: { findUnique: jest.fn().mockResolvedValue({ id: 'root-1', email: 'ana@ejemplo.com', rol }) } }

      await expect(servicio.actorDe(tx as never, ROOT)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('registrar', () => {
    const entrada: EntradaHistorial = {
      actor: { tipo: 'ROOT', id: 'root-1', nombre: 'ana@ejemplo.com' },
      accion: 'ROOT_CREAR',
      entidad: { tipo: 'ROOT', id: 'root-2', nombre: 'bruno@ejemplo.com' },
      cambios: [{ campo: 'Email', antes: null, despues: 'bruno@ejemplo.com' }],
    }

    it('escribe con el cliente de la transacción que recibe', async () => {
      // Arrange
      const tx = { historialRoot: { create: jest.fn().mockResolvedValue({ id: 1 }) } }

      // Act
      await servicio.registrar(tx as never, entrada)

      // Assert
      expect(tx.historialRoot.create).toHaveBeenCalledTimes(1)
      expect(tx.historialRoot.create.mock.calls[0][0].data).toMatchObject({ accion: 'ROOT_CREAR', entidadId: 'root-2' })
    })

    it('si no puede escribir, el error sale', async () => {
      const tx = { historialRoot: { create: jest.fn().mockRejectedValue(new Error('sin espacio')) } }

      await expect(servicio.registrar(tx as never, entrada)).rejects.toThrow('sin espacio')
    })
  })

  it('solo expone actorDe y registrar: no hay forma de modificar ni borrar desde el servicio', () => {
    const metodos = Object.getOwnPropertyNames(HistorialRootService.prototype).filter((n) => n !== 'constructor').sort()

    expect(metodos).toEqual(['actorDe', 'registrar'])
  })
})
