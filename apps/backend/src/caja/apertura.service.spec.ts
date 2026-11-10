import { BadRequestException, ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { CUENTAS, MUNDO } from '../test/acceso-de-test'
import { BaseDeCaja, baseDeCajaVacia, conectarBaseDeCaja } from '../test/caja-en-memoria'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { AperturaService } from './apertura.service'
import { MENSAJE_CAJA_YA_ABIERTA, MENSAJE_OPERACION_SIMULTANEA, MENSAJE_TURNO_ABIERTO } from './conflictos'
import { AbrirTurnoDto } from './dto/abrir-turno.dto'

const REST = MUNDO.REST_1
const OTRO = MUNDO.REST_B
const QUIEN_ABRE = CUENTAS.JEFE_SALON

const p2002 = (modelName: string, target: string[]) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test', meta: { modelName, target } })
const p2034 = () => new Prisma.PrismaClientKnownRequestError('write conflict', { code: 'P2034', clientVersion: 'test' })

/** El error con que termina la promesa (o falla el test si no termina con uno). */
const errorDe = async (promesa: Promise<unknown>) => {
  const e = await promesa.then(
    () => undefined,
    (err: unknown) => err,
  )
  if (e === undefined) throw new Error('se esperaba un error')
  return e as Error
}

describe('AperturaService', () => {
  let prisma: PrismaMock
  let base: BaseDeCaja
  let service: AperturaService

  const abrir = (cambios: Partial<AbrirTurnoDto> = {}) =>
    service.abrir({ restauranteId: REST, cajas: [{ cajaId: 'caja-1', fondoInicial: 1000 }], asignaciones: [], ...cambios }, QUIEN_ABRE)

  beforeEach(() => {
    prisma = crearPrismaMock()
    base = baseDeCajaVacia()
    base.usuarios[QUIEN_ABRE.id] = 'Jefa de salón'
    base.cajas.push(
      { id: 'caja-1', restauranteId: REST, nombre: 'Principal', activa: true },
      { id: 'caja-2', restauranteId: REST, nombre: 'Barra', activa: true },
      { id: 'caja-inactiva', restauranteId: REST, nombre: 'Vieja', activa: false },
      { id: 'caja-ajena', restauranteId: OTRO, nombre: 'Principal', activa: true },
    )
    base.mesas.push(
      { id: 'mesa-1', restauranteId: REST, numero: '1', activo: true },
      { id: 'mesa-2', restauranteId: REST, numero: '2', activo: true },
      { id: 'mesa-de-baja', restauranteId: REST, numero: '9', activo: false },
      { id: 'mesa-ajena', restauranteId: OTRO, numero: '1', activo: true },
    )
    base.mozos.push(
      { id: 'ana', restauranteId: REST, nombre: 'Ana', activo: true, usuarioId: 'usuario-ana' },
      { id: 'beto', restauranteId: REST, nombre: 'Beto', activo: true, usuarioId: 'usuario-beto' },
      { id: 'mozo-de-baja', restauranteId: REST, nombre: 'Dado de baja', activo: false, usuarioId: 'usuario-x' },
      { id: 'mozo-sin-cuenta', restauranteId: REST, nombre: 'Sin cuenta', activo: true, usuarioId: null },
      { id: 'mozo-ajeno', restauranteId: OTRO, nombre: 'Ajeno', activo: true, usuarioId: 'usuario-ajeno' },
    )
    conectarBaseDeCaja(prisma, base)
    service = new AperturaService(comoPrisma(prisma))
  })

  it('abre el turno con sus cajas y asignaciones, a nombre de quien abre, y lo devuelve con los montos como number', async () => {
    const { turno, avisos } = await abrir({
      cajas: [
        { cajaId: 'caja-1', fondoInicial: 1500.5 },
        { cajaId: 'caja-2', fondoInicial: 0 },
      ],
      asignaciones: [
        { mesaId: 'mesa-2', mozoId: 'beto' },
        { mesaId: 'mesa-1', mozoId: 'ana' },
      ],
      observaciones: 'Noche de partido',
    })

    expect(avisos).toEqual([])
    expect(turno).toMatchObject({
      restauranteId: REST,
      abiertoPor: { id: QUIEN_ABRE.id, nombre: 'Jefa de salón' },
      cerradoEn: null,
      observaciones: 'Noche de partido',
      cajas: [
        { cajaId: 'caja-2', nombre: 'Barra', fondoInicial: 0 },
        { cajaId: 'caja-1', nombre: 'Principal', fondoInicial: 1500.5 },
      ],
      asignaciones: [
        { mesaId: 'mesa-1', mesaNumero: '1', mozoId: 'ana', mozoNombre: 'Ana' },
        { mesaId: 'mesa-2', mesaNumero: '2', mozoId: 'beto', mozoNombre: 'Beto' },
      ],
    })
    expect(prisma.turno.create).toHaveBeenCalledWith({
      data: { restauranteId: REST, abiertoPorUsuarioId: QUIEN_ABRE.id, observaciones: 'Noche de partido' },
      select: { id: true },
    })
    expect(base.turnoCajas.map((tc) => tc.fondoInicial)).toEqual([new Prisma.Decimal('1500.5'), new Prisma.Decimal(0)])
  })

  it('corre en una transacción serializable', async () => {
    await abrir()

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
  })

  describe('regla 1: un solo turno abierto por restaurante', () => {
    it('con un turno abierto en el restaurante es 409 y no crea nada', async () => {
      base.turnos.push({ id: 't0', restauranteId: REST, abiertoPorUsuarioId: 'x', abiertoEn: new Date(), cerradoEn: null, observaciones: null })

      const error = await errorDe(abrir())
      expect(error).toBeInstanceOf(ConflictException)
      expect(error.message).toBe(MENSAJE_TURNO_ABIERTO)
      expect(prisma.turno.create).not.toHaveBeenCalled()
    })

    it('un turno cerrado del restaurante, o uno abierto de otro restaurante, no lo impide', async () => {
      base.turnos.push(
        { id: 't0', restauranteId: REST, abiertoPorUsuarioId: 'x', abiertoEn: new Date(), cerradoEn: new Date(), observaciones: null },
        { id: 't1', restauranteId: OTRO, abiertoPorUsuarioId: 'x', abiertoEn: new Date(), cerradoEn: null, observaciones: null },
      )

      await expect(abrir()).resolves.toMatchObject({ turno: { restauranteId: REST } })
    })
  })

  describe('regla 2: las cajas', () => {
    it.each([
      ['de otro restaurante', 'caja-ajena', 'Alguna de las cajas no existe o no es de este restaurante'],
      ['que no existe', 'caja-x', 'Alguna de las cajas no existe o no es de este restaurante'],
      ['inactiva', 'caja-inactiva', 'La caja «Vieja» está inactiva'],
    ])('una caja %s es 400 y no se crea nada', async (_caso, cajaId, mensaje) => {
      const error = await errorDe(abrir({ cajas: [{ cajaId: 'caja-1', fondoInicial: 0 }, { cajaId, fondoInicial: 0 }] }))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(error.message).toBe(mensaje)
      expect(prisma.turno.create).not.toHaveBeenCalled()
    })
  })

  describe('regla 3: las asignaciones del body', () => {
    it.each([
      ['una mesa de otro restaurante', { mesaId: 'mesa-ajena', mozoId: 'ana' }, 'Alguna de las mesas no existe o no es de este restaurante'],
      ['una mesa que no existe', { mesaId: 'mesa-x', mozoId: 'ana' }, 'Alguna de las mesas no existe o no es de este restaurante'],
      ['una mesa dada de baja', { mesaId: 'mesa-de-baja', mozoId: 'ana' }, 'La mesa 9 está dada de baja'],
      ['un mozo de otro restaurante', { mesaId: 'mesa-1', mozoId: 'mozo-ajeno' }, 'Alguno de los mozos no existe o no es de este restaurante'],
      ['un mozo dado de baja', { mesaId: 'mesa-1', mozoId: 'mozo-de-baja' }, 'El mozo «Dado de baja» está dado de baja'],
      ['un mozo sin cuenta', { mesaId: 'mesa-1', mozoId: 'mozo-sin-cuenta' }, 'El mozo «Sin cuenta» no tiene cuenta: no se le pueden asignar mesas'],
    ])('%s es 400 y no se crea nada', async (_caso, asignacion, mensaje) => {
      const error = await errorDe(abrir({ asignaciones: [{ mesaId: 'mesa-2', mozoId: 'beto' }, asignacion] }))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(error.message).toBe(mensaje)
      expect(prisma.turno.create).not.toHaveBeenCalled()
    })

    it('un mismo mozo en varias mesas vale', async () => {
      const { turno } = await abrir({
        asignaciones: [
          { mesaId: 'mesa-1', mozoId: 'ana' },
          { mesaId: 'mesa-2', mozoId: 'ana' },
        ],
      })

      expect(turno.asignaciones.map((a) => a.mozoId)).toEqual(['ana', 'ana'])
    })

    it('con [] el turno abre sin asignaciones y sin precargar', async () => {
      base.mozoMesas.push({ mesaId: 'mesa-1', mozoId: 'ana' })

      const { turno, avisos } = await abrir({ asignaciones: [] })

      expect(turno.asignaciones).toEqual([])
      expect(avisos).toEqual([])
      expect(prisma.mesa.findMany).not.toHaveBeenCalled()
      expect(prisma.asignacionTurno.createMany).not.toHaveBeenCalled()
    })
  })

  describe('sin asignaciones en el body: la precarga', () => {
    it('asigna las mesas con un solo mozo válido del restaurante y avisa las que no pudo', async () => {
      base.mozoMesas.push(
        { mesaId: 'mesa-1', mozoId: 'ana' },
        { mesaId: 'mesa-2', mozoId: 'ana' },
        { mesaId: 'mesa-2', mozoId: 'beto' },
        { mesaId: 'mesa-ajena', mozoId: 'mozo-ajeno' },
      )

      const { turno, avisos } = await abrir({ asignaciones: undefined })

      expect(prisma.mesa.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { restauranteId: REST } }))
      expect(turno.asignaciones).toEqual([{ mesaId: 'mesa-1', mesaNumero: '1', mozoId: 'ana', mozoNombre: 'Ana' }])
      expect(avisos).toEqual([{ mesaId: 'mesa-2', mesaNumero: '2', motivo: 'varios-mozos' }])
    })

    it('sin plantilla, el turno abre sin asignaciones ni avisos', async () => {
      const { turno, avisos } = await abrir({ asignaciones: undefined })

      expect(turno.asignaciones).toEqual([])
      expect(avisos).toEqual([])
      expect(prisma.asignacionTurno.createMany).not.toHaveBeenCalled()
    })
  })

  describe('los choques', () => {
    it.each([
      ['el P2002 del turno abierto', () => p2002('Turno', ['restaurante_id']), MENSAJE_TURNO_ABIERTO],
      ['el P2002 de la caja abierta', () => p2002('TurnoCaja', ['caja_id']), MENSAJE_CAJA_YA_ABIERTA],
      ['un P2034 que sobrevive al reintento', p2034, MENSAJE_OPERACION_SIMULTANEA],
    ])('%s es un 409 con su mensaje', async (_caso, crearError, mensaje) => {
      prisma.$transaction.mockRejectedValue(crearError())

      const error = await errorDe(abrir())
      expect(error).toBeInstanceOf(ConflictException)
      expect(error.message).toBe(mensaje)
    })

    it('el P2034 se reintenta una vez: dos llamadas a $transaction', async () => {
      prisma.$transaction.mockRejectedValue(p2034())

      await errorDe(abrir())
      expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    })

    it('un P2002 de otro único no se disfraza de choque de apertura', async () => {
      const otro = p2002('AsignacionTurno', ['turno_id', 'mesa_id'])
      prisma.$transaction.mockRejectedValue(otro)

      await expect(abrir()).rejects.toBe(otro)
    })
  })

  describe('actual', () => {
    it('sin turno abierto, { turno: null }', async () => {
      await expect(service.actual(REST)).resolves.toEqual({ turno: null })
    })

    it('con turno abierto, el turno del restaurante con el fondo como number', async () => {
      base.turnos.push({ id: 't0', restauranteId: REST, abiertoPorUsuarioId: QUIEN_ABRE.id, abiertoEn: new Date(), cerradoEn: null, observaciones: null })
      base.turnoCajas.push({ id: 'ap-1', turnoId: 't0', cajaId: 'caja-1', fondoInicial: new Prisma.Decimal('250.75'), abiertoEn: new Date() })

      const { turno } = await service.actual(REST)

      expect(turno).toMatchObject({ id: 't0', cajas: [{ id: 'ap-1', cajaId: 'caja-1', nombre: 'Principal', fondoInicial: 250.75 }] })
      expect(prisma.turno.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { restauranteId: REST, cerradoEn: null } }))
    })
  })
})
