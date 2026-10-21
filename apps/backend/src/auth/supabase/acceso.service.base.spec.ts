import { randomUUID } from 'crypto'
import { Prisma, PrismaClient, Rol } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaService } from '../../prisma/prisma.service'
import { AccesoService } from './acceso.service'
import { UsuarioAutenticado } from './usuario-autenticado'

/**
 * AccesoService contra un PostgreSQL de verdad: que las consultas de la baja efectiva digan lo que tienen que decir
 * (acceso.service.spec.ts prueba qué se pregunta, con mocks). Necesita una base con las migraciones aplicadas; si no hay
 * (el CI no tiene una), se salta solo. Para correrlo:
 *
 *   TEST_DATABASE_URL=postgresql://menyu:menyu@localhost:5433/menyu pnpm --filter @menyu/api test acceso.service.base
 *
 * Cada test corre en una transacción que se revierte al final: no deja filas. Solo acepta una base local.
 */
const URL_DE_PRUEBA = process.env.TEST_DATABASE_URL

if (URL_DE_PRUEBA && !['localhost', '127.0.0.1', '::1'].includes(new URL(URL_DE_PRUEBA).hostname)) {
  throw new Error('TEST_DATABASE_URL tiene que apuntar a una base local: este test no se corre contra staging ni producción.')
}

const describeConBase = URL_DE_PRUEBA ? describe : describe.skip

class Revertir extends Error {}

/** Las filas de cada test: marca A activa con un restaurante activo y otro de baja; marca B de baja con uno activo. */
interface Mundo {
  tx: Prisma.TransactionClient
  acceso: AccesoService
  marcaA: string
  marcaB: string
  restA1: string
  restA2DeBaja: string
  restB1: string
  usuario(membresias: Array<{ rol: Rol; marcaId?: string; restauranteId?: string }>): Promise<UsuarioAutenticado>
}

