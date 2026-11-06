import { Prisma } from '@prisma/client'
import { cerrarSesionDeMesa } from './cerrar-sesion-de-mesa'
import { ESTADO_PAGO_APROBADO, ESTADO_PAGO_CANCELADO, ESTADO_PAGO_PENDIENTE } from './estado-pago.constant'

// Una transacción de mentira con las filas en memoria: cada método filtra con su `where` como la base, así los tests
// miran cómo quedan la sesión, la mesa y los pagos, y no solo con qué se llamó.
interface Fila { id: string; estado: string; [campo: string]: unknown }

function txDeTest(filas: { sesiones: Fila[]; mesas: Fila[]; pagos: Fila[] }) {
  const cumple = (fila: Fila, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => fila[k] === v)
  const actualizar = (tabla: Fila[], where: Record<string, unknown>, data: Record<string, unknown>) => {
    const afectadas = tabla.filter((f) => cumple(f, where))
    afectadas.forEach((f) => Object.assign(f, data))
    return afectadas
  }
  type Args = { where: Record<string, unknown>; data: Record<string, unknown> }
  const tx = {
    sesionMesa: {
      updateMany: jest.fn(async ({ where, data }: Args) => ({ count: actualizar(filas.sesiones, where, data).length })),
    },
    pago: {
      updateMany: jest.fn(async ({ where, data }: Args) => ({ count: actualizar(filas.pagos, where, data).length })),
    },
    mesa: {
      update: jest.fn(async ({ where, data }: Args) => {
        const [fila] = actualizar(filas.mesas, where, data)
        if (!fila) throw new Error(`mesa ${where.id} no existe`)
        return fila
      }),
    },
  }
  return { tx, comoTx: tx as unknown as Prisma.TransactionClient }
}

const CERRADA_EN = new Date('2026-11-03T20:00:00.000Z')

function mundo(estadoSesion = 'activa', pagos: Fila[] = []) {
  const filas = {
    sesiones: [
      { id: 'ses-1', estado: estadoSesion, cerradaEn: estadoSesion === 'activa' ? null : new Date('2026-11-03T18:00:00.000Z') },
      { id: 'ses-otra', estado: 'activa', cerradaEn: null },
    ],
    mesas: [{ id: 'mesa-1', estado: 'ocupada' }],
    pagos,
  }
  return { filas, ...txDeTest(filas) }
}

const pago = (id: string, metodo: string, estado: string, sesionId = 'ses-1'): Fila => ({ id, sesionId, metodo, estado })

describe('cerrarSesionDeMesa', () => {
  it('con la sesión activa: la cierra con esa fecha, libera la mesa y devuelve true', async () => {
    const { filas, comoTx } = mundo()

    await expect(cerrarSesionDeMesa(comoTx, 'ses-1', 'mesa-1', CERRADA_EN)).resolves.toBe(true)

    expect(filas.sesiones[0]).toMatchObject({ estado: 'cerrada', cerradaEn: CERRADA_EN })
    expect(filas.mesas[0].estado).toBe('libre')
    expect(filas.sesiones[1]).toMatchObject({ estado: 'activa', cerradaEn: null })
  })

  it('cierra solo si sigue activa: el estado va en el where del update', async () => {
    const { tx, comoTx } = mundo()

    await cerrarSesionDeMesa(comoTx, 'ses-1', 'mesa-1', CERRADA_EN)

    expect(tx.sesionMesa.updateMany).toHaveBeenCalledWith({
      where: { id: 'ses-1', estado: 'activa' },
      data: { estado: 'cerrada', cerradaEn: CERRADA_EN },
    })
  })

  it('cancela el pago pendiente de la sesión', async () => {
    const { filas, comoTx } = mundo('activa', [pago('p-1', 'efectivo', ESTADO_PAGO_PENDIENTE)])

    await cerrarSesionDeMesa(comoTx, 'ses-1', 'mesa-1', CERRADA_EN)

    expect(filas.pagos[0].estado).toBe(ESTADO_PAGO_CANCELADO)
  })

  it('con varios pendientes (dos efectivos y un MP) los cancela todos, y el aprobado que la cubrió no se toca', async () => {
    const { filas, comoTx } = mundo('activa', [
      pago('aprobado', 'mercadopago', ESTADO_PAGO_APROBADO),
      pago('efectivo-1', 'efectivo', ESTADO_PAGO_PENDIENTE),
      pago('efectivo-2', 'efectivo', ESTADO_PAGO_PENDIENTE),
      pago('mp', 'mercadopago', ESTADO_PAGO_PENDIENTE),
    ])

    await cerrarSesionDeMesa(comoTx, 'ses-1', 'mesa-1', CERRADA_EN)

    expect(Object.fromEntries(filas.pagos.map((p) => [p.id, p.estado]))).toEqual({
      aprobado: ESTADO_PAGO_APROBADO,
      'efectivo-1': ESTADO_PAGO_CANCELADO,
      'efectivo-2': ESTADO_PAGO_CANCELADO,
      mp: ESTADO_PAGO_CANCELADO,
    })
  })

  it('no toca los pagos aprobados ni los rechazados, ni los pendientes de otra sesión', async () => {
    const { filas, comoTx } = mundo('activa', [
      pago('aprobado', 'efectivo', ESTADO_PAGO_APROBADO),
      pago('rechazado', 'mercadopago', 'rechazado'),
      pago('de-otra', 'efectivo', ESTADO_PAGO_PENDIENTE, 'ses-otra'),
    ])

    await cerrarSesionDeMesa(comoTx, 'ses-1', 'mesa-1', CERRADA_EN)

    expect(filas.pagos.map((p) => p.estado)).toEqual([ESTADO_PAGO_APROBADO, 'rechazado', ESTADO_PAGO_PENDIENTE])
  })

  it('con la sesión ya cerrada devuelve false y no toca nada: ni cerradaEn, ni los pagos, ni la mesa', async () => {
    const { filas, tx, comoTx } = mundo('cerrada', [pago('p-1', 'efectivo', ESTADO_PAGO_PENDIENTE)])
    const cerradaAntes = filas.sesiones[0].cerradaEn

    await expect(cerrarSesionDeMesa(comoTx, 'ses-1', 'mesa-1', CERRADA_EN)).resolves.toBe(false)

    expect(filas.sesiones[0]).toMatchObject({ estado: 'cerrada', cerradaEn: cerradaAntes })
    expect(tx.pago.updateMany).not.toHaveBeenCalled()
    expect(tx.mesa.update).not.toHaveBeenCalled()
    expect(filas.pagos[0].estado).toBe(ESTADO_PAGO_PENDIENTE)
    expect(filas.mesas[0].estado).toBe('ocupada')
  })

  it('con count 0 (la sesión no existe) devuelve false sin llamar a pago.updateMany ni a mesa.update', async () => {
    const { tx, comoTx } = mundo()

    await expect(cerrarSesionDeMesa(comoTx, 'ses-inexistente', 'mesa-1', CERRADA_EN)).resolves.toBe(false)

    expect(tx.pago.updateMany).not.toHaveBeenCalled()
    expect(tx.mesa.update).not.toHaveBeenCalled()
  })
})
