import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { cajaDeMercadoPago, cajaDelCobro } from './caja-del-cobro'
import { MENSAJE_ELEGIR_CAJA, MENSAJE_SIN_TURNO } from './conflictos'
import { MENSAJE_CAJA_NO_ABIERTA } from './movimientos.service'

// Una base mínima de turnos y aperturas. El `where` de turnoCaja.findMany se resuelve campo por campo y uno desconocido
// corta el test: así una mutación que saca un filtro devuelve aperturas de más y el test lo nota.
type Turno = { id: string; restauranteId: string; cerradoEn: Date | null }
type Apertura = { id: string; turnoId: string; cajaId: string; cerradoEn: Date | null }

const CERRADO = new Date('2026-11-15T23:00:00Z')

function txCon(turnos: Turno[], aperturas: Apertura[]) {
  const findMany = jest.fn(async ({ where, select }: { where: Record<string, any>; select: Record<string, boolean> }) => {
    const desconocido = Object.keys(where).find((k) => !['cerradoEn', 'turno'].includes(k))
    if (desconocido) throw new Error(`el test no sabe filtrar por ${desconocido}`)
    const desconocidoDelTurno = Object.keys(where.turno ?? {}).find((k) => !['restauranteId', 'cerradoEn'].includes(k))
    if (desconocidoDelTurno) throw new Error(`el test no sabe filtrar el turno por ${desconocidoDelTurno}`)
    expect(select).toEqual({ id: true, cajaId: true })
    return aperturas
      .filter((a) => !('cerradoEn' in where) || (where.cerradoEn === null && a.cerradoEn === null))
      .filter((a) => {
        const turno = turnos.find((t) => t.id === a.turnoId)
        if (!turno) return false
        if (where.turno?.restauranteId !== undefined && turno.restauranteId !== where.turno.restauranteId) return false
        if (where.turno && 'cerradoEn' in where.turno && where.turno.cerradoEn === null && turno.cerradoEn !== null) return false
        return true
      })
      .map((a) => ({ id: a.id, cajaId: a.cajaId }))
  })
  return { tx: { turnoCaja: { findMany } } as unknown as Prisma.TransactionClient, findMany }
}

async function errorDe(promesa: Promise<unknown>): Promise<BadRequestException> {
  const error = await promesa.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(BadRequestException)
  return error as BadRequestException
}

