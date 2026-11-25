import type { CajaDelRestaurante } from '@menyu/types'
import { api } from '../../../services/api'
import { PantallaDeAbm } from '../abm/PantallaDeAbm'
import type { Bloqueo } from '../abm/tipos'
import { CONFIG_DE_CAJAS } from './config'

const BLOQUEO_CAJA_ABIERTA: Bloqueo = {
  pastilla: 'Abierta en el turno',
  ayuda: 'No se puede desactivar con el turno abierto: se cierra desde la app del personal, en Caja',
}

/** La lista y las cajas abiertas del turno. `extra` en null: las abiertas no se pudieron leer (falla abierta: no se marca ninguna y decide el backend). */
async function leerCajas(restauranteId: string): Promise<{ items: CajaDelRestaurante[]; extra: string[] | null }> {
  const [items, extra] = await Promise.all([
    api.cajas.listar(restauranteId),
    api.cajas.abiertas(restauranteId).then((r) => r.cajas.map((c) => c.cajaId), () => null),
  ])
  return { items, extra }
}

const crearCaja = (restauranteId: string, nombre: string) => api.cajas.crear(restauranteId, nombre)
const actualizarCaja = (id: string, cambios: { nombre?: string; activa?: boolean }) => api.cajas.actualizar(id, cambios)
const bloqueoDeCaja = (caja: CajaDelRestaurante, abiertas: string[] | null): Bloqueo | null =>
  abiertas?.includes(caja.id) ? BLOQUEO_CAJA_ABIERTA : null

/**
 * Las cajas del restaurante (#360): crearlas, renombrarlas, activarlas y desactivarlas (no se borran). OWNER y GERENTE.
 * Es el ABM común con la configuración de las cajas; una caja abierta en el turno no se puede desactivar.
 */
export function CajasPage() {
  return (
    <PantallaDeAbm
      config={CONFIG_DE_CAJAS}
      leer={leerCajas}
      crear={crearCaja}
      actualizar={actualizarCaja}
      bloqueoDe={bloqueoDeCaja}
    />
  )
}
