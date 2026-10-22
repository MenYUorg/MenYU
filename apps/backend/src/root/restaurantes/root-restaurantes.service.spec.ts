import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { PrismaMock, comoPrisma } from '../../test/prisma-mock'
import { EMAIL_DEL_ROOT, ROOT_USER, armarTransaccionRoot, filasDelHistorial, serializar } from '../../test/root-mock'
import { HistorialRootService } from '../historial/historial-root.service'
import { RootRestaurantesService } from './root-restaurantes.service'

const MARCA = { id: 'marca-1', nombre: 'La Parrilla' }

// Una fila como la devolvería la base, con campos de más que el servicio no tiene que dejar pasar.
const fila = (extra: Record<string, unknown> = {}) => ({
  id: 'rest-1',
  nombre: 'La Parrilla Centro',
  direccion: 'Av. Colón 1200, Córdoba',
  activo: true,
  marca: MARCA,
  logoUrl: 'https://logos/r.png',
  mpAccessToken: 'secreto-mp',
  modoSesion: 'abierto',
  ...extra,
})

describe('RootRestaurantesService', () => {
  let prisma: PrismaMock
  let tx: PrismaMock
  let servicio: RootRestaurantesService

  beforeEach(() => {
    ;({ prisma, tx } = armarTransaccionRoot())
    servicio = new RootRestaurantesService(comoPrisma(prisma), new HistorialRootService(comoPrisma(prisma)))
  })

  const nadaPorFuera = () => {
    expect(prisma.restaurante.create).not.toHaveBeenCalled()
    expect(prisma.restaurante.update).not.toHaveBeenCalled()
    expect(prisma.historialRoot.create).not.toHaveBeenCalled()
  }

  describe('crear', () => {
    beforeEach(() => {
      tx.marca.findUnique.mockResolvedValue({ ...MARCA, activo: true })
      tx.restaurante.create.mockResolvedValue(fila({ id: 'rest-nuevo' }))
    })

    it('crea un restaurante activo en la marca, con nombre y dirección, y nada más', async () => {
      const r = await servicio.crear('marca-1', { nombre: 'La Parrilla Centro', direccion: 'Av. Colón 1200, Córdoba' }, ROOT_USER)

      const { data, select } = tx.restaurante.create.mock.calls[0][0]
      expect(data).toEqual({ marcaId: 'marca-1', nombre: 'La Parrilla Centro', direccion: 'Av. Colón 1200, Córdoba' })
      expect(select).not.toHaveProperty('mpAccessToken')
      expect(r).toEqual({ id: 'rest-nuevo', nombre: 'La Parrilla Centro', direccion: 'Av. Colón 1200, Córdoba', activo: true })
      nadaPorFuera()
    })

    it('la respuesta tiene EXACTAMENTE id, nombre, direccion y activo (ni el logo, ni el modo de sesión, ni mp_*)', async () => {
      const r = await servicio.crear('marca-1', { nombre: 'La Parrilla Centro', direccion: 'Av. Colón 1200, Córdoba' }, ROOT_USER)

      expect(Object.keys(r).sort()).toEqual(['activo', 'direccion', 'id', 'nombre'])
      expect(serializar(r)).not.toContain('secreto-mp')
      expect(serializar(r)).not.toContain('logo')
    })

    it('deja EXACTAMENTE un registro RESTAURANTE_CREAR, con la marca de contexto y la dirección', async () => {
      await servicio.crear('marca-1', { nombre: 'La Parrilla Centro', direccion: 'Av. Colón 1200, Córdoba' }, ROOT_USER)

      const filas = filasDelHistorial(tx)
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({
        actorTipo: 'ROOT',
        actorNombre: EMAIL_DEL_ROOT,
        accion: 'RESTAURANTE_CREAR',
        entidadTipo: 'RESTAURANTE',
        entidadId: 'rest-nuevo',
        entidadNombre: 'La Parrilla Centro',
        marcaId: 'marca-1',
        marcaNombre: 'La Parrilla',
      })
      expect(filas[0].detalle).toEqual([
        { campo: 'Nombre', antes: null, despues: 'La Parrilla Centro' },
        { campo: 'Dirección', antes: null, despues: 'Av. Colón 1200, Córdoba' },
      ])
      expect(tx.restaurante.create.mock.invocationCallOrder[0]).toBeLessThan(tx.historialRoot.create.mock.invocationCallOrder[0])
    })

    it('acepta ids de marca que no son UUID, como m-001', async () => {
      await servicio.crear('m-001', { nombre: 'X', direccion: 'Y' }, ROOT_USER)

      expect(tx.marca.findUnique.mock.calls[0][0].where).toEqual({ id: 'm-001' })
    })

    it('una marca que no existe responde 404 y no escribe nada', async () => {
      tx.marca.findUnique.mockResolvedValue(null)

      await expect(servicio.crear('no-existe', { nombre: 'X', direccion: 'Y' }, ROOT_USER)).rejects.toThrow(NotFoundException)

      expect(tx.restaurante.create).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('una marca dada de baja responde 409 y no escribe nada', async () => {
      tx.marca.findUnique.mockResolvedValue({ ...MARCA, activo: false })

      await expect(servicio.crear('marca-1', { nombre: 'X', direccion: 'Y' }, ROOT_USER)).rejects.toThrow(ConflictException)

      expect(tx.restaurante.create).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si la cuenta ROOT que actúa ya no existe responde 401 y no escribe nada', async () => {
      tx.usuario.findUnique.mockResolvedValue(null)

      await expect(servicio.crear('marca-1', { nombre: 'X', direccion: 'Y' }, ROOT_USER)).rejects.toThrow(UnauthorizedException)

      expect(tx.restaurante.create).not.toHaveBeenCalled()
    })

    it('si el historial falla, el error sale (el restaurante no queda creado)', async () => {
      tx.historialRoot.create.mockRejectedValue(new Error('sin espacio'))

      await expect(servicio.crear('marca-1', { nombre: 'X', direccion: 'Y' }, ROOT_USER)).rejects.toThrow('sin espacio')
    })
  })

  describe('editar (solo el nombre)', () => {
    beforeEach(() => {
      tx.restaurante.findUnique.mockResolvedValue(fila())
      tx.restaurante.update.mockImplementation(({ data }: { data: { nombre: string } }) => Promise.resolve(fila({ nombre: data.nombre })))
    })

    it('cambia el nombre y deja un registro con el antes y el después y la marca de contexto', async () => {
      const r = await servicio.editar('rest-1', { nombre: 'La Parrilla Alta Córdoba' }, ROOT_USER)

      expect(tx.restaurante.update.mock.calls[0][0].data).toEqual({ nombre: 'La Parrilla Alta Córdoba' })
      expect(r.nombre).toBe('La Parrilla Alta Córdoba')
      expect(Object.keys(r).sort()).toEqual(['activo', 'direccion', 'id', 'nombre'])
      const filas = filasDelHistorial(tx)
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({
        accion: 'RESTAURANTE_EDITAR',
        entidadTipo: 'RESTAURANTE',
        entidadId: 'rest-1',
        entidadNombre: 'La Parrilla Alta Córdoba',
        marcaId: 'marca-1',
        marcaNombre: 'La Parrilla',
        actorNombre: EMAIL_DEL_ROOT,
      })
      expect(filas[0].detalle).toEqual([{ campo: 'Nombre', antes: 'La Parrilla Centro', despues: 'La Parrilla Alta Córdoba' }])
      nadaPorFuera()
    })

    it('NUNCA toca la dirección, el logo ni el modo de sesión: el update lleva solo el nombre', async () => {
      await servicio.editar('rest-1', { nombre: 'Otro' }, ROOT_USER)

      expect(Object.keys(tx.restaurante.update.mock.calls[0][0].data)).toEqual(['nombre'])
    })

    it('el mismo nombre no se escribe ni se registra', async () => {
      await servicio.editar('rest-1', { nombre: 'La Parrilla Centro' }, ROOT_USER)

      expect(tx.restaurante.update).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('sin nombre responde 400 sin abrir la transacción', async () => {
      await expect(servicio.editar('rest-1', {}, ROOT_USER)).rejects.toThrow(BadRequestException)

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('un restaurante que no existe responde 404', async () => {
      tx.restaurante.findUnique.mockResolvedValue(null)

      await expect(servicio.editar('no-existe', { nombre: 'X' }, ROOT_USER)).rejects.toThrow(NotFoundException)
      expect(tx.restaurante.update).not.toHaveBeenCalled()
    })

    it('si la cuenta ROOT que actúa ya no existe responde 401', async () => {
      tx.usuario.findUnique.mockResolvedValue(null)

      await expect(servicio.editar('rest-1', { nombre: 'X' }, ROOT_USER)).rejects.toThrow(UnauthorizedException)
      expect(tx.restaurante.update).not.toHaveBeenCalled()
    })

    it('si el historial falla, el error sale', async () => {
      tx.historialRoot.create.mockRejectedValue(new Error('sin espacio'))

      await expect(servicio.editar('rest-1', { nombre: 'X' }, ROOT_USER)).rejects.toThrow('sin espacio')
    })
  })

  describe('cambiarEstado (baja y reactivar)', () => {
    beforeEach(() => {
      tx.restaurante.findUnique.mockResolvedValue(fila())
      tx.restaurante.update.mockImplementation(({ data }: { data: { activo: boolean } }) => Promise.resolve(fila({ activo: data.activo })))
    })

    it('dar de baja pone activo = false y deja EXACTAMENTE un registro RESTAURANTE_BAJA con la marca', async () => {
      const r = await servicio.cambiarEstado('rest-1', false, ROOT_USER)

      expect(tx.restaurante.update.mock.calls[0][0].data).toEqual({ activo: false })
      expect(r.activo).toBe(false)
      const filas = filasDelHistorial(tx)
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({ accion: 'RESTAURANTE_BAJA', entidadTipo: 'RESTAURANTE', entidadId: 'rest-1', entidadNombre: 'La Parrilla Centro', marcaId: 'marca-1', marcaNombre: 'La Parrilla' })
      expect(filas[0].detalle).toEqual([{ campo: 'Estado', antes: 'Activo', despues: 'De baja' }])
      nadaPorFuera()
    })

    it('reactivar pone activo = true y deja un registro RESTAURANTE_REACTIVAR', async () => {
      tx.restaurante.findUnique.mockResolvedValue(fila({ activo: false }))

      await servicio.cambiarEstado('rest-1', true, ROOT_USER)

      expect(tx.restaurante.update.mock.calls[0][0].data).toEqual({ activo: true })
      expect(filasDelHistorial(tx)[0]).toMatchObject({ accion: 'RESTAURANTE_REACTIVAR' })
      expect(filasDelHistorial(tx)[0].detalle).toEqual([{ campo: 'Estado', antes: 'De baja', despues: 'Activo' }])
    })

    it('es idempotente: repetir la baja no cambia nada ni deja registro', async () => {
      tx.restaurante.findUnique.mockResolvedValue(fila({ activo: false }))

      const r = await servicio.cambiarEstado('rest-1', false, ROOT_USER)

      expect(r.activo).toBe(false)
      expect(tx.restaurante.update).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('se puede reactivar un restaurante de una marca dada de baja: no mira el estado de la marca', async () => {
      tx.restaurante.findUnique.mockResolvedValue(fila({ activo: false, marca: { ...MARCA, activo: false } }))

      await servicio.cambiarEstado('rest-1', true, ROOT_USER)

      expect(tx.restaurante.update).toHaveBeenCalledTimes(1)
      expect(tx.marca.findUnique).not.toHaveBeenCalled()
    })

    it('un restaurante que no existe responde 404', async () => {
      tx.restaurante.findUnique.mockResolvedValue(null)

      await expect(servicio.cambiarEstado('no-existe', false, ROOT_USER)).rejects.toThrow(NotFoundException)
    })

    it('si la cuenta ROOT que actúa ya no existe responde 401', async () => {
      tx.usuario.findUnique.mockResolvedValue(null)

      await expect(servicio.cambiarEstado('rest-1', false, ROOT_USER)).rejects.toThrow(UnauthorizedException)
      expect(tx.restaurante.update).not.toHaveBeenCalled()
    })

    it('si el historial falla, el error sale (la baja se revierte)', async () => {
      tx.historialRoot.create.mockRejectedValue(new Error('sin espacio'))

      await expect(servicio.cambiarEstado('rest-1', false, ROOT_USER)).rejects.toThrow('sin espacio')
    })
  })

  it('NO puede borrar restaurantes ni moverlos de marca: solo crear, editar el nombre y cambiar el estado', () => {
    const metodos = Object.getOwnPropertyNames(RootRestaurantesService.prototype).filter((n) => n !== 'constructor').sort()

    expect(metodos).toEqual(['cambiarEstado', 'crear', 'editar'])
  })
})
