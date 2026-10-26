import { Prisma } from '@prisma/client'

/**
 * Quién editó un pedido. Desde la Fase 4 de auth la edición guarda la cuenta (`usuarioId`) y, si la hizo como mozo,
 * también su `Mozo`. Las ediciones anteriores guardaban el `Admin` del login propio: la Fase 5 pasó a `usuarioId` las
 * de quienes después tuvieron cuenta con el mismo email y borró la columna, así que las que quedaron sin ninguno de
 * los dos se muestran como "Desconocido", igual que las de un mozo que ya no está.
 */
export const EDITOR_INCLUDE = {
  usuario: { select: { nombre: true } },
  mozo: { select: { nombre: true } },
} satisfies Prisma.PedidoEdicionInclude

export interface EdicionConEditor {
  mozoId: string | null
  usuarioId: string | null
  usuario: { nombre: string } | null
  mozo: { nombre: string } | null
}

export interface EditorDeLaEdicion {
  nombre: string
  tipo: 'gerente' | 'mozo'
}

export function editorDe(e: EdicionConEditor): EditorDeLaEdicion {
  const comoGerente = e.usuarioId !== null && e.mozoId === null
  return {
    nombre: e.mozo?.nombre ?? e.usuario?.nombre ?? 'Desconocido',
    tipo: comoGerente ? 'gerente' : 'mozo',
  }
}
