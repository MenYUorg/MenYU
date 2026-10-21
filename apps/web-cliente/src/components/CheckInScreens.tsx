import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { C } from '../theme'
import { Girando } from './discovery/Girando'
import { Icono } from './discovery/Icono'
import { Shell } from './SesionSeguraModals'

const CUERPO: CSSProperties = {
  background: C.white,
  padding: '24px 28px 28px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 16,
  textAlign: 'center',
}

interface BotonProps {
  /** `principal`: naranja. `contorno`: blanco con borde. */
  variante: 'principal' | 'contorno'
  to?: string
  onClick?: () => void
  children: ReactNode
}

/** Botón de ancho completo de estas tarjetas (44 px de alto). Con `to` es un link que reemplaza la entrada del historial. */
function Boton({ variante, to, onClick, children }: BotonProps) {
  const principal = variante === 'principal'
  const estilo: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    width: '100%',
    minHeight: 44,
    padding: '0 20px',
    borderRadius: 10,
    border: `1.5px solid ${principal ? 'transparent' : C.borderInput}`,
    background: principal ? C.orange : C.white,
    color: principal ? C.white : C.navy,
    fontFamily: 'Montserrat, sans-serif',
    fontWeight: 700,
    fontSize: 14,
    textAlign: 'center',
    cursor: 'pointer',
  }
  const clases = principal ? 'hover:!bg-[#d34a30] transition-colors' : 'hover:!border-[#2D3561] transition-colors'
  if (to) return <Link to={to} replace className={clases} style={estilo}>{children}</Link>
  return <button type="button" onClick={onClick} className={clases} style={estilo}>{children}</button>
}

/** `/check-in` mientras abre la sesión de la mesa (antes la pantalla quedaba en blanco). */
export function AbriendoMesaScreen() {
  return (
    <Shell>
      <div role="status" aria-live="polite" style={CUERPO}>
        <Girando tam={36} />
        <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: 14, lineHeight: 1.5, color: C.textSub }}>
          Esto tarda solo unos segundos.
        </p>
      </div>
    </Shell>
  )
}

/**
 * Por qué no se pudo abrir: `qr` es que esa mesa no existe (reintentar no sirve); `red` es que no hubo respuesta del servidor;
 * `cerrado` es que el restaurante (o su marca) está dado de baja: con el QR y con el PIN da lo mismo, así que no se ofrece el PIN.
 */
export type MotivoFalloCheckIn = 'qr' | 'red' | 'cerrado'

interface CheckInFalloScreenProps {
  motivo: MotivoFalloCheckIn
  /** El restaurante del link del QR (`restaurantId`). Sin él no se sabe de quién es la mesa y hay que elegirlo en la lista. */
  restauranteId: string | null
  onReintentar: () => void
}

const TEXTOS: Record<MotivoFalloCheckIn, { titulo: string; texto: string }> = {
  qr: {
    titulo: 'No pudimos abrir tu mesa',
    texto: 'El QR no corresponde a una mesa activa: puede ser un QR viejo o que la mesa ya no esté habilitada. Ingresá el PIN que aparece en tu mesa para entrar.',
  },
  red: {
    titulo: 'No pudimos conectarnos',
    texto: 'Revisá tu conexión a internet y volvé a intentar. Si el problema sigue, podés entrar con el PIN de tu mesa.',
  },
  cerrado: {
    titulo: 'Este restaurante no está disponible',
    texto: 'Por ahora no se pueden abrir mesas en este restaurante. Probá más tarde o elegí otro desde el inicio.',
  },
}

/**
 * `/check-in` cuando la mesa no se pudo abrir. La salida es el PIN del restaurante del link (va a su pantalla de
 * ingreso a mesa con el campo ya abierto); si no hubo conexión, lo primero es "Reintentar".
 */
export function CheckInFalloScreen({ motivo, restauranteId, onReintentar }: CheckInFalloScreenProps) {
  const { titulo, texto } = TEXTOS[motivo]
  const principalEsElPin = motivo === 'qr'

  const salidaPin = restauranteId ? (
    <Boton variante={principalEsElPin ? 'principal' : 'contorno'} to={`/restaurante/${encodeURIComponent(restauranteId)}/mesa?pin=qr`}>
      Ingresar con el PIN de mi mesa
    </Boton>
  ) : (
    <>
      <Boton variante={principalEsElPin ? 'principal' : 'contorno'} to="/">Elegir mi restaurante</Boton>
      <p style={{ margin: '-8px 0 0', fontFamily: 'Inter, sans-serif', fontSize: 12.5, lineHeight: 1.4, color: C.textSub }}>
        Elegí tu restaurante en la lista e ingresá con el PIN de tu mesa.
      </p>
    </>
  )

  return (
    <Shell subtitulo={null}>
      <div role="alert" style={CUERPO}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.orangeSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icono nombre="aviso" tam={28} trazo={C.orange} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 18, lineHeight: 1.25, color: C.navy }}>{titulo}</h1>
          <p style={{ margin: '8px 0 0', fontFamily: 'Inter, sans-serif', fontSize: 14, lineHeight: 1.5, color: C.textSub }}>{texto}</p>
        </div>
        {motivo === 'red' && <Boton variante="principal" onClick={onReintentar}>Reintentar</Boton>}
        {/* Restaurante dado de baja: el PIN no sirve de nada, la salida es el inicio (con el botón principal). */}
        {motivo === 'cerrado' ? <Boton variante="principal" to="/">Ir al inicio</Boton> : salidaPin}
        {motivo !== 'cerrado' && (
          <Link
            to="/"
            replace
            className="hover:!text-[#2D3561]"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 12px', marginTop: -8, fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 13, color: C.textSub }}
          >
            Ir al inicio
          </Link>
        )}
      </div>
    </Shell>
  )
}
