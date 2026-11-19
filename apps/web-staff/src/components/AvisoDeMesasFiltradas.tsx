import type { CajaAbierta } from '@menyu/types'
import { useRolesActuales } from '../store/contextoStore'
import { debeAvisarMesasFiltradas, TEXTO_DE_MESAS_FILTRADAS } from '../utils/avisoDeMesasFiltradas'

/**
 * Avisa a un mozo que, con el turno abierto, ve sus mesas y las que no tienen mozo asignado. Recibe las `cajas` que ya
 * leyó la pantalla: no pide nada.
 */
export function AvisoDeMesasFiltradas({ cajas }: { cajas: CajaAbierta[] | null }) {
  const roles = useRolesActuales()
  if (!debeAvisarMesasFiltradas(roles, cajas)) return null

  return (
    <p
      role="note"
      style={{
        fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#6B7280', background: '#EEF0F8',
        border: '1px solid #E6E8EF', borderRadius: 8, padding: '8px 12px', margin: '0 0 14px',
      }}
    >
      {TEXTO_DE_MESAS_FILTRADAS}
    </p>
  )
}
