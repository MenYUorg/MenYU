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
    observaciones: string | null
  }[]
  turnoCajas: { id: string; turnoId: string; cajaId: string; fondoInicial: Prisma.Decimal; abiertoEn: Date }[]
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
