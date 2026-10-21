import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Clock } from 'lucide-react'

const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface DialogoProps {
  titulo: ReactNode
  /** Texto corto bajo el título. */
  descripcion?: ReactNode
  children: ReactNode
  /** Los botones (el último es la acción principal). */
  pie: ReactNode
  onCerrar: () => void
  /** Mientras guarda no se puede cerrar con Escape. */
  ocupado?: boolean
  /** Los diálogos que cambian algo avisan que la acción queda registrada en el historial de ROOT. */
  avisaRegistro?: boolean
}

/**
 * Ventana al centro en escritorio y hoja que sube desde abajo en celular (el CSS decide). Se dibuja en `document.body` con la
 * clase `.rc` propia, así no la recorta ningún contenedor con scroll. Enfoca el primer campo al abrir, atrapa el foco con Tab,
 * se cierra con Escape y devuelve el foco a lo que lo abrió. Tocar el fondo NO la cierra: una pantalla con datos escritos no
 * se pierde por un toque de más.
 */
export function Dialogo({ titulo, descripcion, children, pie, onCerrar, ocupado = false, avisaRegistro = true }: DialogoProps) {
  const idTitulo = useId()
  const contenedor = useRef<HTMLDivElement>(null)
  const cerrar = useRef(onCerrar)
  cerrar.current = onCerrar
  const bloqueado = useRef(ocupado)
  bloqueado.current = ocupado

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    const raiz = contenedor.current
    const campo = raiz?.querySelector<HTMLElement>('input:not([readonly]):not([disabled]), select:not([disabled])')
    ;(campo ?? raiz)?.focus()

    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape' && !bloqueado.current) {
        e.stopPropagation()
        cerrar.current()
        return
      }
      if (e.key !== 'Tab' || !raiz) return
      const lista = Array.from(raiz.querySelectorAll<HTMLElement>(ENFOCABLES))
      if (!lista.length) return
      const primero = lista[0]
      const ultimo = lista[lista.length - 1]
      if (e.shiftKey && (document.activeElement === primero || document.activeElement === raiz)) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primero.focus()
      }
    }
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('keydown', alTeclear)
      anterior?.focus?.()
    }
  }, [])

  return createPortal(
    <div className="rc">
      <div className="dlg-bg">
        <div ref={contenedor} className="dlg" role="dialog" aria-modal="true" aria-labelledby={idTitulo} tabIndex={-1}>
          <h3 id={idTitulo}>{titulo}</h3>
          {descripcion && <p className="lead">{descripcion}</p>}
          {children}
          {avisaRegistro && (
            <p className="ayuda aviso-registro">
              <Clock size={14} aria-hidden="true" />
              Esta acción queda registrada en el historial.
            </p>
          )}
          <div className="dlg-pie">{pie}</div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
