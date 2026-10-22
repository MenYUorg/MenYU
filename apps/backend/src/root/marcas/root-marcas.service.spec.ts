import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaMock, comoPrisma } from '../../test/prisma-mock'
import { EMAIL_DEL_ROOT, ROOT_USER, armarTransaccionRoot, filasDelHistorial, serializar } from '../../test/root-mock'
import { HistorialRootService } from '../historial/historial-root.service'
import { MENSAJE_SLUG_EN_USO, RootMarcasService } from './root-marcas.service'

const errorDeClaveUnica = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })

// Filas como las devolvería la base, con campos de más que el servicio no tiene que dejar pasar.
const filaResumen = (extra: Record<string, unknown> = {}) => ({
  id: 'marca-1',
  nombre: 'La Parrilla',
  slug: 'la-parrilla',
  activo: true,
  restaurantes: [{ activo: true }, { activo: true }, { activo: false }],
  admins: [{ id: 'o1' }],
  logoUrl: 'https://logos/marca.png',
  ...extra,
})

const filaDetalle = (extra: Record<string, unknown> = {}) => ({
  id: 'marca-1',
  nombre: 'La Parrilla',
  slug: 'la-parrilla',
  activo: true,
  restaurantes: [
    { id: 'r1', nombre: 'Centro', direccion: 'Av. Colón 1200', activo: true, logoUrl: 'x', mpAccessToken: 'secreto-mp', modoSesion: 'abierto' },
    { id: 'r2', nombre: 'Villa Allende', direccion: null, activo: false },
  ],
  admins: [{ id: 'o1', email: 'juan@laparrilla.com', debeCambiarPassword: true, passwordHash: 'HASH-QUE-NO-DEBE-SALIR' }],
  ...extra,
})

