import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { C } from '../theme'
import { crearLector, type LectorQr } from '../utils/lectorQr'

/** Qué se ofrece cuando la cámara no se puede usar: ingresar con el PIN de la mesa o, sin restaurante elegido, elegirlo. */
export interface AlternativaSinCamara {
  texto: string
  /** Línea chica debajo del botón. */
  ayuda?: string
  onElegir: () => void
}

interface QrScannerProps {
  onDetected: (raw: string) => void
  onCancel: () => void
  alternativa: AlternativaSinCamara
}

type Falla = 'denegado' | 'sin-camara' | 'sin-soporte'
type Estado = { tipo: 'esperando' } | { tipo: 'escaneando'; flujo: MediaStream } | { tipo: Falla }

// Entre una lectura y la siguiente (se espera a que termine la anterior: nunca hay dos a la vez).
const INTERVALO_MS = 150

// El permiso se pide al abrir el escáner, que se abre al tocar "Escanear QR". Cámara trasera si hay; si no, la que haya.
const PEDIDO_DE_CAMARA: MediaStreamConstraints = {
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
}

const TEXTOS = {
  esperando: {
    titulo: 'Permití el acceso a la cámara',
    texto: 'Cuando tu navegador te lo pida, tocá "Permitir" para escanear el QR de tu mesa.',
  },
  escaneando: {
    titulo: 'Apuntá la cámara al QR de la mesa',
    texto: 'Mantené el celular firme y con buena luz. El QR tiene que entrar en el recuadro.',
  },
  denegado: {
    titulo: 'No pudimos usar tu cámara',
    texto: 'Parece que no le diste permiso a MenYU. Podés habilitarlo desde la configuración del navegador y volver a intentar.',
  },
  'sin-camara': {
    titulo: 'La cámara no responde',
    texto: 'No encontramos una cámara disponible, o la está usando otra aplicación. Cerrala y volvé a intentar.',
  },
  'sin-soporte': {
    titulo: 'Este navegador no puede usar la cámara',
    texto: 'Desde este navegador no podemos abrir la cámara. Probá desde Chrome (Android) o Safari (iPhone).',
  },
} as const

/** Sin `mediaDevices` no hay cámara posible: una página sin HTTPS, un navegador viejo o el de otra app (Instagram, etc.). */
const hayCamara = () => typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'

function clasificarFalla(error: unknown): Falla {
  const nombre = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : ''
  // El permiso se rechazó (o venía rechazado de antes).
  if (nombre === 'NotAllowedError' || nombre === 'PermissionDeniedError') return 'denegado'
  // El navegador o el contexto no permite usar la cámara.
  if (nombre === 'SecurityError' || nombre === 'TypeError') return 'sin-soporte'
  // No hay cámara, la usa otra aplicación o no arrancó.
  return 'sin-camara'
}

// ── Estilos (el escáner de siempre, con los estados nuevos) ────────────────────────────────────────────────

const TITULOS = 'Montserrat, sans-serif'
const TEXTO = 'Inter, sans-serif'
const BLANCO_SUAVE = 'rgba(255,255,255,0.72)'
const NARANJA_TENUE = 'rgba(232,86,58,0.18)'

const estiloFondo: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  // Casi opaco: con menos, la pantalla de atrás se transparenta entre los textos y las tarjetas.
  background: 'rgba(0,0,0,0.96)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 20,
  padding: '24px 24px calc(24px + env(safe-area-inset-bottom))',
  textAlign: 'center',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  outline: 'none',
}

const estiloTitulo: CSSProperties = {
  fontFamily: TITULOS,
  fontWeight: 700,
  fontSize: 18,
  lineHeight: 1.3,
  color: C.white,
  maxWidth: 320,
  margin: 0,
}

const estiloTexto: CSSProperties = {
  fontFamily: TEXTO,
  fontWeight: 400,
  fontSize: 14,
  lineHeight: 1.5,
  color: BLANCO_SUAVE,
  maxWidth: 320,
  margin: '20px 0 0',
}

const estiloAcciones: CSSProperties = {
  width: '100%',
  maxWidth: 320,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  marginBottom: 'auto',
}

const estiloAvisoBoton: CSSProperties = {
  fontFamily: TEXTO,
  fontSize: 12.5,
  lineHeight: 1.4,
  color: 'rgba(255,255,255,0.65)',
  marginTop: -2,
}

// ── Piezas ─────────────────────────────────────────────────────────────────────────────────────────────────

function IconoCamara({ tam, trazo, tachada = false }: { tam: number; trazo: string; tachada?: boolean }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={trazo} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {tachada ? (
        <>
          <path d="M1 1l22 22" />
          <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56" />
        </>
      ) : (
        <>
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </>
      )}
    </svg>
  )
}

function CirculoDeIcono({ espera, children }: { espera?: boolean; children: ReactNode }) {
  return (
    <div style={{
      width: 76,
      height: 76,
      borderRadius: '50%',
      flex: 'none',
      background: espera ? 'rgba(255,255,255,0.1)' : NARANJA_TENUE,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 'auto',
    }}>
      {children}
    </div>
  )
}

