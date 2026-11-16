import { CUENTAS, MUNDO } from '../test/acceso-de-test'
import { baseDeCajaVacia, conectarBaseDeCaja } from '../test/caja-en-memoria'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { AperturaService } from './apertura.service'
import * as precargaModulo from './precarga-de-asignaciones'
import { PrecargaDeAsignaciones, precargar } from './precarga-de-asignaciones'

// GET /turnos/preparacion (#359) y la precarga compartida con la apertura. Las consultas se comparan enteras: un filtro
// de menos (activos, con cuenta, del restaurante) o un campo de más en el select hace fallar el test.

const REST = MUNDO.REST_1
const CONSULTA_DE_LA_PRECARGA = {
  where: { restauranteId: REST },
  orderBy: { numero: 'asc' },
  select: {
    id: true,
    numero: true,
    activo: true,
    mozoMesas: { select: { mozo: { select: { id: true, activo: true, usuarioId: true } } } },
  },
}
const mesaDePlantilla = (id: string, numero: string, mozos: { id: string; activo?: boolean; usuarioId?: string | null }[], activo = true) => ({
  id,
  numero,
  activo,
  mozoMesas: mozos.map(({ id: mozoId, activo: mozoActivo = true, usuarioId = `usuario-${mozoId}` }) => ({
    mozo: { id: mozoId, activo: mozoActivo, usuarioId },
  })),
})

describe('precargar (la consulta de la precarga)', () => {
  it('lee todas las mesas del restaurante con su plantilla y las pasa por precargarAsignaciones', async () => {
    const prisma = crearPrismaMock()
    prisma.mesa.findMany.mockResolvedValue([
      mesaDePlantilla('mesa-1', '1', [{ id: 'ana' }]),
      mesaDePlantilla('mesa-2', '2', [{ id: 'ana' }, { id: 'zoe' }]),
      mesaDePlantilla('mesa-3', '3', [{ id: 'leo', activo: false }]),
      mesaDePlantilla('mesa-4', '4', [{ id: 'eva', usuarioId: null }]),
      mesaDePlantilla('mesa-5', '5', []),
      mesaDePlantilla('mesa-6', '6', [{ id: 'ana' }], false),
    ])

    await expect(precargar(comoPrisma(prisma), REST)).resolves.toEqual({
      asignaciones: [{ mesaId: 'mesa-1', mozoId: 'ana' }],
      avisos: [
        { mesaId: 'mesa-2', mesaNumero: '2', motivo: 'varios-mozos' },
        { mesaId: 'mesa-3', mesaNumero: '3', motivo: 'mozo-inactivo' },
        { mesaId: 'mesa-4', mesaNumero: '4', motivo: 'mozo-sin-cuenta' },
      ],
    })
    expect(prisma.mesa.findMany).toHaveBeenCalledWith(CONSULTA_DE_LA_PRECARGA)
  })
})

describe('AperturaService.preparacion', () => {
  let prisma: PrismaMock
  let service: AperturaService
  const PRECARGA: PrecargaDeAsignaciones = { asignaciones: [{ mesaId: 'mesa-1', mozoId: 'ana' }], avisos: [] }

  beforeEach(() => {
    jest.restoreAllMocks()
    prisma = crearPrismaMock()
    service = new AperturaService(comoPrisma(prisma))
    prisma.mozo.findMany.mockResolvedValue([{ id: 'ana', nombre: 'Ana' }])
    prisma.mesa.findMany.mockResolvedValue([])
  })

  it('los mozos activos y con cuenta del restaurante, por nombre (y por id), solo con id y nombre', async () => {
    await service.preparacion(REST)

    expect(prisma.mozo.findMany).toHaveBeenCalledWith({
      where: { restauranteId: REST, activo: true, usuarioId: { not: null } },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
      select: { id: true, nombre: true },
    })
  })

  it('las mesas activas del restaurante, por número, solo con id y número', async () => {
    await service.preparacion(REST)

    expect(prisma.mesa.findMany).toHaveBeenCalledWith({
      where: { restauranteId: REST, activo: true },
      orderBy: { numero: 'asc' },
      select: { id: true, numero: true },
    })
  })

  it('la precarga sale de precargar, con el cliente de Prisma (sin transacción), y se devuelve tal cual', async () => {
    const espia = jest.spyOn(precargaModulo, 'precargar').mockResolvedValue(PRECARGA)
    prisma.mesa.findMany.mockResolvedValue([{ id: 'mesa-1', numero: '1' }])

    await expect(service.preparacion(REST)).resolves.toEqual({
      mozos: [{ id: 'ana', nombre: 'Ana' }],
      mesas: [{ id: 'mesa-1', numero: '1' }],
      precarga: PRECARGA,
    })
    expect(espia).toHaveBeenCalledTimes(1)
    expect(espia.mock.calls[0][0]).toBe(comoPrisma(prisma))
    expect(espia.mock.calls[0][1]).toBe(REST)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('la apertura sin asignaciones usa la misma precargar, con el tx de su transacción', async () => {
    const base = baseDeCajaVacia()
    base.cajas.push({ id: 'caja-1', restauranteId: REST, nombre: 'Principal', activa: true })
    conectarBaseDeCaja(prisma, base)
    const espia = jest.spyOn(precargaModulo, 'precargar').mockResolvedValue(PRECARGA)
    base.mesas.push({ id: 'mesa-1', restauranteId: REST, numero: '1', activo: true })
    base.mozos.push({ id: 'ana', restauranteId: REST, nombre: 'Ana', activo: true, usuarioId: 'usuario-ana' })

    const { avisos } = await service.abrir({ restauranteId: REST, cajas: [{ cajaId: 'caja-1', fondoInicial: 0 }] }, CUENTAS.OWNER_A)

    expect(espia).toHaveBeenCalledTimes(1)
    expect(espia).toHaveBeenCalledWith(expect.anything(), REST)
    expect(avisos).toEqual([])
    expect(base.asignaciones).toEqual([expect.objectContaining({ mesaId: 'mesa-1', mozoId: 'ana' })])
  })
})
