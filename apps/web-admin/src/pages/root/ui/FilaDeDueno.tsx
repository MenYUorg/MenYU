import { Link } from 'react-router-dom'
import { UserMinus } from 'lucide-react'
import { MenuDeAcciones, Sigla } from './piezas'

interface FilaDeDuenoProps {
  nombre: string
  email: string
  /** En la lista general: de qué marca es dueño (se abre con un toque). En el detalle de una marca no hace falta. */
  marca?: { id: string; nombre: string; activo: boolean }
  /** Su cuenta está desactivada: no entra a ningún lado aunque conserve la membresía. Solo la lista general lo sabe. */
  desactivada?: boolean
  onQuitar: () => void
}

/** Un dueño: su nombre, su email y, si hace falta, su marca. Su único menú es "Quitar acceso". */
export function FilaDeDueno({ nombre, email, marca, desactivada = false, onQuitar }: FilaDeDuenoProps) {
  return (
    <div className="item">
      <Sigla nombre={nombre} />
      <div className="item-txt">
        <b>{nombre}</b>
        <small className="cortar2">{email}</small>
        {marca && (
          <small>
            <Link to={`/root/marcas/${marca.id}`}>{marca.nombre}</Link>
            {!marca.activo && ' · marca de baja'}
          </small>
        )}
        {desactivada && (
          <div className="item-chips">
            <span className="chip chip-aviso" title="Su cuenta está desactivada: no entra a ningún lado">
              Cuenta desactivada
            </span>
          </div>
        )}
      </div>
      <MenuDeAcciones
        // Una persona puede ser dueña de más de una marca: sin la marca, las filas tendrían la misma etiqueta.
        etiqueta={`Acciones de ${nombre}${marca ? ` (${marca.nombre})` : ''}`}
        opciones={[{ texto: 'Quitar acceso', icono: UserMinus, peligro: true, onElegir: onQuitar }]}
      />
    </div>
  )
}
