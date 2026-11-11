import { Prisma } from '@prisma/client'
import { PrismaMock } from './prisma-mock'

// Una base en memoria para los specs de la caja (#357): el mock de Prisma responde según los `where` que recibe, así un
// service al que le falta un filtro (por restaurante, por activo) devuelve filas de más y el test lo nota.

export interface BaseDeCaja {
  usuarios: Record<string, string>
  cajas: { id: string; restauranteId: string; nombre: string; activa: boolean }[]
  mesas: { id: string; restauranteId: string; numero: string; activo: boolean }[]
  mozos: { id: string; restauranteId: string; nombre: string; activo: boolean; usuarioId: string | null }[]
  mozoMesas: { mesaId: string; mozoId: string }[]
  turnos: {
    id: string
    restauranteId: string
    abiertoPorUsuarioId: string
    abiertoEn: Date
    cerradoEn: Date | null
    cerradoPorUsuarioId?: string | null
    observaciones: string | null
  }[]
  turnoCajas: {
    id: string
    turnoId: string
    cajaId: string
    fondoInicial: Prisma.Decimal
    abiertoEn: Date
    cerradoEn?: Date | null
  }[]
  asignaciones: { turnoId: string; mesaId: string; mozoId: string }[]
  movimientos: {
    id: string
    turnoCajaId: string
    tipo: string
    monto: Prisma.Decimal
    motivo: string
    usuarioId: string
    createdAt: Date
  }[]
  pagos: {
    id: string
    turnoCajaId: string | null
    metodo: string
    estado: string
    monto: Prisma.Decimal
    propina: Prisma.Decimal
    sesionId?: string
    mozoId?: string | null
    fechaCobro?: Date | null
    requiereRevision?: boolean
  }[]
  arqueos: {
    turnoCajaId: string
    metodo: string
    esperado: Prisma.Decimal
    declarado: Prisma.Decimal
    diferencia: Prisma.Decimal
  }[]
  sesiones: { id: string; mesaId: string; estado: string; iniciadaEn: Date }[]
}

export function baseDeCajaVacia(): BaseDeCaja {
  return {
    usuarios: {},
    cajas: [],
    mesas: [],
    mozos: [],
    mozoMesas: [],
    turnos: [],
    turnoCajas: [],
    asignaciones: [],
    movimientos: [],
    pagos: [],
    arqueos: [],
    sesiones: [],
  }
}

type Donde = { id?: string | { in: string[] }; restauranteId?: string; cerradoEn?: null }

/** Si la fila cumple el `where` (solo los filtros que usa la caja: id, id in, restauranteId y cerradoEn null). */
function cumple(fila: { id: string; restauranteId?: string; cerradoEn?: Date | null }, where: Donde = {}): boolean {
  if (typeof where.id === 'string' && fila.id !== where.id) return false
  if (typeof where.id === 'object' && !where.id.in.includes(fila.id)) return false
  if (where.restauranteId !== undefined && fila.restauranteId !== where.restauranteId) return false
  if (where.cerradoEn === null && fila.cerradoEn !== null) return false
  return true
}

type RangoDeFechas = { gte?: Date; gt?: Date; lte?: Date; lt?: Date }
type DondePago = {
  turnoCajaId?: string
  turnoCaja?: { turnoId: string }
  metodo?: string
  estado?: string
  fechaCobro?: RangoDeFechas
  sesion?: { mesa: { restauranteId: string } }
}
const FILTROS_DE_PAGO = new Set(['turnoCajaId', 'turnoCaja', 'metodo', 'estado', 'fechaCobro', 'sesion'])

/**
 * Si el pago cumple el `where` de la caja: su apertura o el turno de su apertura, el método, el estado, el rango de
 * `fechaCobro` (un pago sin fecha no entra en ningún rango) y el restaurante de la mesa de su sesión. Un filtro que no
 * conoce corta el test: así un service no filtra por algo que la base en memoria ignora en silencio.
 */
function cumplePago(base: BaseDeCaja, pago: BaseDeCaja['pagos'][number], where: DondePago = {}): boolean {
  const desconocido = Object.keys(where).find((k) => !FILTROS_DE_PAGO.has(k))
  if (desconocido) throw new Error(`caja-en-memoria: pago.findMany no sabe filtrar por ${desconocido}`)
  if (where.turnoCajaId !== undefined && pago.turnoCajaId !== where.turnoCajaId) return false
  if (where.turnoCaja && base.turnoCajas.find((tc) => tc.id === pago.turnoCajaId)?.turnoId !== where.turnoCaja.turnoId) return false
  if (where.metodo !== undefined && pago.metodo !== where.metodo) return false
  if (where.estado !== undefined && pago.estado !== where.estado) return false
  if (where.fechaCobro) {
    const fecha = pago.fechaCobro?.getTime()
    const { gte, gt, lte, lt } = where.fechaCobro
    if (fecha === undefined) return false
    if ((gte && fecha < gte.getTime()) || (gt && fecha <= gt.getTime())) return false
    if ((lte && fecha > lte.getTime()) || (lt && fecha >= lt.getTime())) return false
  }
  if (where.sesion) {
    const sesion = base.sesiones.find((s) => s.id === pago.sesionId)
    if (base.mesas.find((m) => m.id === sesion?.mesaId)?.restauranteId !== where.sesion.mesa.restauranteId) return false
  }
  return true
}

