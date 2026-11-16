import { Prisma } from '@prisma/client'

/** Una mesa del restaurante con los mozos que la tienen en su plantilla (`MozoMesa`). */
export interface MesaParaPrecarga {
  id: string
  numero: string
  activo: boolean
  mozoMesas: { mozo: { id: string; activo: boolean; usuarioId: string | null } }[]
}

export type MotivoSinAsignar = 'varios-mozos' | 'mozo-inactivo' | 'mozo-sin-cuenta'

export interface AvisoDePrecarga {
  mesaId: string
  mesaNumero: string
  motivo: MotivoSinAsignar
}

export interface PrecargaDeAsignaciones {
  asignaciones: { mesaId: string; mozoId: string }[]
  avisos: AvisoDePrecarga[]
}

/**
 * Las asignaciones de un turno nuevo a partir de la plantilla de `MozoMesa` (#357). Una mesa activa se asigna solo si
 * tiene exactamente un mozo, y ese mozo está activo y tiene cuenta. Una mesa sin mozos queda sin asignar (la ven todos) y
 * no avisa; una con varios mozos, o con su único mozo dado de baja o sin cuenta, queda sin asignar y avisa por qué. Las
 * mesas dadas de baja no cuentan.
 */
export function precargarAsignaciones(mesas: MesaParaPrecarga[]): PrecargaDeAsignaciones {
  const precarga: PrecargaDeAsignaciones = { asignaciones: [], avisos: [] }

  for (const mesa of mesas) {
    if (!mesa.activo || mesa.mozoMesas.length === 0) continue

    const motivo = motivoSinAsignar(mesa)
    if (motivo) precarga.avisos.push({ mesaId: mesa.id, mesaNumero: mesa.numero, motivo })
    else precarga.asignaciones.push({ mesaId: mesa.id, mozoId: mesa.mozoMesas[0].mozo.id })
  }
  return precarga
}

/**
 * La precarga del restaurante desde la base: sus mesas, con la plantilla de `MozoMesa`, pasadas por precargarAsignaciones.
 * La única consulta de la precarga: la usan la apertura sin `asignaciones` (con el `tx` de su transacción) y GET
 * /turnos/preparacion (con el cliente de Prisma), así las dos proponen siempre lo mismo.
 */
export async function precargar(db: Pick<Prisma.TransactionClient, 'mesa'>, restauranteId: string): Promise<PrecargaDeAsignaciones> {
  const mesas = await db.mesa.findMany({
    where: { restauranteId },
    orderBy: { numero: 'asc' },
    select: {
      id: true,
      numero: true,
      activo: true,
      mozoMesas: { select: { mozo: { select: { id: true, activo: true, usuarioId: true } } } },
    },
  })
  return precargarAsignaciones(mesas)
}

function motivoSinAsignar(mesa: MesaParaPrecarga): MotivoSinAsignar | null {
  if (mesa.mozoMesas.length > 1) return 'varios-mozos'
  const { mozo } = mesa.mozoMesas[0]
  if (!mozo.activo) return 'mozo-inactivo'
  if (mozo.usuarioId === null) return 'mozo-sin-cuenta'
  return null
}
