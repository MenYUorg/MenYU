import { ForbiddenException } from '@nestjs/common'
import { RESTAURANTE_DISPONIBLE } from '../../common/restaurante-disponible'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../../test/prisma-mock'
import { AccesoService } from './acceso.service'
import { UsuarioAutenticado } from './usuario-autenticado'

// AccesoService contra el mock de Prisma (entrega 4.2 de docs/auth/specs/auth.md). Lo que dice la base
// lo prueba acceso.service.base.spec.ts; acá, qué se le pregunta y qué se hace con la respuesta.

const USUARIO: UsuarioAutenticado = {
  id: 'usuario-1',
  supabaseUserId: '6f1c2a40-2222-4a1b-9c3d-000000000001',
  email: 'ana@menyu.com',
  nombre: 'Ana',
  esRoot: false,
}

describe('AccesoService', () => {
  let prisma: PrismaMock
  let acceso: AccesoService

  beforeEach(() => {
    prisma = crearPrismaMock()
    acceso = new AccesoService(comoPrisma(prisma))
  })

  describe('rolesEnRestaurante', () => {
    it('busca el restaurante solo si está disponible (él y su marca activos): la baja efectiva', async () => {
      // Arrange
      prisma.restaurante.findFirst.mockResolvedValue(null)

      // Act
      const roles = await acceso.rolesEnRestaurante(USUARIO.id, 'rest-1')

      // Assert
      expect(roles).toEqual([])
      expect(prisma.restaurante.findFirst).toHaveBeenCalledWith({
        where: { id: 'rest-1', activo: true, marca: { activo: true } },
        select: { marcaId: true },
      })
      expect(prisma.membresia.findMany).not.toHaveBeenCalled()
    })

    it('con el restaurante disponible, cuenta su membresía en el restaurante y la de OWNER de la marca', async () => {
      // Arrange
      prisma.restaurante.findFirst.mockResolvedValue({ marcaId: 'marca-1' })
      prisma.membresia.findMany.mockResolvedValue([{ rol: 'OWNER' }, { rol: 'GERENTE' }])

      // Act
      const roles = await acceso.rolesEnRestaurante(USUARIO.id, 'rest-1')

      // Assert
      expect(roles).toEqual(['OWNER', 'GERENTE'])
      expect(prisma.membresia.findMany).toHaveBeenCalledWith({
        where: { usuarioId: USUARIO.id, OR: [{ restauranteId: 'rest-1' }, { rol: 'OWNER', marcaId: 'marca-1' }] },
        select: { rol: true },
      })
    })
  })

  describe('esOwnerDeMarca', () => {
    it.each([
      ['tiene la membresía OWNER de la marca activa', { id: 'm-1' }, true],
      ['no la tiene, o la marca está dada de baja', null, false],
    ])('%s: %s', async (_caso, membresia, esperado) => {
      // Arrange
      prisma.membresia.findFirst.mockResolvedValue(membresia)

      // Act
      const resultado = await acceso.esOwnerDeMarca(USUARIO.id, 'marca-1')

      // Assert
      expect(resultado).toBe(esperado)
      expect(prisma.membresia.findFirst).toHaveBeenCalledWith({
        where: { usuarioId: USUARIO.id, marcaId: 'marca-1', rol: 'OWNER', marca: { activo: true } },
        select: { id: true },
      })
    })
  })

  describe('exigirRol', () => {
    function conRoles(roles: string[]) {
      prisma.restaurante.findFirst.mockResolvedValue({ marcaId: 'marca-1' })
      prisma.membresia.findMany.mockResolvedValue(roles.map((rol) => ({ rol })))
    }

    it('con uno de los roles pedidos devuelve todos sus roles en el restaurante', async () => {
      // Arrange
      conRoles(['MOZO'])

      // Act
      const roles = await acceso.exigirRol(USUARIO.id, 'rest-1', ['GERENTE', 'MOZO'])

      // Assert
      expect(roles).toEqual(['MOZO'])
    })

    it('con un rol que no es de los pedidos: 403', async () => {
      // Arrange
      conRoles(['COCINA'])

      // Act + Assert
      await expect(acceso.exigirRol(USUARIO.id, 'rest-1', ['OWNER', 'GERENTE'])).rejects.toThrow(ForbiddenException)
    })

    it('sin roles ahí (o con el restaurante dado de baja): 403', async () => {
      // Arrange
      prisma.restaurante.findFirst.mockResolvedValue(null)

      // Act + Assert
      await expect(acceso.exigirRol(USUARIO.id, 'rest-1', ['OWNER'])).rejects.toThrow(ForbiddenException)
    })

    it('una lista de roles vacía no deja pasar a nadie', async () => {
      // Arrange
      conRoles(['OWNER'])

      // Act + Assert
      await expect(acceso.exigirRol(USUARIO.id, 'rest-1', [])).rejects.toThrow(ForbiddenException)
    })
  })

  describe('exigirOwnerDeMarca', () => {
    it('el OWNER de la marca pasa', async () => {
      // Arrange
      prisma.membresia.findFirst.mockResolvedValue({ id: 'm-1' })

      // Act + Assert
      await expect(acceso.exigirOwnerDeMarca(USUARIO.id, 'marca-1')).resolves.toBeUndefined()
    })

    it('quien no lo es: 403', async () => {
      // Arrange
      prisma.membresia.findFirst.mockResolvedValue(null)

      // Act + Assert
      await expect(acceso.exigirOwnerDeMarca(USUARIO.id, 'marca-1')).rejects.toThrow(ForbiddenException)
    })
  })

  describe('tieneAlgunRol y exigirAlgunRol', () => {
    const deRestaurante = (roles: string[]) => ({ rol: { in: roles }, restaurante: RESTAURANTE_DISPONIBLE })
    const deMarca = { rol: 'OWNER', marca: { activo: true } }

    it('con OWNER y GERENTE busca una membresía OWNER de una marca activa o de GERENTE en un restaurante disponible', async () => {
      // Arrange
      prisma.membresia.findFirst.mockResolvedValue({ id: 'm-1' })

      // Act
      const tiene = await acceso.tieneAlgunRol(USUARIO.id, ['OWNER', 'GERENTE'])

      // Assert
      expect(tiene).toBe(true)
      expect(prisma.membresia.findFirst).toHaveBeenCalledWith({
        where: { usuarioId: USUARIO.id, OR: [deRestaurante(['GERENTE']), deMarca] },
        select: { id: true },
      })
    })

    it.each([
      ['solo OWNER: solo las marcas', ['OWNER'], [deMarca]],
      ['sin OWNER: solo los restaurantes', ['MOZO', 'COCINA'], [deRestaurante(['MOZO', 'COCINA'])]],
    ])('%s', async (_caso, roles, alcance) => {
      // Arrange
      prisma.membresia.findFirst.mockResolvedValue(null)

      // Act
      const tiene = await acceso.tieneAlgunRol(USUARIO.id, roles as never)

      // Assert
      expect(tiene).toBe(false)
      expect(prisma.membresia.findFirst.mock.calls[0][0].where.OR).toEqual(alcance)
    })

    it('una lista de roles vacía no consulta y da false', async () => {
      // Act + Assert
      expect(await acceso.tieneAlgunRol(USUARIO.id, [])).toBe(false)
      expect(prisma.membresia.findFirst).not.toHaveBeenCalled()
    })

    it('exigirAlgunRol: pasa con una membresía y da 403 sin ninguna', async () => {
      // Arrange
      prisma.membresia.findFirst.mockResolvedValueOnce({ id: 'm-1' }).mockResolvedValueOnce(null)

      // Act + Assert
      await expect(acceso.exigirAlgunRol(USUARIO.id, ['OWNER'])).resolves.toBeUndefined()
      await expect(acceso.exigirAlgunRol(USUARIO.id, ['OWNER'])).rejects.toThrow(ForbiddenException)
    })
  })

  describe('mozoDe', () => {
    it('busca por la clave única (usuario, restaurante) y devuelve el mozo activo sin el campo activo', async () => {
      // Arrange
      prisma.mozo.findUnique.mockResolvedValue({ id: 'mozo-1', nombre: 'Juan', esJefeSalon: false, activo: true })

      // Act
      const mozo = await acceso.mozoDe(USUARIO.id, 'rest-1')

      // Assert
      expect(mozo).toEqual({ id: 'mozo-1', nombre: 'Juan', esJefeSalon: false })
      expect(prisma.mozo.findUnique).toHaveBeenCalledWith({
        where: { usuarioId_restauranteId: { usuarioId: USUARIO.id, restauranteId: 'rest-1' } },
        select: { id: true, nombre: true, esJefeSalon: true, activo: true },
      })
    })

    it.each([
      ['un mozo inactivo (le quitaron el acceso)', { id: 'mozo-1', nombre: 'Juan', esJefeSalon: false, activo: false }],
      ['ningún mozo', null],
    ])('con %s devuelve null', async (_caso, fila) => {
      // Arrange
      prisma.mozo.findUnique.mockResolvedValue(fila)

      // Act + Assert
      expect(await acceso.mozoDe(USUARIO.id, 'rest-1')).toBeNull()
    })
  })

  describe('exigirMozo', () => {
    it('devuelve el Mozo activo del usuario en el restaurante', async () => {
      // Arrange
      prisma.mozo.findUnique.mockResolvedValue({ id: 'mozo-1', nombre: 'Juan', esJefeSalon: true, activo: true })

      // Act + Assert
      expect(await acceso.exigirMozo(USUARIO.id, 'rest-1')).toEqual({ id: 'mozo-1', nombre: 'Juan', esJefeSalon: true })
    })

    it.each([
      ['inactivo', { id: 'mozo-1', nombre: 'Juan', esJefeSalon: false, activo: false }],
      ['que no existe', null],
    ])('con un Mozo %s: 403', async (_caso, fila) => {
      // Arrange
      prisma.mozo.findUnique.mockResolvedValue(fila)

      // Act + Assert
      await expect(acceso.exigirMozo(USUARIO.id, 'rest-1')).rejects.toThrow(
        new ForbiddenException('Tu perfil de mozo no está activo en este restaurante'),
      )
    })
  })

  describe('restaurantesDe', () => {
    const porMembresia = (roles: string[]) => ({ membresias: { some: { usuarioId: USUARIO.id, rol: { in: roles } } } })
    const porMarca = { marca: { membresias: { some: { usuarioId: USUARIO.id, rol: 'OWNER' } } } }

    it('sin roles, los de cualquier membresía y los de sus marcas, solo disponibles y por nombre', async () => {
      // Arrange
      prisma.restaurante.findMany.mockResolvedValue([{ id: 'rest-1' }, { id: 'rest-2' }])

      // Act
      const ids = await acceso.restaurantesDe(USUARIO.id)

      // Assert
      expect(ids).toEqual(['rest-1', 'rest-2'])
      expect(prisma.restaurante.findMany).toHaveBeenCalledWith({
        where: { ...RESTAURANTE_DISPONIBLE, OR: [porMembresia(['GERENTE', 'JEFE_SALON', 'MOZO', 'COCINA']), porMarca] },
        orderBy: { nombre: 'asc' },
        select: { id: true },
      })
    })

    it('con OWNER y GERENTE, los de sus marcas y los que gerencia', async () => {
      // Arrange
      prisma.restaurante.findMany.mockResolvedValue([])

      // Act
      await acceso.restaurantesDe(USUARIO.id, ['OWNER', 'GERENTE'])

      // Assert
      expect(prisma.restaurante.findMany.mock.calls[0][0].where.OR).toEqual([porMembresia(['GERENTE']), porMarca])
    })

    it('sin OWNER no mira las marcas', async () => {
      // Arrange
      prisma.restaurante.findMany.mockResolvedValue([])

      // Act
      await acceso.restaurantesDe(USUARIO.id, ['MOZO'])

      // Assert
      expect(prisma.restaurante.findMany.mock.calls[0][0].where.OR).toEqual([porMembresia(['MOZO'])])
    })

    it('solo OWNER: solo las marcas', async () => {
      // Arrange
      prisma.restaurante.findMany.mockResolvedValue([])

      // Act
      await acceso.restaurantesDe(USUARIO.id, ['OWNER'])

      // Assert
      expect(prisma.restaurante.findMany.mock.calls[0][0].where.OR).toEqual([porMarca])
    })

    it('una lista de roles vacía no consulta y no devuelve nada', async () => {
      // Act
      const ids = await acceso.restaurantesDe(USUARIO.id, [])

      // Assert
      expect(ids).toEqual([])
      expect(prisma.restaurante.findMany).not.toHaveBeenCalled()
    })
  })

  describe('perfil', () => {
    it('devuelve el usuario y sus membresías de marcas y restaurantes activos, con la marca de cada restaurante', async () => {
      // Arrange
      const membresias = [
        {
          id: 'm-1',
          rol: 'MOZO',
          marca: null,
          restaurante: { id: 'rest-1', nombre: 'Centro', marcaId: 'marca-1', marca: { id: 'marca-1', nombre: 'Marca' } },
        },
      ]
      prisma.membresia.findMany.mockResolvedValue(membresias)

      // Act
      const perfil = await acceso.perfil(USUARIO)

      // Assert
      expect(perfil).toEqual({ id: USUARIO.id, email: USUARIO.email, nombre: USUARIO.nombre, esRoot: false, membresias })
      const consulta = prisma.membresia.findMany.mock.calls[0][0]
      expect(consulta.where).toEqual({
        usuarioId: USUARIO.id,
        OR: [{ marca: { activo: true } }, { restaurante: RESTAURANTE_DISPONIBLE }],
      })
      expect(consulta.select.restaurante.select.marca).toEqual({ select: { id: true, nombre: true } })
      expect(consulta.select.marca.select.restaurantes.where).toEqual({ activo: true })
    })
  })
})
