import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import { CUENTAS } from '../../test/acceso-de-test'
import { PrismaMock, comoPrisma, crearPrismaMock } from '../../test/prisma-mock'
import { HistorialRootService } from './historial-root.service'
import { EntradaHistorial } from './registrar-historial'

// El email de la sesión es el que leyó SupabaseAuthGuard al empezar el pedido; el de la base puede haber cambiado.
const ROOT = { ...CUENTAS.ROOT, email: 'email-viejo-de-la-sesion@ejemplo.com' }

// Una fila como la devolvería la base, con campos de más (que el servicio no tiene que dejar pasar).
const fila = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  createdAt: new Date('2026-10-16T14:20:00.000Z'),
  actorTipo: 'ROOT',
  actorNombre: 'ana@ejemplo.com',
  accion: 'DUENO_CREAR',
  entidadTipo: 'OWNER',
  entidadId: 'owner-1',
  entidadNombre: 'juan@laparrilla.com',
  marcaId: 'marca-1',
  marcaNombre: 'La Parrilla',
  detalle: [{ campo: 'Email', antes: null, despues: 'juan@laparrilla.com' }],
  actorId: 'root-1',
  ...extra,
})

describe('HistorialRootService', () => {
  let prisma: PrismaMock
  let servicio: HistorialRootService

  beforeEach(() => {
    prisma = crearPrismaMock()
    servicio = new HistorialRootService(comoPrisma(prisma))
  })

  describe('actorDe', () => {
    const cuentaEnLaBase = (cambios: Record<string, unknown> = {}) => ({ id: ROOT.id, email: 'ana@ejemplo.com', esRoot: true, activo: true, ...cambios })

    it('devuelve el Usuario ROOT con el email que tiene AHORA en la base, no el de la sesión', async () => {
      // Arrange
      const tx = { usuario: { findUnique: jest.fn().mockResolvedValue(cuentaEnLaBase()) } }

      // Act
      const actor = await servicio.actorDe(tx as never, ROOT)

      // Assert
      expect(actor).toEqual({ tipo: 'ROOT', id: ROOT.id, nombre: 'ana@ejemplo.com' })
      expect(tx.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: ROOT.id },
        select: { id: true, email: true, esRoot: true, activo: true },
      })
    })

    it.each([
      ['ya no existe', null],
      ['dejó de ser ROOT', cuentaEnLaBase({ esRoot: false })],
      ['está desactivada', cuentaEnLaBase({ activo: false })],
    ])('si la cuenta %s mientras el pedido estaba en curso, responde 401', async (_caso, cuenta) => {
      const tx = { usuario: { findUnique: jest.fn().mockResolvedValue(cuenta) } }

      await expect(servicio.actorDe(tx as never, ROOT)).rejects.toThrow(new UnauthorizedException('Tu cuenta ROOT ya no existe'))
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
      expect(prisma.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si no puede escribir, el error sale', async () => {
      const tx = { historialRoot: { create: jest.fn().mockRejectedValue(new Error('sin espacio')) } }

      await expect(servicio.registrar(tx as never, entrada)).rejects.toThrow('sin espacio')
    })
  })

  describe('listar', () => {
    const consulta = () => prisma.historialRoot.findMany.mock.calls[0][0]

    beforeEach(() => prisma.historialRoot.findMany.mockResolvedValue([]))

    it('sin filtros: de lo más nuevo a lo más viejo, pidiendo una fila de más para saber si hay otra página', async () => {
      await servicio.listar({})

      expect(consulta().where).toEqual({})
      expect(consulta().orderBy).toEqual({ id: 'desc' })
      expect(consulta().take).toBe(51)
    })

    it('pide solo las columnas del historial, sin el id de la cuenta que actuó, y sin include', async () => {
      await servicio.listar({})

      expect(Object.keys(consulta().select).sort()).toEqual(
        ['accion', 'actorNombre', 'actorTipo', 'createdAt', 'detalle', 'entidadId', 'entidadNombre', 'entidadTipo', 'id', 'marcaId', 'marcaNombre'],
      )
      expect(consulta()).not.toHaveProperty('include')
    })

    it('devuelve exactamente las claves del item y los cambios del detalle', async () => {
      // Arrange
      prisma.historialRoot.findMany.mockResolvedValue([fila(7)])

      // Act
      const { items, siguiente } = await servicio.listar({})

      // Assert
      expect(siguiente).toBeNull()
      expect(Object.keys(items[0]).sort()).toEqual(
        ['accion', 'actorNombre', 'actorTipo', 'cambios', 'cuando', 'entidadId', 'entidadNombre', 'entidadTipo', 'id', 'marcaId', 'marcaNombre'],
      )
      expect(items[0]).toMatchObject({
        id: 7,
        cuando: '2026-10-16T14:20:00.000Z',
        actorTipo: 'ROOT',
        actorNombre: 'ana@ejemplo.com',
        accion: 'DUENO_CREAR',
        entidadTipo: 'OWNER',
        marcaNombre: 'La Parrilla',
        cambios: [{ campo: 'Email', antes: null, despues: 'juan@laparrilla.com' }],
      })
      expect(JSON.stringify(items)).not.toContain('root-1') // el id de la cuenta que actuó no sale
    })

    it('un detalle mal formado no rompe la lista: queda sin cambios o sin los renglones rotos', async () => {
      // Arrange
      prisma.historialRoot.findMany.mockResolvedValue([
        fila(3, { detalle: null }),
        fila(2, { detalle: 'texto' }),
        fila(1, { detalle: [{ campo: 'Estado', antes: 'Activa', despues: 'De baja' }, { sinCampo: true }, 7, null, { campo: 'X', antes: 5, despues: undefined }] }),
      ])

      // Act
      const { items } = await servicio.listar({})

      // Assert
      expect(items[0].cambios).toEqual([])
      expect(items[1].cambios).toEqual([])
      expect(items[2].cambios).toEqual([
        { campo: 'Estado', antes: 'Activa', despues: 'De baja' },
        { campo: 'X', antes: null, despues: null },
      ])
    })

    it('las acciones del script se ven como SCRIPT, con el usuario del sistema como nombre', async () => {
      prisma.historialRoot.findMany.mockResolvedValue([fila(4, { actorTipo: 'SCRIPT', actorNombre: 'marga', actorId: null })])

      const { items } = await servicio.listar({})

      expect(items[0]).toMatchObject({ actorTipo: 'SCRIPT', actorNombre: 'marga' })
    })

    describe('páginas de a 50 con cursor', () => {
      const filas = (cantidad: number, desde: number) => Array.from({ length: cantidad }, (_, i) => fila(desde - i))

      it('con 51 filas devuelve 50 y el id de la última como `siguiente`', async () => {
        prisma.historialRoot.findMany.mockResolvedValue(filas(51, 200))

        const { items, siguiente } = await servicio.listar({})

        expect(items).toHaveLength(50)
        expect(items[0].id).toBe(200)
        expect(items[49].id).toBe(151)
        expect(siguiente).toBe(151)
      })

      it('con exactamente 50 filas es la última página: siguiente null', async () => {
        prisma.historialRoot.findMany.mockResolvedValue(filas(50, 50))

        const { items, siguiente } = await servicio.listar({})

        expect(items).toHaveLength(50)
        expect(siguiente).toBeNull()
      })

      it('con menos de 50 filas, siguiente null; sin filas, lista vacía', async () => {
        prisma.historialRoot.findMany.mockResolvedValueOnce(filas(3, 3)).mockResolvedValueOnce([])

        expect((await servicio.listar({})).siguiente).toBeNull()
        expect(await servicio.listar({})).toEqual({ items: [], siguiente: null })
      })

      it('el cursor pide las filas con id menor (las siguientes, más viejas)', async () => {
        await servicio.listar({ cursor: 151 })

        expect(consulta().where).toEqual({ id: { lt: 151 } })
      })
    })

    describe('filtros', () => {
      it('actor: el email de una cuenta ROOT, sin distinguir mayúsculas y como texto literal', async () => {
        await servicio.listar({ actor: 'Ana_Perez@Ejemplo.com' })

        expect(consulta().where).toEqual({
          actorTipo: 'ROOT',
          actorNombre: { equals: 'Ana\\_Perez@Ejemplo.com', mode: 'insensitive' },
        })
      })

      it.each(['script', 'SCRIPT', 'Script'])('actor %s: las acciones del script, sea quien sea el operador', async (actor) => {
        await servicio.listar({ actor })

        expect(consulta().where).toEqual({ actorTipo: 'SCRIPT' })
      })

      it.each(['MARCA', 'RESTAURANTE', 'OWNER', 'ROOT'] as const)('entidad %s', async (entidad) => {
        await servicio.listar({ entidad })

        expect(consulta().where).toEqual({ entidadTipo: entidad })
      })

      it('desde y hasta son días completos en hora de Buenos Aires (UTC-3), con los dos días incluidos', async () => {
        await servicio.listar({ desde: '2026-10-15', hasta: '2026-10-16' })

        const { gte, lte } = consulta().where.createdAt
        expect(gte.toISOString()).toBe('2026-10-15T03:00:00.000Z') // 00:00 en Buenos Aires
        expect(lte.toISOString()).toBe('2026-10-17T02:59:59.999Z') // 23:59:59.999 en Buenos Aires
      })

      it('solo desde, o solo hasta', async () => {
        await servicio.listar({ desde: '2026-10-15' })
        await servicio.listar({ hasta: '2026-10-15' })

        expect(Object.keys(prisma.historialRoot.findMany.mock.calls[0][0].where.createdAt)).toEqual(['gte'])
        expect(Object.keys(prisma.historialRoot.findMany.mock.calls[1][0].where.createdAt)).toEqual(['lte'])
      })

      it('un mismo día en desde y hasta es ese día entero', async () => {
        await servicio.listar({ desde: '2026-10-15', hasta: '2026-10-15' })

        const { gte, lte } = consulta().where.createdAt
        expect(lte.getTime() - gte.getTime()).toBe(24 * 3600 * 1000 - 1)
      })

      it.each(['2026-02-31', '2026-13-01', '2026-00-10', '2025-02-29', '2026-04-31'])('la fecha que no existe %s responde 400', async (dia) => {
        await expect(servicio.listar({ desde: dia })).rejects.toThrow(BadRequestException)
        await expect(servicio.listar({ hasta: dia })).rejects.toThrow(/no es una fecha que exista/)
        expect(prisma.historialRoot.findMany).not.toHaveBeenCalled()
      })

      it('29 de febrero de un año bisiesto sí existe', async () => {
        await expect(servicio.listar({ desde: '2028-02-29' })).resolves.toBeDefined()
      })

      it('desde posterior a hasta responde 400', async () => {
        await expect(servicio.listar({ desde: '2026-10-16', hasta: '2026-10-15' })).rejects.toThrow('desde no puede ser posterior a hasta')
        expect(prisma.historialRoot.findMany).not.toHaveBeenCalled()
      })

      it('los filtros se combinan', async () => {
        await servicio.listar({ actor: 'script', entidad: 'ROOT', desde: '2026-10-15', cursor: 90 })

        expect(consulta().where).toMatchObject({ actorTipo: 'SCRIPT', entidadTipo: 'ROOT', id: { lt: 90 } })
        expect(consulta().where.createdAt).toHaveProperty('gte')
      })
    })
  })

  it('solo expone actorDe, registrar y listar: no hay forma de modificar ni borrar desde el servicio', () => {
    const metodos = Object.getOwnPropertyNames(HistorialRootService.prototype).filter((n) => n !== 'constructor').sort()

    expect(metodos).toEqual(['actorDe', 'listar', 'registrar'])
  })
})