function Giro() {
  return (
    <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: C.white }} role="img" aria-label="Esperando el permiso">
      <circle opacity=".25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path opacity=".75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function Boton({ onClick, principal, texto, children }: { onClick: () => void; principal?: boolean; texto?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: texto ? 44 : 48,
        padding: '0 20px',
        fontFamily: texto ? TEXTO : TITULOS,
        fontWeight: texto ? 500 : 600,
        fontSize: texto ? 14 : 15,
        color: texto ? 'rgba(255,255,255,0.8)' : C.white,
        background: principal ? C.orange : texto ? 'none' : 'rgba(255,255,255,0.12)',
        border: `1.5px solid ${principal ? C.orange : texto ? 'transparent' : 'rgba(255,255,255,0.25)'}`,
        borderRadius: 10,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

/** La recomendación cuando falla la cámara del navegador: el QR de la mesa es un link a /check-in y la app de cámara lo abre directo. */
function ConsejoCamaraDelCelular() {
  return (
    <div style={{
      width: '100%',
      maxWidth: 320,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      textAlign: 'left',
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.16)',
      borderRadius: 12,
      padding: '12px 14px',
    }}>
      <span style={{ width: 36, height: 36, borderRadius: '50%', flex: 'none', background: NARANJA_TENUE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <IconoCamara tam={20} trazo={C.orange} />
      </span>
      <p style={{ fontFamily: TEXTO, fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,0.85)', margin: 0 }}>
        <b style={{ color: C.white, fontWeight: 600 }}>Otra opción:</b> abrí la cámara de tu celular, apuntala al QR de la mesa y tocá el aviso con el link. Te abre tu mesa directamente.
      </p>
    </div>
  )
}

function AyudaPermiso() {
  const item: CSSProperties = { fontFamily: TEXTO, fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,0.8)', marginBottom: 8 }
  const negrita: CSSProperties = { color: C.white, fontWeight: 600 }
  return (
    <details style={{ width: '100%', maxWidth: 320, textAlign: 'left' }}>
      <summary style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 44,
        cursor: 'pointer',
        fontFamily: TEXTO,
        fontWeight: 500,
        fontSize: 13,
        color: 'rgba(255,255,255,0.8)',
        textDecoration: 'underline',
        textUnderlineOffset: 3,
      }}>
        ¿Cómo lo habilito?
      </summary>
      <ul style={{ margin: '4px 0 0', padding: '12px 14px 4px 30px', background: 'rgba(255,255,255,0.08)', borderRadius: 10 }}>
        <li style={item}><b style={negrita}>Chrome (Android):</b> tocá el ícono a la izquierda de la dirección, después Permisos → Cámara → Permitir.</li>
        <li style={item}><b style={negrita}>Safari (iPhone):</b> tocá &quot;AA&quot; en la barra de dirección, después Configuración del sitio web → Cámara → Permitir.</li>
      </ul>
    </details>
  )
}

/** El recuadro con la imagen de la cámara. Muestra el cuadrado central del video: es lo que se lee. */
function Visor({ flujo, videoRef, alFallarElVideo }: { flujo: MediaStream; videoRef: RefObject<HTMLVideoElement | null>; alFallarElVideo: () => void }) {
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = flujo
    video.play().catch((error: unknown) => {
      // AbortError: el video se reemplazó o se cerró mientras arrancaba (en desarrollo, StrictMode lo hace a propósito).
      if (!(error instanceof DOMException && error.name === 'AbortError')) alFallarElVideo()
    })
  }, [flujo, videoRef, alFallarElVideo])

  const esquina: CSSProperties = { position: 'absolute', width: 28, height: 28, border: `0 solid ${C.orange}` }
  return (
    <div style={{ position: 'relative', width: 260, height: 260, flex: 'none', marginTop: 'auto' }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', background: '#2b2a2f' }}>
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Imagen de la cámara"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
      <i style={{ ...esquina, top: 4, left: 4, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 }} />
      <i style={{ ...esquina, top: 4, right: 4, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 }} />
      <i style={{ ...esquina, bottom: 4, left: 4, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 }} />
      <i style={{ ...esquina, bottom: 4, right: 4, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 }} />
    </div>
  )
}

// ── Escáner ────────────────────────────────────────────────────────────────────────────────────────────────

export function QrScanner({ onDetected, onCancel, alternativa }: QrScannerProps) {
  const [estado, setEstado] = useState<Estado>(() => (hayCamara() ? { tipo: 'esperando' } : { tipo: 'sin-soporte' }))
  const [intento, setIntento] = useState(0)
  const fondoRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const camaraRef = useRef<MediaStream | null>(null)

  // La pantalla puede volver a renderizar con funciones nuevas: se leen siempre las últimas sin reiniciar la cámara.
  const alDetectar = useRef(onDetected)
  const alCancelar = useRef(onCancel)
  useEffect(() => {
    alDetectar.current = onDetected
    alCancelar.current = onCancel
  })

  const apagarCamara = useCallback(() => {
    camaraRef.current?.getTracks().forEach((pista) => pista.stop())
    camaraRef.current = null
  }, [])

  // Pide la cámara. Al terminar, cerrar o reintentar se apaga: nunca queda prendida.
  useEffect(() => {
    if (!hayCamara()) return
    let activo = true

    const abrir = async () => {
      try {
        const flujo = await navigator.mediaDevices.getUserMedia(PEDIDO_DE_CAMARA)
        if (!activo) {
          flujo.getTracks().forEach((pista) => pista.stop())
          return
        }
        camaraRef.current = flujo
        setEstado({ tipo: 'escaneando', flujo })
      } catch (error) {
        if (activo) setEstado({ tipo: clasificarFalla(error) })
      }
    }
    void abrir()

    return () => {
      activo = false
      apagarCamara()
    }
  }, [intento, apagarCamara])

  // Mira la imagen hasta que aparece un QR.
  const flujo = estado.tipo === 'escaneando' ? estado.flujo : null
  useEffect(() => {
    if (!flujo) return
    let detenido = false
    let temporizador: ReturnType<typeof setTimeout> | undefined

    const parar = () => {
      detenido = true
      clearTimeout(temporizador)
    }
    // La cámara se corta sola (otra app la tomó, se desconectó o la página quedó en segundo plano).
    const pista = flujo.getVideoTracks()[0]
    const alCortarse = () => {
      parar()
      apagarCamara()
      setEstado({ tipo: 'sin-camara' })
    }
    pista?.addEventListener('ended', alCortarse)

    const buscar = async () => {
      let lector: LectorQr
      try {
        // Recién ahora: sin cámara no hace falta, y el lector propio (jsqr) se descarga solo si el navegador no trae uno.
        lector = await crearLector()
      } catch {
        // No se pudo preparar el lector propio (por ejemplo, sin conexión para descargarlo).
        if (!detenido) {
          parar()
          apagarCamara()
          setEstado({ tipo: 'sin-soporte' })
        }
        return
      }

      const paso = async () => {
        if (detenido) return
        const video = videoRef.current
        if (video && video.readyState >= 2) {
          try {
            const texto = await lector.leer(video)
            if (detenido) return
            if (texto) {
              parar()
              apagarCamara()
              alDetectar.current(texto)
              return
            }
          } catch {
            // Un cuadro que no se pudo leer no corta el escaneo.
          }
        }
        if (!detenido) temporizador = setTimeout(() => void paso(), INTERVALO_MS)
      }
      void paso()
    }
    void buscar()

    return () => {
      parar()
      pista?.removeEventListener('ended', alCortarse)
    }
  }, [flujo, apagarCamara])

  const sinImagen = useCallback(() => {
    apagarCamara()
    setEstado({ tipo: 'sin-camara' })
  }, [apagarCamara])

  useEffect(() => {
    fondoRef.current?.focus()
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') alCancelar.current()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [])

  const reintentar = () => {
    setEstado({ tipo: 'esperando' })
    setIntento((n) => n + 1)
  }

  const { titulo, texto } = TEXTOS[estado.tipo]
  const fallo = estado.tipo === 'denegado' || estado.tipo === 'sin-camara' || estado.tipo === 'sin-soporte'
  const sePuedeReintentar = estado.tipo === 'denegado' || estado.tipo === 'sin-camara'

  return (
    <div
      ref={fondoRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="escaner-titulo"
      data-estado={estado.tipo}
      tabIndex={-1}
      style={estiloFondo}
    >
      {estado.tipo === 'escaneando' ? (
        <Visor flujo={estado.flujo} videoRef={videoRef} alFallarElVideo={sinImagen} />
      ) : (
        <CirculoDeIcono espera={estado.tipo === 'esperando'}>
          <IconoCamara tam={34} trazo={estado.tipo === 'esperando' ? C.white : C.orange} tachada={fallo} />
        </CirculoDeIcono>
      )}

      <div aria-live="polite">
        <h1 id="escaner-titulo" style={estiloTitulo}>{titulo}</h1>
        <p style={estiloTexto}>{texto}</p>
      </div>

      {estado.tipo === 'esperando' && <Giro />}
      {estado.tipo === 'denegado' && <AyudaPermiso />}
      {fallo && <ConsejoCamaraDelCelular />}

      <div style={estiloAcciones}>
        {sePuedeReintentar && <Boton principal onClick={reintentar}>Reintentar</Boton>}
        {fallo && (
          <>
            <Boton principal={estado.tipo === 'sin-soporte'} onClick={alternativa.onElegir}>{alternativa.texto}</Boton>
            {alternativa.ayuda && <span style={estiloAvisoBoton}>{alternativa.ayuda}</span>}
          </>
        )}
        <Boton texto={fallo} onClick={onCancel}>Cancelar</Boton>
      </div>
    </div>
  )
}
