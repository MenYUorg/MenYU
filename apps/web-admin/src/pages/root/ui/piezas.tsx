import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Info, MoreVertical, RefreshCw, type LucideIcon } from 'lucide-react'
import { siglasDe } from './texto'

export function Sigla({ nombre, grande = false }: { nombre: string; grande?: boolean }) {
  return (
    <div className={`sigla${grande ? ' sigla-g' : ''}`} aria-hidden="true">
      {siglasDe(nombre)}
    </div>
  )
}

/** "Activa" / "De baja" para una marca y "Activo" / "De baja" para un restaurante. */
export function ChipEstado({ activo, femenino = false }: { activo: boolean; femenino?: boolean }) {
  return activo ? (
    <span className="chip chip-ok">{femenino ? 'Activa' : 'Activo'}</span>
  ) : (
    <span className="chip chip-baja">De baja</span>
  )
}

type TipoAviso = 'amb' | 'err' | 'info'

export function Aviso({ tipo, children, accion }: { tipo: TipoAviso; children: ReactNode; accion?: ReactNode }) {
  const Icono: LucideIcon = tipo === 'info' ? Info : AlertTriangle
  return (
    <div className={`aviso aviso-${tipo}`} role={tipo === 'err' ? 'alert' : 'note'}>
      <Icono size={18} aria-hidden="true" />
      <div>
        {children}
        {accion}
      </div>
    </div>
  )
}

/** El error de carga con "Reintentar". `sinConexion` cambia el texto. */
export function ErrorDeCarga({ sinConexion, onReintentar }: { sinConexion: boolean; onReintentar: () => void }) {
  return (
    <Aviso
      tipo="err"
      accion={
        <>
          <br />
          <button type="button" className="btn btn-danger" onClick={onReintentar}>
            <RefreshCw size={16} aria-hidden="true" />
            Reintentar
          </button>
        </>
      }
    >
      <b>{sinConexion ? 'Sin conexión.' : 'No pudimos cargar los datos.'}</b>{' '}
      {sinConexion ? 'Revisá tu internet y probá de nuevo.' : 'Probá de nuevo en un momento.'}
    </Aviso>
  )
}

export function EsqueletoDeFilas({ filas }: { filas: number }) {
  return (
    <div className="card lista" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => (
        <div className="sk-fila" key={i}>
          <div className="sk" style={{ width: 40, height: 40 }} />
          <div style={{ flex: 1 }}>
            <div className="sk" style={{ height: 14, width: `${50 + (i % 3) * 12}%`, marginBottom: 8 }} />
            <div className="sk" style={{ height: 11, width: '30%' }} />
          </div>
          <div className="sk" style={{ width: 64, height: 22, borderRadius: 999 }} />
        </div>
      ))}
    </div>
  )
}

export function Vacio({ icono: Icono, titulo, children, accion }: { icono: LucideIcon; titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="card vacio">
      <div className="ic">
        <Icono size={22} aria-hidden="true" />
      </div>
      <b>{titulo}</b>
      {children && <p>{children}</p>}
      {accion}
    </div>
  )
}

/** Interruptor accesible (`role="switch"`). */
export function Interruptor({ activo, onCambio, children }: { activo: boolean; onCambio: (activo: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" className="interruptor" role="switch" aria-checked={activo} onClick={() => onCambio(!activo)}>
      <i />
      {children}
    </button>
  )
}

export interface OpcionDeMenu {
  texto: string
  icono: LucideIcon
  onElegir: () => void
  peligro?: boolean
  /** Una línea fina antes de esta opción. */
  separador?: boolean
}

/** El botón "⋮" con su menú de acciones. Se cierra con Escape, al tocar afuera y al elegir. */
export function MenuDeAcciones({ etiqueta, opciones }: { etiqueta: string; opciones: OpcionDeMenu[] }) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!abierto) return
    function alTocar(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false)
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', alTocar)
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('mousedown', alTocar)
      document.removeEventListener('keydown', alTeclear)
    }
  }, [abierto])

  return (
    <div className="pop-wrap" ref={raiz}>
      <button
        type="button"
        className="btn btn-ico"
        aria-label={etiqueta}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        onClick={() => setAbierto((a) => !a)}
      >
        <MoreVertical size={18} aria-hidden="true" />
      </button>
      {abierto && (
        <div className="pop" role="menu" id={id}>
          {opciones.map(({ texto, icono: Icono, onElegir, peligro, separador }) => (
            <div key={texto} style={{ display: 'contents' }}>
              {separador && <hr />}
              <button
                type="button"
                role="menuitem"
                className={peligro ? 'peligro' : undefined}
                onClick={() => {
                  setAbierto(false)
                  onElegir()
                }}
              >
                <Icono size={16} aria-hidden="true" />
                {texto}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
