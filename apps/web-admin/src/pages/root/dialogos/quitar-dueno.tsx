import { Mail } from 'lucide-react'
import { api } from '../../../services/api'
import { Aviso } from '../ui/piezas'
import { Dialogo } from '../ui/Dialogo'
import { AvisoDeError } from './AvisoDeError'
import { useEnvio } from './envio'

interface DialogoQuitarDuenoProps {
  dueno: { membresiaId: string; nombre: string; email: string }
  marcaNombre: string
  onHecho: () => void
  onCerrar: () => void
}

/**
 * Quitarle a un dueño el acceso a su marca. Se borra su membresía y nada más: la cuenta de la persona queda (puede ser dueña de
 * otra marca o tener otro rol) y la marca y sus restaurantes no se tocan.
 */
export function DialogoQuitarDueno({ dueno, marcaNombre, onHecho, onCerrar }: DialogoQuitarDuenoProps) {
  const { ocupado, error, enviar } = useEnvio()

  return (
    <Dialogo
      titulo={`Quitar el acceso de ${dueno.nombre}`}
      descripcion={
        <>
          <b>{dueno.email}</b> deja de poder administrar «{marcaNombre}».
        </>
      }
      onCerrar={onCerrar}
      ocupado={ocupado}
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-danger-solid"
            disabled={ocupado}
            onClick={() => void enviar(() => api.root.duenos.quitar(dueno.membresiaId), onHecho)}
          >
            {ocupado ? 'Quitando…' : 'Quitar acceso'}
          </button>
        </>
      }
    >
      <AvisoDeError texto={error} />
      <ul>
        <li>
          Su cuenta de MenYU <b>no se borra</b>: si tiene otras marcas o es cliente, todo sigue igual.
        </li>
        <li>
          La marca y sus restaurantes <b>no se tocan</b>.
        </li>
        <li>Lo podés volver a invitar cuando quieras.</li>
      </ul>
    </Dialogo>
  )
}

interface DialogoNoSePuedeQuitarProps {
  marcaNombre: string
  /** Lleva a invitar a otro dueño de esa marca. */
  onInvitar: () => void
  onCerrar: () => void
}

/** El último dueño de una marca activa no se quita: la marca quedaría sin nadie que la administre. */
export function DialogoNoSePuedeQuitar({ marcaNombre, onInvitar, onCerrar }: DialogoNoSePuedeQuitarProps) {
  return (
    <Dialogo
      titulo="No se puede quitar todavía"
      onCerrar={onCerrar}
      avisaRegistro={false}
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar}>
            Cerrar
          </button>
          <button type="button" className="btn btn-primary" onClick={onInvitar}>
            <Mail size={16} aria-hidden="true" />
            Invitar a otro dueño
          </button>
        </>
      }
    >
      <Aviso tipo="amb">
        Es el <b>único dueño</b> de «{marcaNombre}». Invitá a otro antes de quitarle el acceso, así la marca no queda sin nadie que
        la administre.
      </Aviso>
    </Dialogo>
  )
}