/** Corta el test si los argumentos traen algo que la base en memoria no sabe resolver (para que no lo ignore en silencio). */
function soloConoce(operacion: string, objeto: object | undefined, conocidas: string[]): void {
  const desconocida = Object.keys(objeto ?? {}).find((k) => !conocidas.includes(k))
  if (desconocida) throw new Error(`caja-en-memoria: ${operacion} no sabe resolver ${desconocida}`)
}

/** Las filas cuyo `turnoCajaId` cumple el `where` de la caja: un id, una lista (`in`) o sin filtro (todas). */
function porApertura<T extends { turnoCajaId: string }>(filas: T[], where: { turnoCajaId?: string | { in: string[] } } | undefined): T[] {
  soloConoce('el where por apertura', where, ['turnoCajaId'])
  const filtro = where?.turnoCajaId
  if (filtro === undefined) return filas
  if (typeof filtro === 'string') return filas.filter((f) => f.turnoCajaId === filtro)
  soloConoce('el filtro de turnoCajaId', filtro, ['in'])
  return filas.filter((f) => filtro.in.includes(f.turnoCajaId))
}

/** El turno con la forma de TURNO_SELECT. */
function leerTurno(base: BaseDeCaja, turno: BaseDeCaja['turnos'][number]) {
  const nombreDeCaja = (id: string) => base.cajas.find((c) => c.id === id)?.nombre ?? ''
  const numeroDeMesa = (id: string) => base.mesas.find((m) => m.id === id)?.numero ?? ''
  return {
    id: turno.id,
    restauranteId: turno.restauranteId,
    abiertoEn: turno.abiertoEn,
    cerradoEn: turno.cerradoEn,
    observaciones: turno.observaciones,
    abiertoPor: { id: turno.abiertoPorUsuarioId, nombre: base.usuarios[turno.abiertoPorUsuarioId] ?? '' },
    cerradoPor: turno.cerradoPorUsuarioId ? { id: turno.cerradoPorUsuarioId, nombre: base.usuarios[turno.cerradoPorUsuarioId] ?? '' } : null,
    cajas: base.turnoCajas
      .filter((tc) => tc.turnoId === turno.id)
      .map((tc) => ({ id: tc.id, cajaId: tc.cajaId, fondoInicial: tc.fondoInicial, abiertoEn: tc.abiertoEn, caja: { nombre: nombreDeCaja(tc.cajaId) } }))
      .sort((a, b) => a.caja.nombre.localeCompare(b.caja.nombre)),
    asignaciones: base.asignaciones
      .filter((a) => a.turnoId === turno.id)
      .map((a) => ({
        mesaId: a.mesaId,
        mozoId: a.mozoId,
        mesa: { numero: numeroDeMesa(a.mesaId) },
        mozo: { nombre: base.mozos.find((m) => m.id === a.mozoId)?.nombre ?? '' },
      }))
      .sort((a, b) => a.mesa.numero.localeCompare(b.mesa.numero)),
  }
}