describe('cajaDelCobro (#358)', () => {
  const R1 = 'rest-1'
  const R2 = 'rest-2'

  it('sin ningún turno: 400 "No hay un turno abierto"', async () => {
    const { tx } = txCon([], [])

    expect((await errorDe(cajaDelCobro(tx, R1, undefined))).message).toBe(MENSAJE_SIN_TURNO)
  })

  it('con solo un turno cerrado (y sus cajas cerradas): 400 sin turno, también con el cajaId de esa caja', async () => {
    const { tx } = txCon([{ id: 't1', restauranteId: R1, cerradoEn: CERRADO }], [{ id: 'a1', turnoId: 't1', cajaId: 'c1', cerradoEn: CERRADO }])

    expect((await errorDe(cajaDelCobro(tx, R1, undefined))).message).toBe(MENSAJE_SIN_TURNO)
    expect((await errorDe(cajaDelCobro(tx, R1, 'c1'))).message).toBe(MENSAJE_SIN_TURNO)
  })

  it('con el turno abierto de otro restaurante: 400 sin turno', async () => {
    const { tx } = txCon([{ id: 't2', restauranteId: R2, cerradoEn: null }], [{ id: 'a2', turnoId: 't2', cajaId: 'c2', cerradoEn: null }])

    expect((await errorDe(cajaDelCobro(tx, R1, undefined))).message).toBe(MENSAJE_SIN_TURNO)
  })

  it('una caja abierta: es la del cobro, sin cajaId, con su cajaId y con null', async () => {
    const { tx } = txCon([{ id: 't1', restauranteId: R1, cerradoEn: null }], [{ id: 'a1', turnoId: 't1', cajaId: 'c1', cerradoEn: null }])

    await expect(cajaDelCobro(tx, R1, undefined)).resolves.toBe('a1')
    await expect(cajaDelCobro(tx, R1, null)).resolves.toBe('a1')
    await expect(cajaDelCobro(tx, R1, 'c1')).resolves.toBe('a1')
  })

  it('una caja abierta y un cajaId de otra caja: 400 "La caja no está abierta en este turno"', async () => {
    const { tx } = txCon([{ id: 't1', restauranteId: R1, cerradoEn: null }], [{ id: 'a1', turnoId: 't1', cajaId: 'c1', cerradoEn: null }])

    expect((await errorDe(cajaDelCobro(tx, R1, 'c9'))).message).toBe(MENSAJE_CAJA_NO_ABIERTA)
  })

  it('dos cajas abiertas: sin cajaId (o con null) 400 "elegí la caja"; con cajaId, la indicada', async () => {
    const { tx } = txCon(
      [{ id: 't1', restauranteId: R1, cerradoEn: null }],
      [
        { id: 'a1', turnoId: 't1', cajaId: 'c1', cerradoEn: null },
        { id: 'a2', turnoId: 't1', cajaId: 'c2', cerradoEn: null },
      ],
    )

    expect((await errorDe(cajaDelCobro(tx, R1, undefined))).message).toBe(MENSAJE_ELEGIR_CAJA)
    expect((await errorDe(cajaDelCobro(tx, R1, null))).message).toBe(MENSAJE_ELEGIR_CAJA)
    await expect(cajaDelCobro(tx, R1, 'c1')).resolves.toBe('a1')
    await expect(cajaDelCobro(tx, R1, 'c2')).resolves.toBe('a2')
  })

  it('el cajaId de la caja abierta de otro restaurante: 400, aunque los dos tengan turno abierto', async () => {
    const { tx } = txCon(
      [
        { id: 't1', restauranteId: R1, cerradoEn: null },
        { id: 't2', restauranteId: R2, cerradoEn: null },
      ],
      [
        { id: 'a1', turnoId: 't1', cajaId: 'c1', cerradoEn: null },
        { id: 'a2', turnoId: 't2', cajaId: 'c2', cerradoEn: null },
      ],
    )

    await expect(cajaDelCobro(tx, R1, undefined)).resolves.toBe('a1')
    expect((await errorDe(cajaDelCobro(tx, R1, 'c2'))).message).toBe(MENSAJE_CAJA_NO_ABIERTA)
  })

  it('una TurnoCaja cerrada en un turno abierto no cuenta', async () => {
    const { tx } = txCon(
      [{ id: 't1', restauranteId: R1, cerradoEn: null }],
      [
        { id: 'a1', turnoId: 't1', cajaId: 'c1', cerradoEn: null },
        { id: 'a2', turnoId: 't1', cajaId: 'c2', cerradoEn: CERRADO },
      ],
    )

    await expect(cajaDelCobro(tx, R1, undefined)).resolves.toBe('a1')
    expect((await errorDe(cajaDelCobro(tx, R1, 'c2'))).message).toBe(MENSAJE_CAJA_NO_ABIERTA)
  })

  it('una TurnoCaja abierta en un turno cerrado no cuenta', async () => {
    const { tx } = txCon([{ id: 't1', restauranteId: R1, cerradoEn: CERRADO }], [{ id: 'a1', turnoId: 't1', cajaId: 'c1', cerradoEn: null }])

    expect((await errorDe(cajaDelCobro(tx, R1, 'c1'))).message).toBe(MENSAJE_SIN_TURNO)
  })

  it('lee una sola vez, con el cliente que recibe', async () => {
    const { tx, findMany } = txCon([{ id: 't1', restauranteId: R1, cerradoEn: null }], [{ id: 'a1', turnoId: 't1', cajaId: 'c1', cerradoEn: null }])

    await cajaDelCobro(tx, R1, 'c1')

    expect(findMany).toHaveBeenCalledTimes(1)
  })
})