describeConBase('AccesoService contra la base: la baja efectiva', () => {
  let pool: Pool
  let prisma: PrismaClient

  beforeAll(() => {
    pool = new Pool({ connectionString: URL_DE_PRUEBA })
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await pool.end()
  })

  async function enUnMundo(prueba: (mundo: Mundo) => Promise<void>): Promise<void> {
    await prisma
      .$transaction(async (tx) => {
        const sufijo = randomUUID()
        const marcaA = (await tx.marca.create({ data: { nombre: 'Marca A', slug: `a-${sufijo}` } })).id
        const marcaB = (await tx.marca.create({ data: { nombre: 'Marca B', slug: `b-${sufijo}`, activo: false } })).id
        const restA1 = (await tx.restaurante.create({ data: { marcaId: marcaA, nombre: 'A1' } })).id
        const restA2DeBaja = (await tx.restaurante.create({ data: { marcaId: marcaA, nombre: 'A2', activo: false } })).id
        const restB1 = (await tx.restaurante.create({ data: { marcaId: marcaB, nombre: 'B1' } })).id

        const usuario: Mundo['usuario'] = async (membresias) => {
          const fila = await tx.usuario.create({
            data: {
              supabaseUserId: randomUUID(),
              email: `${randomUUID()}@prueba.test`,
              nombre: 'Prueba',
              membresias: { create: membresias },
            },
          })
          return { id: fila.id, supabaseUserId: fila.supabaseUserId, email: fila.email, nombre: fila.nombre, esRoot: false }
        }

        const acceso = new AccesoService(tx as unknown as PrismaService)
        await prueba({ tx, acceso, marcaA, marcaB, restA1, restA2DeBaja, restB1, usuario })
        throw new Revertir()
      })
      .catch((e) => {
        if (!(e instanceof Revertir)) throw e
      })
  }

  it('el OWNER tiene su rol solo en los restaurantes activos de sus marcas activas', () =>
    enUnMundo(async ({ acceso, marcaA, marcaB, restA1, restA2DeBaja, restB1, usuario }) => {
      const owner = await usuario([
        { rol: 'OWNER', marcaId: marcaA },
        { rol: 'OWNER', marcaId: marcaB },
      ])

      expect(await acceso.rolesEnRestaurante(owner.id, restA1)).toEqual(['OWNER'])
      expect(await acceso.rolesEnRestaurante(owner.id, restA2DeBaja)).toEqual([])
      expect(await acceso.rolesEnRestaurante(owner.id, restB1)).toEqual([])
      expect(await acceso.esOwnerDeMarca(owner.id, marcaA)).toBe(true)
      expect(await acceso.esOwnerDeMarca(owner.id, marcaB)).toBe(false)
      expect(await acceso.restaurantesDe(owner.id)).toEqual([restA1])
    }))

  it('el GERENTE pierde el rol si dan de baja su restaurante o la marca, y lo recupera al reactivarlos', () =>
    enUnMundo(async ({ tx, acceso, marcaB, restA1, restB1, usuario }) => {
      const gerente = await usuario([
        { rol: 'GERENTE', restauranteId: restA1 },
        { rol: 'GERENTE', restauranteId: restB1 },
      ])

      expect(await acceso.rolesEnRestaurante(gerente.id, restA1)).toEqual(['GERENTE'])
      expect(await acceso.rolesEnRestaurante(gerente.id, restB1)).toEqual([])
      expect(await acceso.restaurantesDe(gerente.id, ['GERENTE'])).toEqual([restA1])

      await tx.marca.update({ where: { id: marcaB }, data: { activo: true } })
      await tx.restaurante.update({ where: { id: restA1 }, data: { activo: false } })

      expect(await acceso.rolesEnRestaurante(gerente.id, restA1)).toEqual([])
      expect(await acceso.rolesEnRestaurante(gerente.id, restB1)).toEqual(['GERENTE'])
      expect(await acceso.restaurantesDe(gerente.id)).toEqual([restB1])
    }))

  it('restaurantesDe filtra por rol: el OWNER de una marca que es MOZO en otra', () =>
    enUnMundo(async ({ tx, acceso, marcaA, marcaB, restA1, restB1, usuario }) => {
      await tx.marca.update({ where: { id: marcaB }, data: { activo: true } })
      const persona = await usuario([
        { rol: 'OWNER', marcaId: marcaA },
        { rol: 'MOZO', restauranteId: restB1 },
      ])

      expect(await acceso.restaurantesDe(persona.id)).toEqual([restA1, restB1])
      expect(await acceso.restaurantesDe(persona.id, ['OWNER', 'GERENTE'])).toEqual([restA1])
      expect(await acceso.restaurantesDe(persona.id, ['MOZO'])).toEqual([restB1])
    }))

  it('tieneAlgunRol cuenta solo las membresías de marcas activas y de restaurantes disponibles', () =>
    enUnMundo(async ({ tx, acceso, marcaA, marcaB, restA1, restA2DeBaja, restB1, usuario }) => {
      const ownerDeBaja = await usuario([{ rol: 'OWNER', marcaId: marcaB }])
      const gerenteDeBaja = await usuario([
        { rol: 'GERENTE', restauranteId: restA2DeBaja },
        { rol: 'GERENTE', restauranteId: restB1 },
      ])
      const ownerSinRestaurantes = await usuario([{ rol: 'OWNER', marcaId: marcaA }])
      const mozo = await usuario([{ rol: 'MOZO', restauranteId: restA1 }])

      expect(await acceso.tieneAlgunRol(ownerDeBaja.id, ['OWNER', 'GERENTE'])).toBe(false)
      expect(await acceso.tieneAlgunRol(gerenteDeBaja.id, ['OWNER', 'GERENTE'])).toBe(false)
      expect(await acceso.tieneAlgunRol(mozo.id, ['OWNER', 'GERENTE'])).toBe(false)
      expect(await acceso.tieneAlgunRol(mozo.id, ['MOZO'])).toBe(true)

      await tx.restaurante.updateMany({ where: { marcaId: marcaA }, data: { activo: false } })

      expect(await acceso.tieneAlgunRol(ownerSinRestaurantes.id, ['OWNER'])).toBe(true)

      await tx.marca.update({ where: { id: marcaB }, data: { activo: true } })

      expect(await acceso.tieneAlgunRol(ownerDeBaja.id, ['OWNER'])).toBe(true)
      expect(await acceso.tieneAlgunRol(gerenteDeBaja.id, ['GERENTE'])).toBe(true)
    }))

  it('el perfil omite las membresías de marcas y restaurantes dados de baja y trae la marca de cada restaurante', () =>
    enUnMundo(async ({ acceso, marcaA, marcaB, restA1, restA2DeBaja, restB1, usuario }) => {
      const persona = await usuario([
        { rol: 'OWNER', marcaId: marcaA },
        { rol: 'OWNER', marcaId: marcaB },
        { rol: 'MOZO', restauranteId: restA2DeBaja },
        { rol: 'COCINA', restauranteId: restB1 },
      ])
      const otra = await usuario([{ rol: 'MOZO', restauranteId: restA1 }])

      const perfil = await acceso.perfil(persona)
      const perfilDeOtra = await acceso.perfil(otra)

      expect(perfil.membresias).toEqual([
        { id: expect.any(String), rol: 'OWNER', marca: { id: marcaA, nombre: 'Marca A', restaurantes: [{ id: restA1, nombre: 'A1' }] }, restaurante: null },
      ])
      expect(perfilDeOtra.membresias).toEqual([
        { id: expect.any(String), rol: 'MOZO', marca: null, restaurante: { id: restA1, nombre: 'A1', marcaId: marcaA, marca: { id: marcaA, nombre: 'Marca A' } } },
      ])
    }))

  it('mozoDe devuelve el Mozo activo del usuario en ese restaurante, y null si está inactivo o es de otro', () =>
    enUnMundo(async ({ tx, acceso, restA1, restB1, usuario }) => {
      const persona = await usuario([{ rol: 'MOZO', restauranteId: restA1 }])
      const mozo = await tx.mozo.create({ data: { restauranteId: restA1, nombre: 'Juan', usuarioId: persona.id } })

      expect(await acceso.mozoDe(persona.id, restA1)).toEqual({ id: mozo.id, nombre: 'Juan', esJefeSalon: false })
      expect(await acceso.mozoDe(persona.id, restB1)).toBeNull()

      await tx.mozo.update({ where: { id: mozo.id }, data: { activo: false } })

      expect(await acceso.mozoDe(persona.id, restA1)).toBeNull()
    }))
})