/** Conecta el mock de Prisma a la base: lo que la apertura lee y escribe. */
export function conectarBaseDeCaja(prisma: PrismaMock, base: BaseDeCaja): void {
  let siguiente = 0
  const nuevoId = (prefijo: string) => `${prefijo}-${++siguiente}`

  prisma.turno.findFirst.mockImplementation(async ({ where }) => {
    const turno = base.turnos.find((t) => cumple(t, where))
    return turno ? leerTurno(base, turno) : null
  })
  prisma.turno.findUnique.mockImplementation(async ({ where }) => {
    const turno = base.turnos.find((t) => t.id === where.id)
    return turno ? leerTurno(base, turno) : null
  })
  prisma.turno.findUniqueOrThrow.mockImplementation(async ({ where }) => {
    const turno = base.turnos.find((t) => t.id === where.id)
    if (!turno) throw new Error(`turno ${where.id} no encontrado`)
    return leerTurno(base, turno)
  })
  prisma.turno.create.mockImplementation(async ({ data }) => {
    const turno = { id: nuevoId('turno'), abiertoEn: new Date('2026-11-10T20:00:00Z'), cerradoEn: null, ...data }
    base.turnos.push(turno)
    return { id: turno.id }
  })
  prisma.turnoCaja.create.mockImplementation(async ({ data }) => {
    const fila = { id: nuevoId('apertura'), abiertoEn: new Date('2026-11-10T20:00:00Z'), ...data }
    base.turnoCajas.push(fila)
    return { id: fila.id }
  })
  prisma.turnoCaja.findFirst.mockImplementation(async ({ where }) => {
    const fila = base.turnoCajas.find((tc) => tc.turnoId === where.turnoId && tc.cajaId === where.cajaId)
    return fila ? { id: fila.id } : null
  })
  prisma.movimientoCaja.create.mockImplementation(async ({ data }) => {
    const fila = { id: nuevoId('movimiento'), createdAt: new Date('2026-11-10T21:00:00Z'), ...data }
    base.movimientos.push(fila)
    const apertura = base.turnoCajas.find((tc) => tc.id === fila.turnoCajaId)
    const caja = base.cajas.find((c) => c.id === apertura?.cajaId)
    // Con la forma de MOVIMIENTO_SELECT (movimientos.service.ts).
    return {
      id: fila.id,
      tipo: fila.tipo,
      monto: fila.monto,
      motivo: fila.motivo,
      createdAt: fila.createdAt,
      usuario: { id: fila.usuarioId, nombre: base.usuarios[fila.usuarioId] ?? '' },
      turnoCaja: { cajaId: apertura?.cajaId ?? '', caja: { nombre: caja?.nombre ?? '' } },
    }
  })
  prisma.turno.update.mockImplementation(async ({ where, data }) => {
    const turno = base.turnos.find((t) => t.id === where.id)
    if (!turno) throw new Error(`turno ${where.id} no encontrado`)
    Object.assign(turno, data)
    return { id: turno.id }
  })
  prisma.turnoCaja.findMany.mockImplementation(async ({ where }) =>
    base.turnoCajas
      .filter((tc) => tc.turnoId === where.turnoId)
      .map((tc) => ({
        id: tc.id,
        cajaId: tc.cajaId,
        fondoInicial: tc.fondoInicial,
        caja: { nombre: base.cajas.find((c) => c.id === tc.cajaId)?.nombre ?? '' },
      }))
      .sort((a, b) => a.caja.nombre.localeCompare(b.caja.nombre)),
  )
  prisma.turnoCaja.updateMany.mockImplementation(async ({ where, data }) => {
    const filas = base.turnoCajas.filter((tc) => tc.turnoId === where.turnoId && (tc.cerradoEn ?? null) === null)
    for (const fila of filas) Object.assign(fila, data)
    return { count: filas.length }
  })
  prisma.movimientoCaja.findMany.mockImplementation(async ({ where }) =>
    base.movimientos.filter((m) => m.turnoCajaId === where.turnoCajaId).map((m) => ({ tipo: m.tipo, monto: m.monto })),
  )
  // Sin `where`, todos: un service que se olvida de un filtro cuenta pagos ajenos y el test lo nota. Devuelve todo lo que
  // leen el cierre y el resumen (con la mesa de la sesión y el nombre del mozo), y respeta el orden por `fechaCobro`.
  prisma.pago.findMany.mockImplementation(async (args) => {
    const filas = base.pagos.filter((p) => cumplePago(base, p, args?.where))
    if (args?.orderBy?.fechaCobro === 'asc') filas.sort((a, b) => (a.fechaCobro?.getTime() ?? 0) - (b.fechaCobro?.getTime() ?? 0))
    return filas.map((p) => {
      const sesion = base.sesiones.find((s) => s.id === p.sesionId)
      const mozo = base.mozos.find((m) => m.id === p.mozoId)
      return {
        id: p.id,
        metodo: p.metodo,
        estado: p.estado,
        monto: p.monto,
        propina: p.propina,
        mozoId: p.mozoId ?? null,
        mozo: mozo ? { nombre: mozo.nombre } : null,
        fechaCobro: p.fechaCobro ?? null,
        requiereRevision: p.requiereRevision ?? false,
        sesion: { mesa: { numero: base.mesas.find((m) => m.id === sesion?.mesaId)?.numero ?? '' } },
      }
    })
  })
  // El historial: where por restaurante, orden de lista (abiertoEn e id), take y cursor inclusivo, como Prisma.
  prisma.turno.findMany.mockImplementation(async (args) => {
    soloConoce('turno.findMany', args, ['where', 'orderBy', 'take', 'cursor', 'select'])
    soloConoce('el where de turno.findMany', args.where, ['restauranteId'])
    const orden: Record<string, 'asc' | 'desc'>[] = args.orderBy ?? []
    for (const o of orden) soloConoce('el orderBy de turno.findMany', o, ['abiertoEn', 'id'])
    const valor = (t: BaseDeCaja['turnos'][number], campo: string) => (campo === 'abiertoEn' ? t.abiertoEn.getTime() : t.id)
    let filas = base.turnos
      .filter((t) => args.where?.restauranteId === undefined || t.restauranteId === args.where.restauranteId)
      .sort((a, b) => {
        for (const o of orden) {
          const [campo, sentido] = Object.entries(o)[0]
          const [va, vb] = [valor(a, campo), valor(b, campo)]
          if (va !== vb) return (va < vb ? -1 : 1) * (sentido === 'desc' ? -1 : 1)
        }
        return 0
      })
    if (args.cursor) {
      soloConoce('el cursor de turno.findMany', args.cursor, ['id'])
      const desde = filas.findIndex((t) => t.id === args.cursor.id)
      filas = desde === -1 ? [] : filas.slice(desde)
    }
    if (args.take !== undefined) filas = filas.slice(0, args.take)
    return filas.map((t) => leerTurno(base, t))
  })
  // Los totales de los movimientos por apertura y tipo.
  prisma.movimientoCaja.groupBy.mockImplementation(async (args) => {
    soloConoce('movimientoCaja.groupBy', args, ['by', 'where', '_count', '_sum'])
    if (JSON.stringify(args.by) !== JSON.stringify(['turnoCajaId', 'tipo'])) throw new Error('caja-en-memoria: groupBy solo por turnoCajaId y tipo')
    const grupos = new Map<string, { turnoCajaId: string; tipo: string; _count: { _all: number }; _sum: { monto: Prisma.Decimal } }>()
    for (const m of porApertura(base.movimientos, args.where)) {
      const clave = `${m.turnoCajaId}|${m.tipo}`
      const grupo = grupos.get(clave) ?? { turnoCajaId: m.turnoCajaId, tipo: m.tipo, _count: { _all: 0 }, _sum: { monto: new Prisma.Decimal(0) } }
      grupo._count._all += 1
      grupo._sum.monto = grupo._sum.monto.plus(m.monto)
      grupos.set(clave, grupo)
    }
    return [...grupos.values()]
  })
  prisma.arqueoMetodo.findMany.mockImplementation(async (args) => {
    soloConoce('arqueoMetodo.findMany', args, ['where', 'select'])
    return porApertura(base.arqueos, args?.where).map((a) => ({ ...a }))
  })
  prisma.arqueoMetodo.createMany.mockImplementation(async ({ data }) => {
    base.arqueos.push(...data)
    return { count: data.length }
  })
  prisma.sesionMesa.findMany.mockImplementation(async ({ where }) =>
    base.sesiones
      .filter((s) => s.estado === where.estado)
      .filter((s) => base.mesas.find((m) => m.id === s.mesaId)?.restauranteId === where.mesa.restauranteId)
      .sort((a, b) => a.iniciadaEn.getTime() - b.iniciadaEn.getTime())
      .map((s) => ({ mesaId: s.mesaId, iniciadaEn: s.iniciadaEn, mesa: { numero: base.mesas.find((m) => m.id === s.mesaId)?.numero ?? '' } })),
  )
  prisma.asignacionTurno.deleteMany.mockImplementation(async ({ where }) => {
    const antes = base.asignaciones.length
    base.asignaciones = base.asignaciones.filter((a) => a.turnoId !== where.turnoId)
    return { count: antes - base.asignaciones.length }
  })
  prisma.asignacionTurno.createMany.mockImplementation(async ({ data }) => {
    base.asignaciones.push(...data)
    return { count: data.length }
  })
  prisma.caja.findMany.mockImplementation(async ({ where }) => base.cajas.filter((c) => cumple(c, where)))
  prisma.mozo.findMany.mockImplementation(async ({ where }) => base.mozos.filter((m) => cumple(m, where)))
  prisma.mesa.findMany.mockImplementation(async ({ where }) =>
    base.mesas
      .filter((m) => cumple(m, where))
      .map((m) => ({
        ...m,
        mozoMesas: base.mozoMesas
          .filter((mm) => mm.mesaId === m.id)
          .map((mm) => {
            const mozo = base.mozos.find((z) => z.id === mm.mozoId)
            return { mozo: { id: mm.mozoId, activo: mozo?.activo ?? false, usuarioId: mozo?.usuarioId ?? null } }
          }),
      })),
  )
}
