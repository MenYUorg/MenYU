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

function motivoSinAsignar(mesa: MesaParaPrecarga): MotivoSinAsignar | null {
  if (mesa.mozoMesas.length > 1) return 'varios-mozos'
  const { mozo } = mesa.mozoMesas[0]
  if (!mozo.activo) return 'mozo-inactivo'
  if (mozo.usuarioId === null) return 'mozo-sin-cuenta'
  return null
}
