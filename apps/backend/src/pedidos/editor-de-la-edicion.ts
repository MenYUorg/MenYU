import { Prisma } from '@prisma/client'

/**
 * Quién editó un pedido. Desde la Fase 4 de auth la edición guarda la cuenta (`usuarioId`) y, si la hizo como mozo,
 * también su `Mozo`. Las ediciones anteriores tienen `adminId` (el login propio, hasta la Fase 5) o solo `mozoId`.
 */
export const EDITOR_INCLUDE = {
  usuario: { select: { nombre: true } },
  admin: { select: { email: true } },
  mozo: { select: { nombre: true } },
} satisfies Prisma.PedidoEdicionInclude

export interface EdicionConEditor {
  adminId: string | null
  mozoId: string | null
  usuarioId: string | null
  usuario: { nombre: string } | null
  admin: { email: string } | null
  mozo: { nombre: string } | null
}

export interface EditorDeLaEdicion {
  nombre: string
  tipo: 'gerente' | 'mozo'
}

export function editorDe(e: EdicionConEditor): EditorDeLaEdicion {
  const comoGerente = e.adminId !== null || (e.usuarioId !== null && e.mozoId === null)
  return {
    nombre: e.mozo?.nombre ?? e.usuario?.nombre ?? e.admin?.email ?? 'Desconocido',
    tipo: comoGerente ? 'gerente' : 'mozo',
  }
}
