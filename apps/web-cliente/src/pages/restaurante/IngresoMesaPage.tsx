import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppHeader } from '../../components/AppHeader'
import { QrScanner } from '../../components/QrScanner'
import { Banner } from '../../components/discovery/Banner'
import { BloqueEstado } from '../../components/discovery/BloqueEstado'
import { BotonGrande } from '../../components/discovery/BotonGrande'
import { EsqueletoContextoMesa } from '../../components/discovery/EsqueletosRestaurante'
import { Icono } from '../../components/discovery/Icono'
import { LogoRestaurante } from '../../components/discovery/LogoRestaurante'
import { VolverEnlace } from '../../components/discovery/VolverEnlace'
import { useEntrarAMesa, type FalloDeEntrada } from '../../hooks/useEntrarAMesa'
import { useDiscoveryStore } from '../../store/discoveryStore'
import { C } from '../../theme'
import { extractQrToken } from '../../utils/qr'

type Intento = 'qr' | 'pin'
/** Por qué se llegó al campo del PIN sin haberlo pedido: la cámara del navegador falló, o el QR no abrió la mesa. */
type MotivoPin = 'camara' | 'qr' | null

const TEXTO_MOTIVO: Record<Exclude<MotivoPin, null>, string> = {
  camara: 'No pudimos usar tu cámara. Ingresá el PIN que aparece en tu mesa.',
  qr: 'No pudimos abrir tu mesa con el QR. Ingresá el PIN que aparece en tu mesa.',
}

const ID_ERROR_PIN = 'error-pin'

/** Si el fallo es porque el PIN no sirve (y no porque no hay conexión, hay demasiados intentos o el restaurante no está disponible). */
function falloPorElPin(fallo: FalloDeEntrada): boolean {
  return fallo.status !== null && fallo.status !== 429 && fallo.status !== 403
}

/** El texto del aviso según qué se intentó y por qué falló. */
function mensajeDeFallo(intento: Intento, fallo: FalloDeEntrada, restaurante: string): string {
  // Sin respuesta del servidor: no es el QR ni el PIN.
  if (fallo.status === null) return 'No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.'
  // 429: demasiados intentos fallidos. El servidor dice cuánto esperar; no es que el PIN o el QR estén mal.
  if (fallo.status === 429 && fallo.mensaje) return fallo.mensaje
  // 403: el restaurante (o su marca) está dado de baja y no abre mesas nuevas. Con el QR y con el PIN da lo mismo: no es que estén mal.
  if (fallo.status === 403) return `Por ahora no se pueden abrir mesas en ${restaurante}: no está disponible.`
  if (intento === 'pin') return `PIN incorrecto o mesa no encontrada en ${restaurante}. Verificá e intentá de nuevo.`
  // 409: el servidor encontró la mesa pero es de otro restaurante.
  if (fallo.status === 409) return `Ese QR no es de ${restaurante}. Escaneá el QR de una de sus mesas.`
  return 'No pudimos abrir tu mesa con ese QR. Probá de nuevo o ingresá el PIN de tu mesa.'
}

/**
 * Ingreso a una mesa de un restaurante. Lo principal es el QR: el PIN no se ofrece de entrada, queda detrás de un
 * texto chico y recién al tocarlo se abre el campo. `?pin=qr` lo abre ya, con el aviso de que el QR no abrió la mesa
 * (es a donde lleva `/check-in` cuando falla); `?pin` solo lo abre.
 */
