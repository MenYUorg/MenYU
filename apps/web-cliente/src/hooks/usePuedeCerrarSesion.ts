import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { useSessionStore } from '../store/sessionStore'

/** ¿Algún pedido de la mesa que no esté anulado? (los pedidos son de la mesa: los de cualquier comensal cuentan). */
export function hayPedidosVigentes(pedidos: unknown[]): boolean {
  return pedidos.some((p) => (p as { estado?: unknown } | null)?.estado !== 'anulado')
}

interface Opciones {
  /** El menú lateral está abierto (se consulta cada vez que se abre, para que cuente lo último que se pidió). */
  abierto: boolean
  /** La persona tiene cuenta (inició sesión en este navegador): sin cuenta no hay sesión que cerrar. */
  conCuenta: boolean
}

/**
 * ¿Se le puede ofrecer "Cerrar sesión"? Sí si no está en una mesa, o si está en una mesa que todavía no pidió nada; no si
 * la mesa ya pidió algo (un pedido que no esté anulado). Si no se puede saber si pidió (la consulta falla o todavía no
 * llegó), no se ofrece: es lo más seguro.
 */
export function usePuedeCerrarSesion({ abierto, conCuenta }: Opciones): boolean {
  const sesionId = useSessionStore((s) => s.sesionId)
  const jwt = useSessionStore((s) => s.jwt)
  const enMesa = !!sesionId && !!jwt
  // Lo último que se supo, de qué mesa: con otra mesa no vale.
  const [sabido, setSabido] = useState<{ sesionId: string; yaPidio: boolean } | null>(null)

  useEffect(() => {
    if (!abierto || !conCuenta || !sesionId || !jwt) return
    let vigente = true
    api.orders
      .list(jwt)
      .then((pedidos) => { if (vigente) setSabido({ sesionId, yaPidio: hayPedidosVigentes(pedidos) }) })
      .catch(() => { if (vigente) setSabido(null) })
    return () => { vigente = false }
  }, [abierto, conCuenta, sesionId, jwt])

  if (!conCuenta) return false
  if (!enMesa) return true
  return sabido?.sesionId === sesionId && sabido.yaPidio === false
}