describe('cajaDeMercadoPago (#358)', () => {
  const R1 = 'rest-1'
  const R2 = 'rest-2'
  type Caja = { id: string; createdAt: Date }
  type AperturaConFecha = Apertura & { abiertoEn: Date }
  const dia = (n: number) => new Date(`2026-11-${String(n).padStart(2, '0')}T12:00:00Z`)

  // Como txCon, pero para findFirst: resuelve el where igual, ordena según el `orderBy` que recibe (por la fecha y el id
  // de la caja, o por abiertoEn; otra clave corta el test) y devuelve la primera. Sin orderBy, el orden de la lista.
  function txMp(turnos: Turno[], cajas: Caja[], aperturas: AperturaConFecha[]) {
    const findFirst = jest.fn(
      async ({ where, orderBy, select }: { where: Record<string, any>; orderBy?: Record<string, any>[]; select: object }) => {
        expect(select).toEqual({ id: true })
        const desconocido = Object.keys(where).find((k) => !['cerradoEn', 'turno'].includes(k))
        if (desconocido) throw new Error(`el test no sabe filtrar por ${desconocido}`)
        const filas = aperturas
          .filter((a) => !('cerradoEn' in where) || a.cerradoEn === null)
          .filter((a) => {
            const turno = turnos.find((t) => t.id === a.turnoId)
            if (!turno) return false
            if (where.turno?.restauranteId !== undefined && turno.restauranteId !== where.turno.restauranteId) return false
            if (where.turno && 'cerradoEn' in where.turno && turno.cerradoEn !== null) return false
            return true
          })
        const valor = (a: AperturaConFecha, clave: Record<string, any>): [number | string, 'asc' | 'desc'] => {
          if (clave.caja?.createdAt) return [cajas.find((c) => c.id === a.cajaId)!.createdAt.getTime(), clave.caja.createdAt]
          if (clave.caja?.id) return [a.cajaId, clave.caja.id]
          if (clave.abiertoEn) return [a.abiertoEn.getTime(), clave.abiertoEn]
          throw new Error(`el test no sabe ordenar por ${JSON.stringify(clave)}`)
        }
        const ordenadas = [...filas].sort((x, y) => {
          for (const clave of orderBy ?? []) {
            const [vx, sentido] = valor(x, clave)
            const [vy] = valor(y, clave)
            if (vx !== vy) return (vx < vy ? -1 : 1) * (sentido === 'desc' ? -1 : 1)
          }
          return 0
        })
        return ordenadas[0] ? { id: ordenadas[0].id } : null
      },
    )
    return { tx: { turnoCaja: { findFirst } } as unknown as Prisma.TransactionClient, findFirst }
  }

  const turnoAbierto: Turno = { id: 't1', restauranteId: R1, cerradoEn: null }

  it('dos cajas abiertas: la de Caja.createdAt más antigua, aunque esté segunda en la lista y se haya abierto después', async () => {
    const { tx } = txMp(
      [turnoAbierto],
      [
        { id: 'c-nueva', createdAt: dia(10) },
        { id: 'c-vieja', createdAt: dia(1) },
      ],
      [
        { id: 'a-nueva', turnoId: 't1', cajaId: 'c-nueva', cerradoEn: null, abiertoEn: dia(15) },
        { id: 'a-vieja', turnoId: 't1', cajaId: 'c-vieja', cerradoEn: null, abiertoEn: dia(16) },
      ],
    )

    await expect(cajaDeMercadoPago(tx, R1)).resolves.toBe('a-vieja')
  })

  it('con la misma Caja.createdAt, la de menor id (aunque esté segunda en la lista)', async () => {
    const { tx } = txMp(
      [turnoAbierto],
      [
        { id: 'c-b', createdAt: dia(1) },
        { id: 'c-a', createdAt: dia(1) },
      ],
      [
        { id: 'a-b', turnoId: 't1', cajaId: 'c-b', cerradoEn: null, abiertoEn: dia(15) },
        { id: 'a-a', turnoId: 't1', cajaId: 'c-a', cerradoEn: null, abiertoEn: dia(15) },
      ],
    )

    await expect(cajaDeMercadoPago(tx, R1)).resolves.toBe('a-a')
  })

  it('una TurnoCaja cerrada no cuenta, aunque su caja sea la más antigua', async () => {
    const { tx } = txMp(
      [turnoAbierto],
      [
        { id: 'c-vieja', createdAt: dia(1) },
        { id: 'c-nueva', createdAt: dia(10) },
      ],
      [
        { id: 'a-vieja', turnoId: 't1', cajaId: 'c-vieja', cerradoEn: dia(15), abiertoEn: dia(15) },
        { id: 'a-nueva', turnoId: 't1', cajaId: 'c-nueva', cerradoEn: null, abiertoEn: dia(15) },
      ],
    )

    await expect(cajaDeMercadoPago(tx, R1)).resolves.toBe('a-nueva')
  })

  it('la caja más antigua de otro restaurante (con su turno abierto) no cuenta', async () => {
    const { tx } = txMp(
      [{ id: 't2', restauranteId: R2, cerradoEn: null }, turnoAbierto],
      [
        { id: 'c-ajena', createdAt: dia(1) },
        { id: 'c-propia', createdAt: dia(10) },
      ],
      [
        { id: 'a-ajena', turnoId: 't2', cajaId: 'c-ajena', cerradoEn: null, abiertoEn: dia(15) },
        { id: 'a-propia', turnoId: 't1', cajaId: 'c-propia', cerradoEn: null, abiertoEn: dia(15) },
      ],
    )

    await expect(cajaDeMercadoPago(tx, R1)).resolves.toBe('a-propia')
  })

  it('una TurnoCaja abierta de un turno cerrado no cuenta: sin turno abierto, null', async () => {
    const { tx } = txMp(
      [{ id: 't0', restauranteId: R1, cerradoEn: dia(14) }],
      [{ id: 'c1', createdAt: dia(1) }],
      [{ id: 'a0', turnoId: 't0', cajaId: 'c1', cerradoEn: null, abiertoEn: dia(13) }],
    )

    await expect(cajaDeMercadoPago(tx, R1)).resolves.toBeNull()
  })

  it('sin ningún turno: null, sin lanzar', async () => {
    const { tx } = txMp([], [], [])

    await expect(cajaDeMercadoPago(tx, R1)).resolves.toBeNull()
  })

  it('una sola consulta, con el cliente que recibe, el where de las aperturas abiertas y el orden de la caja', async () => {
    const { tx, findFirst } = txMp(
      [turnoAbierto],
      [{ id: 'c1', createdAt: dia(1) }],
      [{ id: 'a1', turnoId: 't1', cajaId: 'c1', cerradoEn: null, abiertoEn: dia(15) }],
    )

    await cajaDeMercadoPago(tx, R1)

    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(findFirst).toHaveBeenCalledWith({
      where: { cerradoEn: null, turno: { restauranteId: R1, cerradoEn: null } },
      orderBy: [{ caja: { createdAt: 'asc' } }, { caja: { id: 'asc' } }],
      select: { id: true },
    })
  })
})
