import type { Comanda } from '@menyu/types'
import { api } from '../../../services/api'
import { PantallaDeAbm } from '../abm/PantallaDeAbm'
import { CONFIG_DE_COMANDAS } from './config'

const leerComandas = async (restauranteId: string): Promise<{ items: Comanda[]; extra: undefined }> => ({
  items: await api.comandas.listar(restauranteId),
  extra: undefined,
})
const crearComanda = (restauranteId: string, nombre: string) => api.comandas.crear(restauranteId, nombre)
const actualizarComanda = (id: string, cambios: { nombre?: string; activa?: boolean }) => api.comandas.actualizar(id, cambios)

/**
 * Las comandas del restaurante (#344): crearlas, renombrarlas, activarlas y desactivarlas (no se borran; el backend no
 * deja desactivar una con platos asignados). OWNER y GERENTE. Es el ABM común con la configuración de las comandas.
 */
export function ComandasPage() {
  return (
    <PantallaDeAbm
      config={CONFIG_DE_COMANDAS}
      leer={leerComandas}
      crear={crearComanda}
      actualizar={actualizarComanda}
    />
  )
}
