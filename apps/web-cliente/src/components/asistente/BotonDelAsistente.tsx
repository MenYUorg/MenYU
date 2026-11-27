import { Component, lazy, Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Spinner, useCerrarConEscape } from '@menyu/ui'
import { Icono } from '../discovery/Icono'
import { CM } from '../menu/paleta'
import { entrarAlRestaurante } from './conversacion'

// El botón del asistente sobre la carta (docs/asistente/specs/asistente.md, Fase 6). El chat (panel, store y lector del
// stream) es otro chunk: se baja la primera vez que se abre, así la carta no carga nada de más.

type PropsDelPanel = { abierto: boolean; onCerrar: () => void; restauranteId: string; nombreRestaurante: string }
/** Cómo se baja el chat. */
type CargadorDelChat = () => Promise<{ default: ComponentType<PropsDelPanel> }>
const cargarPanel: CargadorDelChat = () => import('./PanelDelAsistente')

/**
 * Una hoja chica, abajo, mientras baja el chat o si no se pudo bajar. Es un diálogo modal como el chat: el foco entra a la
 * hoja, Esc la cierra y el fondo queda inerte (eso último lo hace `MenuView`, con `onAbiertoChange`). Quien la usa pone su
 * botón de cerrar. Al cerrarse, el foco vuelve al botón "Asistente" (lo hace `AsistenteDeLaCarta`).
 */
