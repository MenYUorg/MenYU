import { Prisma } from '@prisma/client'

/** Lo que se lee de un turno para responder: quién lo abrió, sus cajas con el fondo y las mesas asignadas. */
export const TURNO_SELECT = {
  id: true,
  restauranteId: true,
  abiertoEn: true,
  cerradoEn: true,
  observaciones: true,
  abiertoPor: { select: { id: true, nombre: true } },
  cajas: {
    select: { id: true, cajaId: true, fondoInicial: true, abiertoEn: true, caja: { select: { nombre: true } } },
    orderBy: { caja: { nombre: 'asc' } },
  },
  asignaciones: {
    select: { mesaId: true, mozoId: true, mesa: { select: { numero: true } }, mozo: { select: { nombre: true } } },
    orderBy: { mesa: { numero: 'asc' } },
  },
} satisfies Prisma.TurnoSelect

export type TurnoLeido = Prisma.TurnoGetPayload<{ select: typeof TURNO_SELECT }>

/** El turno como lo devuelve la API: los montos como number y los nombres de la caja, la mesa y el mozo al lado del id. */
export function turnoParaLaApi(turno: TurnoLeido) {
  return {
    id: turno.id,
    restauranteId: turno.restauranteId,
    abiertoEn: turno.abiertoEn,
    abiertoPor: turno.abiertoPor,
    cerradoEn: turno.cerradoEn,
    observaciones: turno.observaciones,
    cajas: turno.cajas.map((c) => ({
      id: c.id,
      cajaId: c.cajaId,
      nombre: c.caja.nombre,
      fondoInicial: c.fondoInicial.toNumber(),
      abiertoEn: c.abiertoEn,
    })),
    asignaciones: turno.asignaciones.map((a) => ({
      mesaId: a.mesaId,
      mesaNumero: a.mesa.numero,
      mozoId: a.mozoId,
      mozoNombre: a.mozo.nombre,
    })),
  }
}

export type TurnoDeLaApi = ReturnType<typeof turnoParaLaApi>