describe('RootMarcasService', () => {
  let prisma: PrismaMock
  let tx: PrismaMock
  let servicio: RootMarcasService

  beforeEach(() => {
    ;({ prisma, tx } = armarTransaccionRoot())
    servicio = new RootMarcasService(comoPrisma(prisma), new HistorialRootService(comoPrisma(prisma)))
  })

  /** Nada se escribió con el cliente suelto: todo fue por la transacción. */
  const nadaPorFuera = () => {
    expect(prisma.marca.create).not.toHaveBeenCalled()
    expect(prisma.marca.update).not.toHaveBeenCalled()
    expect(prisma.historialRoot.create).not.toHaveBeenCalled()
  }

  /** La marca que encuentra la transacción: la consulta del detalle trae `restaurantes`, la de la edición no. */
  const marcaEnLaTransaccion = (base: Record<string, unknown>, detalle: Record<string, unknown> = filaDetalle()) =>
    tx.marca.findUnique.mockImplementation(({ select }: { select: Record<string, unknown> }) => Promise.resolve(select.restaurantes ? detalle : base))

  describe('listar', () => {
    it('por defecto solo las activas; con bajas=true, todas', async () => {
      prisma.marca.findMany.mockResolvedValue([])

      await servicio.listar({})
      await servicio.listar({ bajas: false })
      await servicio.listar({ bajas: true })

      expect(prisma.marca.findMany.mock.calls.map(([args]) => args.where)).toEqual([{ activo: true }, { activo: true }, {}])
    })

    it('usa un select explícito (sin include): identidad, estado y las cantidades; los dueños son solo las cuentas OWNER', async () => {
      prisma.marca.findMany.mockResolvedValue([])

      await servicio.listar({})

      const args = prisma.marca.findMany.mock.calls[0][0]
      expect(args).not.toHaveProperty('include')
      expect(args.select).toEqual({
        id: true,
        nombre: true,
        slug: true,
        activo: true,
        restaurantes: { select: { activo: true } },
        admins: { where: { rol: 'OWNER' }, select: { id: true } },
      })
      expect(args.orderBy).toEqual([{ nombre: 'asc' }, { id: 'asc' }])
    })

    it('devuelve exactamente id, nombre, slug, activo, restaurantes {activos, total} y duenos', async () => {
      prisma.marca.findMany.mockResolvedValue([filaResumen()])

      const [marca] = await servicio.listar({})

      expect(marca).toEqual({
        id: 'marca-1',
        nombre: 'La Parrilla',
        slug: 'la-parrilla',
        activo: true,
        restaurantes: { activos: 2, total: 3 },
        duenos: 1,
      })
      expect(Object.keys(marca).sort()).toEqual(['activo', 'duenos', 'id', 'nombre', 'restaurantes', 'slug'])
      expect(serializar(marca)).not.toContain('logos')
    })

    it('una marca sin restaurantes ni dueños figura con ceros ("Sin dueño")', async () => {
      prisma.marca.findMany.mockResolvedValue([filaResumen({ restaurantes: [], admins: [] })])

      const [marca] = await servicio.listar({})

      expect(marca.restaurantes).toEqual({ activos: 0, total: 0 })
      expect(marca.duenos).toBe(0)
    })
  })

  describe('detalle', () => {
    it('trae los datos, los restaurantes (con la dirección de solo lectura) y los dueños, y nada más', async () => {
      prisma.marca.findUnique.mockResolvedValue(filaDetalle())

      const detalle = await servicio.detalle('marca-1')

      expect(Object.keys(detalle).sort()).toEqual(['activo', 'duenos', 'id', 'nombre', 'restaurantes', 'slug'])
      expect(detalle.restaurantes.map((r) => Object.keys(r).sort())).toEqual([['activo', 'direccion', 'id', 'nombre'], ['activo', 'direccion', 'id', 'nombre']])
      expect(detalle.restaurantes[1].direccion).toBeNull()
      expect(detalle.duenos).toEqual([{ id: 'o1', email: 'juan@laparrilla.com', debeCambiarPassword: true }])
      const texto = serializar(detalle)
      expect(texto).not.toContain('HASH-QUE-NO-DEBE-SALIR')
      expect(texto).not.toContain('secreto-mp')
      expect(texto).not.toContain('modoSesion')
      expect(texto).not.toContain('logoUrl')
    })

    it('el select pide solo esas columnas y solo las cuentas OWNER (nunca mozos, mesas, menú ni columnas mp_*)', async () => {
      prisma.marca.findUnique.mockResolvedValue(filaDetalle())

      await servicio.detalle('m-001')

      const args = prisma.marca.findUnique.mock.calls[0][0]
      expect(args.where).toEqual({ id: 'm-001' })
      expect(args).not.toHaveProperty('include')
      expect(args.select.restaurantes.select).toEqual({ id: true, nombre: true, direccion: true, activo: true })
      expect(args.select.admins.where).toEqual({ rol: 'OWNER' })
      expect(args.select.admins.select).toEqual({ id: true, email: true, debeCambiarPassword: true })
      expect(Object.keys(args.select).sort()).toEqual(['activo', 'admins', 'id', 'nombre', 'restaurantes', 'slug'])
    })

    it('una marca que no existe responde 404', async () => {
      prisma.marca.findUnique.mockResolvedValue(null)

      await expect(servicio.detalle('no-existe')).rejects.toThrow(new NotFoundException('Marca no encontrada'))
    })

    it('también muestra una marca dada de baja', async () => {
      prisma.marca.findUnique.mockResolvedValue(filaDetalle({ activo: false }))

      expect((await servicio.detalle('marca-1')).activo).toBe(false)
    })
  })

  describe('crear', () => {
    beforeEach(() => {
      tx.marca.findFirst.mockResolvedValue(null) // el identificador está libre
      tx.marca.create.mockResolvedValue({ id: 'marca-nueva', nombre: 'La Parrilla', slug: 'la-parrilla' })
      tx.marca.findUnique.mockResolvedValue(filaDetalle({ id: 'marca-nueva', restaurantes: [], admins: [] }))
    })

    it('crea la marca (solo nombre e identificador) y devuelve su detalle', async () => {
      const marca = await servicio.crear({ nombre: 'La Parrilla', slug: 'la-parrilla' }, ROOT_USER)

      expect(tx.marca.create.mock.calls[0][0].data).toEqual({ nombre: 'La Parrilla', slug: 'la-parrilla' })
      expect(marca).toMatchObject({ id: 'marca-nueva', restaurantes: [], duenos: [] })
      nadaPorFuera()
    })

    it('deja EXACTAMENTE un registro MARCA_CREAR, con quién, qué y sobre qué', async () => {
      await servicio.crear({ nombre: 'La Parrilla', slug: 'la-parrilla' }, ROOT_USER)

      const filas = filasDelHistorial(tx)
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({
        actorTipo: 'ROOT',
        actorId: ROOT_USER.id,
        actorNombre: EMAIL_DEL_ROOT,
        accion: 'MARCA_CREAR',
        entidadTipo: 'MARCA',
        entidadId: 'marca-nueva',
        entidadNombre: 'La Parrilla',
        marcaId: null,
      })
      expect(filas[0].detalle).toEqual([
        { campo: 'Nombre', antes: null, despues: 'La Parrilla' },
        { campo: 'Identificador', antes: null, despues: 'la-parrilla' },
      ])
      expect(tx.marca.create.mock.invocationCallOrder[0]).toBeLessThan(tx.historialRoot.create.mock.invocationCallOrder[0])
    })

    it('si otra marca (también de baja) ya usa el identificador responde 409 y no escribe nada', async () => {
      tx.marca.findFirst.mockResolvedValue({ id: 'otra' })

      const alta = servicio.crear({ nombre: 'Otra', slug: 'la-parrilla' }, ROOT_USER)

      await expect(alta).rejects.toThrow(new ConflictException(MENSAJE_SLUG_EN_USO))
      expect(tx.marca.findFirst.mock.calls[0][0].where).toEqual({ slug: 'la-parrilla' }) // sin filtrar por activo
      expect(tx.marca.create).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si dos altas con el mismo identificador chocan en la base, responde 409 (no 500) y no registra nada', async () => {
      tx.marca.create.mockRejectedValue(errorDeClaveUnica())

      await expect(servicio.crear({ nombre: 'La Parrilla', slug: 'la-parrilla' }, ROOT_USER)).rejects.toThrow(ConflictException)

      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si la cuenta ROOT que actúa ya no existe responde 401 y no escribe nada', async () => {
      tx.usuario.findUnique.mockResolvedValue(null)

      await expect(servicio.crear({ nombre: 'La Parrilla', slug: 'la-parrilla' }, ROOT_USER)).rejects.toThrow(UnauthorizedException)

      expect(tx.marca.create).not.toHaveBeenCalled()
    })

    it('si el historial falla, el error sale (la transacción se revierte y la marca no queda creada)', async () => {
      tx.historialRoot.create.mockRejectedValue(new Error('sin espacio'))

      await expect(servicio.crear({ nombre: 'La Parrilla', slug: 'la-parrilla' }, ROOT_USER)).rejects.toThrow('sin espacio')
    })
  })

  describe('editar', () => {
    const base = { id: 'marca-1', nombre: 'La Parrilla', slug: 'la-parrilla' }

    beforeEach(() => {
      marcaEnLaTransaccion(base)
      tx.marca.findFirst.mockResolvedValue(null)
      tx.marca.update.mockImplementation(({ data }: { data: Record<string, string> }) => Promise.resolve({ id: 'marca-1', nombre: data.nombre ?? base.nombre }))
    })

    it('cambia el nombre y el identificador, y registra el antes y el después de cada uno', async () => {
      await servicio.editar('marca-1', { nombre: 'La Parrilla de Juan', slug: 'la-parrilla-de-juan' }, ROOT_USER)

      expect(tx.marca.update.mock.calls[0][0].data).toEqual({ nombre: 'La Parrilla de Juan', slug: 'la-parrilla-de-juan' })
      const filas = filasDelHistorial(tx)
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({ accion: 'MARCA_EDITAR', entidadTipo: 'MARCA', entidadId: 'marca-1', entidadNombre: 'La Parrilla de Juan', actorNombre: EMAIL_DEL_ROOT })
      expect(filas[0].detalle).toEqual([
        { campo: 'Nombre', antes: 'La Parrilla', despues: 'La Parrilla de Juan' },
        { campo: 'Identificador', antes: 'la-parrilla', despues: 'la-parrilla-de-juan' },
      ])
      nadaPorFuera()
    })

    it('solo el identificador: el registro lleva solo ese renglón y no se toca el nombre', async () => {
      await servicio.editar('marca-1', { slug: 'parrilla' }, ROOT_USER)

      expect(tx.marca.update.mock.calls[0][0].data).toEqual({ slug: 'parrilla' })
      expect(filasDelHistorial(tx)[0].detalle).toEqual([{ campo: 'Identificador', antes: 'la-parrilla', despues: 'parrilla' }])
    })

    it('lo que llega igual a lo que ya hay no se escribe ni se registra', async () => {
      await servicio.editar('marca-1', { nombre: 'La Parrilla', slug: 'la-parrilla' }, ROOT_USER)

      expect(tx.marca.update).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si cambia una cosa y la otra llega igual, registra solo la que cambió', async () => {
      await servicio.editar('marca-1', { nombre: 'Nuevo', slug: 'la-parrilla' }, ROOT_USER)

      expect(tx.marca.update.mock.calls[0][0].data).toEqual({ nombre: 'Nuevo' })
      expect(filasDelHistorial(tx)[0].detalle).toEqual([{ campo: 'Nombre', antes: 'La Parrilla', despues: 'Nuevo' }])
      expect(tx.marca.findFirst).not.toHaveBeenCalled() // no se revisa un identificador que no cambia
    })

    it('sin nombre ni identificador responde 400 sin abrir la transacción', async () => {
      await expect(servicio.editar('marca-1', {}, ROOT_USER)).rejects.toThrow(BadRequestException)

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('una marca que no existe responde 404', async () => {
      tx.marca.findUnique.mockResolvedValue(null)

      await expect(servicio.editar('no-existe', { nombre: 'X' }, ROOT_USER)).rejects.toThrow(NotFoundException)
      expect(tx.marca.update).not.toHaveBeenCalled()
    })

    it('también edita una marca dada de baja (no filtra por activo)', async () => {
      await servicio.editar('marca-1', { slug: 'libero-el-identificador' }, ROOT_USER)

      expect(tx.marca.findUnique.mock.calls[0][0].where).toEqual({ id: 'marca-1' })
      expect(tx.marca.update).toHaveBeenCalledTimes(1)
    })

    it('si el identificador lo usa OTRA marca responde 409; la propia marca no cuenta como otra', async () => {
      tx.marca.findFirst.mockResolvedValue({ id: 'otra' })

      await expect(servicio.editar('marca-1', { slug: 'ocupado' }, ROOT_USER)).rejects.toThrow(ConflictException)

      expect(tx.marca.findFirst.mock.calls[0][0].where).toEqual({ slug: 'ocupado', id: { not: 'marca-1' } })
      expect(tx.marca.update).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si choca en la base con la clave única responde 409', async () => {
      tx.marca.update.mockRejectedValue(errorDeClaveUnica())

      await expect(servicio.editar('marca-1', { slug: 'otro' }, ROOT_USER)).rejects.toThrow(ConflictException)
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si la cuenta ROOT que actúa ya no existe responde 401', async () => {
      tx.usuario.findUnique.mockResolvedValue(null)

      await expect(servicio.editar('marca-1', { nombre: 'X' }, ROOT_USER)).rejects.toThrow(UnauthorizedException)
      expect(tx.marca.update).not.toHaveBeenCalled()
    })

    it('si el historial falla, el error sale', async () => {
      tx.historialRoot.create.mockRejectedValue(new Error('sin espacio'))

      await expect(servicio.editar('marca-1', { nombre: 'X' }, ROOT_USER)).rejects.toThrow('sin espacio')
    })
  })

  describe('cambiarEstado (baja y reactivar)', () => {
    beforeEach(() => {
      marcaEnLaTransaccion({ id: 'marca-1', nombre: 'La Parrilla', activo: true })
      tx.marca.update.mockResolvedValue({ id: 'marca-1' })
    })

    it('dar de baja pone activo = false y deja EXACTAMENTE un registro MARCA_BAJA', async () => {
      await servicio.cambiarEstado('marca-1', false, ROOT_USER)

      expect(tx.marca.update).toHaveBeenCalledWith({ where: { id: 'marca-1' }, data: { activo: false }, select: { id: true } })
      const filas = filasDelHistorial(tx)
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({ accion: 'MARCA_BAJA', entidadTipo: 'MARCA', entidadId: 'marca-1', entidadNombre: 'La Parrilla', actorNombre: EMAIL_DEL_ROOT })
      expect(filas[0].detalle).toEqual([{ campo: 'Estado', antes: 'Activa', despues: 'De baja' }])
      nadaPorFuera()
    })

    it('reactivar pone activo = true y deja un registro MARCA_REACTIVAR', async () => {
      marcaEnLaTransaccion({ id: 'marca-1', nombre: 'La Parrilla', activo: false })

      await servicio.cambiarEstado('marca-1', true, ROOT_USER)

      expect(tx.marca.update.mock.calls[0][0].data).toEqual({ activo: true })
      expect(filasDelHistorial(tx)[0]).toMatchObject({ accion: 'MARCA_REACTIVAR' })
      expect(filasDelHistorial(tx)[0].detalle).toEqual([{ campo: 'Estado', antes: 'De baja', despues: 'Activa' }])
    })

    it('es idempotente: darla de baja otra vez no cambia nada ni deja registro', async () => {
      marcaEnLaTransaccion({ id: 'marca-1', nombre: 'La Parrilla', activo: false })

      const marca = await servicio.cambiarEstado('marca-1', false, ROOT_USER)

      expect(marca.id).toBe('marca-1')
      expect(tx.marca.update).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('reactivar una marca activa tampoco cambia nada ni deja registro', async () => {
      await servicio.cambiarEstado('marca-1', true, ROOT_USER)

      expect(tx.marca.update).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('la baja NO toca nada más: ni los restaurantes, ni las cuentas, ni las sesiones (cada uno conserva su estado)', async () => {
      await servicio.cambiarEstado('marca-1', false, ROOT_USER)

      expect(tx.restaurante.update).not.toHaveBeenCalled()
      expect(tx.restaurante.updateMany).not.toHaveBeenCalled()
      expect(tx.admin.update).not.toHaveBeenCalled()
      expect(tx.admin.updateMany).not.toHaveBeenCalled()
      expect(tx.admin.delete).not.toHaveBeenCalled()
      expect(tx.mozo.updateMany).not.toHaveBeenCalled()
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled()
    })

    it('devuelve el detalle de la marca', async () => {
      const marca = await servicio.cambiarEstado('marca-1', false, ROOT_USER)

      expect(Object.keys(marca).sort()).toEqual(['activo', 'duenos', 'id', 'nombre', 'restaurantes', 'slug'])
    })

    it('una marca que no existe responde 404', async () => {
      tx.marca.findUnique.mockResolvedValue(null)

      await expect(servicio.cambiarEstado('no-existe', false, ROOT_USER)).rejects.toThrow(NotFoundException)
      expect(tx.marca.update).not.toHaveBeenCalled()
    })

    it('si la cuenta ROOT que actúa ya no existe responde 401, también si no habría nada que cambiar', async () => {
      tx.usuario.findUnique.mockResolvedValue(null)

      await expect(servicio.cambiarEstado('marca-1', false, ROOT_USER)).rejects.toThrow(UnauthorizedException)
      expect(tx.marca.update).not.toHaveBeenCalled()
    })

    it('si el historial falla, el error sale (la baja se revierte)', async () => {
      tx.historialRoot.create.mockRejectedValue(new Error('sin espacio'))

      await expect(servicio.cambiarEstado('marca-1', false, ROOT_USER)).rejects.toThrow('sin espacio')
    })
  })

  it('NO puede borrar marcas (decisión 5: la baja es lógica y reversible): no tiene ningún método que lo haga', () => {
    const metodos = Object.getOwnPropertyNames(RootMarcasService.prototype).filter((n) => n !== 'constructor' && !n.startsWith('exigir') && !n.startsWith('conConflicto'))

    expect(metodos.sort()).toEqual(['cambiarEstado', 'crear', 'detalle', 'editar', 'listar'])
  })
})