function HojaChica({ children, onCerrar }: { children: ReactNode; onCerrar: () => void }) {
  const hojaRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    hojaRef.current?.focus({ preventScroll: true })
  }, [])
  useCerrarConEscape(onCerrar)

  return (
    <>
      <div aria-hidden="true" onClick={onCerrar} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(45,53,97,0.45)' }} />
      <div
        ref={hojaRef}
        role="dialog"
        aria-modal="true"
        aria-label="Asistente"
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[480px] rounded-t-[20px] bg-white outline-none sm:inset-x-auto sm:bottom-4 sm:right-4 sm:mx-0 sm:w-[400px] sm:rounded-[20px]"
        style={{ zIndex: 61, padding: '28px 20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}
      >
        {children}
      </div>
    </>
  )
}

/** Si el chunk del chat no baja (sin conexión, o un deploy nuevo que lo cambió de nombre), o el chat falla al dibujarse, se
 * avisa ahí y nada más: la carta y el pedido siguen como estaban. */
class LimiteDelChat extends Component<{ children: ReactNode; onCerrar: () => void }, { fallo: boolean }> {
  state = { fallo: false }

  static getDerivedStateFromError() {
    return { fallo: true }
  }

  render() {
    if (!this.state.fallo) return this.props.children
    return (
      <HojaChica onCerrar={this.props.onCerrar}>
        <span style={{ color: CM.orange, display: 'inline-flex' }}>
          <Icono nombre="aviso" tam={28} />
        </span>
        <p role="alert" style={{ margin: 0, fontFamily: 'Inter,sans-serif', fontSize: 14, lineHeight: 1.5, color: CM.text }}>
          No pudimos abrir el asistente. Revisá tu conexión y probá de nuevo.
        </p>
        <button
          type="button"
          onClick={this.props.onCerrar}
          style={{
            minHeight: 44,
            padding: '0 24px',
            borderRadius: 10,
            border: 'none',
            background: CM.orange,
            color: 'white',
            fontFamily: 'Montserrat,sans-serif',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Cerrar
        </button>
      </HojaChica>
    )
  }
}

interface AsistenteDeLaCartaProps {
  restauranteId: string
  nombreRestaurante: string
  /** `restaurante.asistenteHabilitado` de la carta: sin él no hay botón. */
  habilitado: boolean
  /** En la mesa, con el botón del carrito a la vista: el del asistente va a su izquierda, para no taparlo. */
  conCarrito: boolean
  /**
   * Avisa cuando el chat (o la hoja que lo precede) se abre o se cierra. La carta lo usa para dejar inerte lo que queda de
   * fondo: el encabezado, el contenido y este mismo botón. El chat va en el `<body>` (un portal), no dentro de lo inerte.
   */
  onAbiertoChange?: (abierto: boolean) => void
  /** Cómo se baja el chat. Solo lo cambian los tests, para simular que tarda o que no baja. */
  cargarElChat?: CargadorDelChat
}

/**
 * El botón flotante del asistente y su chat. Va en la carta (la de la mesa y la vista desde Discovery) y solo se ve si
 * el restaurante tiene el asistente prendido. Al entrar a la carta de un restaurante se borran las conversaciones de los
 * demás, tenga o no el asistente: una conversación por restaurante, que arranca de cero al cambiar.
 */
export function AsistenteDeLaCarta({ restauranteId, nombreRestaurante, habilitado, conCarrito, onAbiertoChange, cargarElChat = cargarPanel }: AsistenteDeLaCartaProps) {
  const [abierto, setAbierto] = useState(false)
  // El chat se baja y se monta la primera vez que se abre; después queda montado aunque se cierre. Va envuelto en un
  // objeto: un componente suelto en el estado se confundiría con una función de actualización.
  const [chat, setChat] = useState<{ Panel: ComponentType<PropsDelPanel> } | null>(null)
  const botonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    entrarAlRestaurante(restauranteId)
  }, [restauranteId])

  // Si esta carta se va con el chat abierto, el fondo no puede quedar inerte. Con una referencia al último `onAbiertoChange`
  // para que el aviso salga solo al desmontar, aunque quien nos use pase una función nueva en cada render.
  const avisarApertura = useRef(onAbiertoChange)
  avisarApertura.current = onAbiertoChange
  useEffect(() => () => avisarApertura.current?.(false), [])

  // Al cerrar, el foco vuelve al botón. Va en un efecto y no en `cerrar`: con el fondo inerte el botón no puede recibirlo
  // hasta que la carta se renderiza de nuevo, ya sin la inercia.
  const estuvoAbierto = useRef(false)
  useEffect(() => {
    if (estuvoAbierto.current && !abierto) botonRef.current?.focus({ preventScroll: true })
    estuvoAbierto.current = abierto
  }, [abierto])

  if (!habilitado) return null

  const cambiarApertura = (nuevo: boolean) => {
    setAbierto(nuevo)
    avisarApertura.current?.(nuevo)
  }

  // Se empieza a bajar apenas se apoya el dedo, antes del click. Si falla, el click lo vuelve a intentar.
  const precargar = () => {
    cargarElChat().catch(() => undefined)
  }
  const abrir = () => {
    setChat((actual) => actual ?? { Panel: lazy(cargarElChat) })
    cambiarApertura(true)
  }
  const cerrar = () => cambiarApertura(false)
  // Si no se pudo bajar, el próximo toque lo intenta de nuevo con un lazy nuevo (el anterior queda con el error).
  const cerrarTrasElFallo = () => {
    setChat(null)
    cerrar()
  }

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        onClick={abrir}
        onPointerDown={precargar}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className="transition-[right] duration-200 motion-reduce:transition-none"
        style={{
          position: 'fixed',
          // Centrado con el botón del carrito (54 px, a 20 del borde), que no se mueve.
          bottom: 23,
          right: conCarrito ? 84 : 20,
          zIndex: 30,
          height: 48,
          padding: '0 18px 0 14px',
          borderRadius: 999,
          border: 'none',
          background: CM.navy,
          color: 'white',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'Montserrat,sans-serif',
          fontWeight: 700,
          fontSize: 14,
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(45,53,97,0.32)',
        }}
      >
        <Icono nombre="globo" tam={20} />
        Asistente
      </button>

      {chat &&
        createPortal(
          <LimiteDelChat onCerrar={cerrarTrasElFallo}>
            <Suspense
              fallback={
                abierto ? (
                  <HojaChica onCerrar={cerrar}>
                    <Spinner size="md" />
                    <p role="status" style={{ margin: 0, fontFamily: 'Inter,sans-serif', fontSize: 14, color: CM.textSub }}>
                      Abriendo el asistente…
                    </p>
                    <button
                      type="button"
                      onClick={cerrar}
                      style={{
                        minHeight: 44,
                        padding: '0 20px',
                        borderRadius: 10,
                        border: `1px solid ${CM.border}`,
                        background: 'white',
                        color: CM.navy,
                        fontFamily: 'Montserrat,sans-serif',
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: 'pointer',
                      }}
                    >
                      Cerrar
                    </button>
                  </HojaChica>
                ) : null
              }
            >
              <chat.Panel abierto={abierto} onCerrar={cerrar} restauranteId={restauranteId} nombreRestaurante={nombreRestaurante} />
            </Suspense>
          </LimiteDelChat>,
          document.body,
        )}
    </>
  )
}