export function IngresoMesaPage() {
  const { restauranteId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const detalle = useDiscoveryStore((s) => s.detalle)
  const cargarRestaurante = useDiscoveryStore((s) => s.cargarRestaurante)

  const [escaneando, setEscaneando] = useState(false)
  const [pinAbierto, setPinAbierto] = useState(() => params.has('pin'))
  const [motivoPin, setMotivoPin] = useState<MotivoPin>(() => (params.get('pin') === 'qr' ? 'qr' : null))
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Si el error viene de lo que se escribió en el campo del PIN, y si es porque el PIN no sirve: el campo queda inválido y
  // asociado al texto del error (con `aria-invalid` y `aria-describedby`), y el foco vuelve a él.
  const [errorDelCampo, setErrorDelCampo] = useState<{ pinInvalido: boolean } | null>(null)
  const campoPin = useRef<HTMLInputElement>(null)
  const ultimoIntento = useRef<Intento>('qr')

  useEffect(() => {
    void cargarRestaurante(restauranteId)
  }, [restauranteId, cargarRestaurante])

  const actual = detalle?.id === restauranteId ? detalle : null
  const restaurante = actual?.estado === 'listo' ? actual.restaurante : null
  const nombre = restaurante?.nombre ?? 'este restaurante'

  const { entrar, cargando: abriendo, pantalla } = useEntrarAMesa({
    alFallar: (fallo) => {
      setError(mensajeDeFallo(ultimoIntento.current, fallo, nombre))
      if (ultimoIntento.current === 'pin') {
        setErrorDelCampo({ pinInvalido: falloPorElPin(fallo) })
        // Mientras se enviaba, quien tocó el botón lo perdió (se deshabilita): el foco vuelve al campo para corregir.
        campoPin.current?.focus()
      }
    },
  })

  if (pantalla) return pantalla

  const abrirPin = (motivo: MotivoPin) => {
    setMotivoPin(motivo)
    setPinAbierto(true)
    // El campo recién existe después de mostrar el panel.
    setTimeout(() => campoPin.current?.focus(), 0)
  }

  const abrirEscaner = () => {
    setError(null)
    setErrorDelCampo(null)
    setEscaneando(true)
  }

  const alLeerElQr = (leido: string) => {
    setEscaneando(false)
    ultimoIntento.current = 'qr'
    void entrar({ qrToken: extractQrToken(leido), restauranteId })
  }

  const alElegirElPin = () => {
    setEscaneando(false)
    setError(null)
    setErrorDelCampo(null)
    abrirPin('camara')
  }

  const ingresarConPin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setErrorDelCampo(null)
    if (!pin.trim()) {
      setError('Ingresá el PIN de tu mesa.')
      setErrorDelCampo({ pinInvalido: true })
      campoPin.current?.focus()
      return
    }
    ultimoIntento.current = 'pin'
    await entrar({ pin: pin.trim(), restauranteId })
  }

  const cuerpo = () => {
    if (actual?.estado === 'noEncontrado') {
      return (
        <BloqueEstado
          icono="local"
          titulo="No encontramos este restaurante"
          texto="Puede que ya no esté disponible. Volvé al inicio para ver los demás."
          boton="Volver al inicio"
          onBoton={() => navigate('/')}
          nivelDelTitulo={1}
        />
      )
    }

    return (
      <div className="md:rounded-2xl md:border md:bg-white md:px-8 md:pb-8 md:pt-7" style={{ borderColor: C.border }}>
        {!actual || actual.estado === 'cargando' ? (
          <EsqueletoContextoMesa />
        ) : (
          <div
            className="md:!bg-[#F7F7F8]"
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', margin: '4px 0 24px', background: C.white, border: `1px solid ${C.border}`, borderRadius: 12 }}
          >
            <LogoRestaurante nombre={nombre} logoUrl={restaurante?.logoUrl ?? null} tamano={40} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <small style={{ display: 'block', marginBottom: 2, fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.gray }}>
                Ingresando a
              </small>
              <strong style={{ display: 'block', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, lineHeight: 1.25, color: C.text, overflowWrap: 'anywhere' }}>
                {nombre}
              </strong>
            </div>
          </div>
        )}

        <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.orangeSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Icono nombre="qr" tam={30} trazo={C.orange} />
        </div>
        <h1 style={{ margin: '0 0 8px', textAlign: 'center', fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 26, lineHeight: 1.15, letterSpacing: '-0.02em', color: C.navy }}>
          Ingresar a una mesa
        </h1>
        <p style={{ margin: '0 auto 24px', maxWidth: 300, textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: 15, lineHeight: 1.5, color: C.textSub }}>
          Escaneá el código QR de tu mesa para ver el menú y hacer pedidos.
        </p>

        {(error || motivoPin) && (
          <div style={{ marginBottom: 20 }}>
            {error ? <Banner tipo="error" id={ID_ERROR_PIN}>{error}</Banner> : <Banner tipo="info">{TEXTO_MOTIVO[motivoPin as Exclude<MotivoPin, null>]}</Banner>}
          </div>
        )}

        <BotonGrande icono="escanear" onClick={abrirEscaner} disabled={abriendo}>Escanear QR</BotonGrande>

        {!pinAbierto && (
          <button
            type="button"
            aria-expanded={false}
            aria-controls="panel-pin"
            onClick={() => abrirPin(null)}
            className="hover:[&>b]:!text-coral"
            style={{ display: 'block', width: '100%', marginTop: 8, padding: '14px 4px', background: 'none', border: 'none', textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: 12.5, lineHeight: 1.4, color: C.textSub, cursor: 'pointer' }}
          >
            ¿Pasó algo con tu cámara? <b style={{ color: C.navy, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 2, whiteSpace: 'nowrap' }}>Ingresá el PIN de tu mesa</b>
          </button>
        )}

        {pinAbierto && (
          <form id="panel-pin" onSubmit={(e) => void ingresarConPin(e)} style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
            <label htmlFor="pin" style={{ display: 'block', marginBottom: 6, fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 13, lineHeight: 'normal', color: C.text }}>
              PIN de mesa
            </label>
            <input
              ref={campoPin}
              id="pin"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="Ej: 1234"
              autoComplete="off"
              value={pin}
              // Mientras se envía no se puede cambiar, pero no se deshabilita: un campo deshabilitado pierde el foco.
              readOnly={abriendo}
              aria-invalid={errorDelCampo?.pinInvalido ? true : undefined}
              aria-describedby={error && errorDelCampo ? ID_ERROR_PIN : undefined}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''))
                setError(null)
                setErrorDelCampo(null)
              }}
              className="focus:border-coral"
              style={{
                width: '100%',
                height: 56,
                padding: '0 14px',
                background: abriendo ? C.bg : C.white,
                border: `1.5px solid ${error ? C.orange : C.borderInput}`,
                borderRadius: 10,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 700,
                fontSize: 20,
                letterSpacing: '0.2em',
                textAlign: 'center',
                color: abriendo ? C.gray : C.text,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ marginTop: 12 }}>
              <BotonGrande variante="secundario" type="submit" disabled={abriendo}>
                {abriendo ? 'Ingresando...' : 'Ingresar con PIN'}
              </BotonGrande>
            </div>
          </form>
        )}
      </div>
    )
  }

  return (
    <>
      {escaneando && (
        <QrScanner
          onDetected={alLeerElQr}
          onCancel={() => setEscaneando(false)}
          alternativa={{ texto: 'Ingresar el PIN de mi mesa', onElegir: alElegirElPin }}
        />
      )}

      <div style={{ minHeight: '100vh', background: C.bg }}>
        <AppHeader />
        <main style={{ paddingTop: 60, paddingBottom: 40 }}>
          <div className="mx-auto w-full max-w-[428px] px-6 md:pt-2">
            <VolverEnlace to={actual?.estado === 'noEncontrado' ? '/' : `/restaurante/${restauranteId}`} />
            {cuerpo()}
          </div>
        </main>
      </div>
    </>
  )
}
