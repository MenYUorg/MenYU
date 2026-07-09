import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../../components/AppHeader'
import { AnfitrionScreen, CodigoSesionScreen } from '../../components/SesionSeguraModals'
import { api } from '../../services/api'
import { useSessionStore } from '../../store/sessionStore'

const C = {
  orange: '#E8563A',
  orangeHover: '#d34a30',
  navy: '#2D3561',
  text: '#1A1A2E',
  textSub: '#6B7280',
  border: '#DDDDE0',
  bg: '#F7F7F8',
  white: '#FFFFFF',
} as const

type Marca = { id: string; nombre: string; restaurantesActivos: number }
type Restaurante = { id: string; nombre: string; direccion: string | null }

export function IngresoManualPage() {
  const navigate = useNavigate()
  const openSession = useSessionStore((s) => s.openSession)
  const sessionError = useSessionStore((s) => s.error)
  const loadingSession = useSessionStore((s) => s.loading)

  const [marcas, setMarcas] = useState<Marca[]>([])
  const [loadingMarcas, setLoadingMarcas] = useState(true)

  const [selectedMarca, setSelectedMarca] = useState<Marca | null>(null)
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [loadingRestaurantes, setLoadingRestaurantes] = useState(false)
  const [selectedRestauranteId, setSelectedRestauranteId] = useState('')

  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [btnHover, setBtnHover] = useState(false)

  const [pendingRestauranteId, setPendingRestauranteId] = useState<string | null>(null)
  const [pendingPin, setPendingPin] = useState<string | null>(null)
  const [showCodigoModal, setShowCodigoModal] = useState(false)
  const [showAnfitrionModal, setShowAnfitrionModal] = useState(false)
  const [anfitrionCodigo, setAnfitrionCodigo] = useState<string | null>(null)

  function handleOpenResult(result: Awaited<ReturnType<typeof openSession>>) {
    if (result && !result.error) {
      if (result.esAnfitrion && result.modoSesion === 'seguro') {
        setAnfitrionCodigo(result.codigoSesion)
        setShowAnfitrionModal(true)
      } else {
        navigate('/menu')
      }
    } else if (result?.error === 'REQUIERE_CODIGO_SESION') {
      setShowCodigoModal(true)
    } else {
      setError(sessionError ?? 'PIN incorrecto o mesa no encontrada. Verificá e intentá de nuevo.')
    }
  }

  // Fetch marcas on mount
  useEffect(() => {
    setLoadingMarcas(true)
    api.marca.publicas()
      .then((data) => setMarcas(data.filter((m) => m.restaurantesActivos > 0)))
      .catch(() => setError('No se pudieron cargar los restaurantes. Intentá de nuevo.'))
      .finally(() => setLoadingMarcas(false))
  }, [])

  // Fetch restaurantes when marca changes
  useEffect(() => {
    if (!selectedMarca) {
      setRestaurantes([])
      setSelectedRestauranteId('')
      return
    }
    setLoadingRestaurantes(true)
    setSelectedRestauranteId('')
    api.marca.restaurantes(selectedMarca.id)
      .then((data) => {
        setRestaurantes(data)
        if (data.length === 1 && data[0]) {
          setSelectedRestauranteId(data[0].id)
        }
      })
      .catch(() => setError('No se pudieron cargar las sucursales.'))
      .finally(() => setLoadingRestaurantes(false))
  }, [selectedMarca])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedRestauranteId) {
      setError('Seleccioná un restaurante.')
      return
    }
    if (!pin.trim()) {
      setError('Ingresá el PIN de tu mesa.')
      return
    }

    setPendingRestauranteId(selectedRestauranteId)
    setPendingPin(pin.trim())
    const result = await openSession({ pin: pin.trim(), restauranteId: selectedRestauranteId })
    handleOpenResult(result)
  }

  const handleSubmitCodigo = async (codigo: string) => {
    if (!pendingRestauranteId || !pendingPin) return
    const result = await openSession({ pin: pendingPin, restauranteId: pendingRestauranteId, codigoSesion: codigo })
    if (result && !result.error) {
      setShowCodigoModal(false)
      handleOpenResult(result)
    }
    // si falla, sessionStore.error queda seteado y se muestra dentro del modal
  }

  if (showAnfitrionModal) {
    return <AnfitrionScreen codigo={anfitrionCodigo} onContinuar={() => navigate('/menu')} />
  }

  if (showCodigoModal) {
    return (
      <CodigoSesionScreen
        loading={loadingSession}
        error={sessionError}
        onSubmit={(codigo) => void handleSubmitCodigo(codigo)}
        onVolver={() => setShowCodigoModal(false)}
      />
    )
  }

  const showRestauranteDropdown = selectedMarca && selectedMarca.restaurantesActivos > 1

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <AppHeader />

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '80px 24px 40px',
      }}>
        <div style={{
          width: '100%',
          maxWidth: 380,
          marginTop: 32,
        }}>
          <h1 style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 800,
            fontSize: 26,
            color: C.navy,
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}>
            Ingresar con PIN
          </h1>
          <p style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 14,
            color: C.textSub,
            margin: '0 0 32px',
            lineHeight: 1.5,
          }}>
            Seleccioná tu restaurante e ingresá el PIN que aparece en la mesa.
          </p>

          <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Marca dropdown */}
            <div>
              <label style={labelStyle}>Restaurante</label>
              <select
                value={selectedMarca?.id ?? ''}
                disabled={loadingMarcas}
                onChange={(e) => {
                  const found = marcas.find((m) => m.id === e.target.value) ?? null
                  setSelectedMarca(found)
                  setError(null)
                }}
                style={selectStyle}
              >
                <option value=''>
                  {loadingMarcas ? 'Cargando...' : 'Seleccioná el restaurante'}
                </option>
                {marcas.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </div>

            {/* Sucursal dropdown — only when marca has more than 1 active restaurant */}
            {showRestauranteDropdown && (
              <div>
                <label style={labelStyle}>Sucursal</label>
                <select
                  value={selectedRestauranteId}
                  disabled={loadingRestaurantes}
                  onChange={(e) => { setSelectedRestauranteId(e.target.value); setError(null) }}
                  style={selectStyle}
                >
                  <option value=''>
                    {loadingRestaurantes ? 'Cargando sucursales...' : 'Seleccioná la sucursal'}
                  </option>
                  {restaurantes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}{r.direccion ? ` — ${r.direccion}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* PIN input */}
            <div>
              <label style={labelStyle}>PIN de mesa</label>
              <input
                type='text'
                inputMode='numeric'
                pattern='[0-9]*'
                maxLength={6}
                placeholder='Ej: 1234'
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '')
                  setPin(val)
                  setError(null)
                }}
                style={{
                  ...inputStyle,
                  letterSpacing: '0.2em',
                  fontSize: 20,
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: '#FDE5DF',
                border: `1px solid ${C.orange}`,
                borderRadius: 10,
                padding: '10px 14px',
              }}>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#c0392b', margin: 0 }}>
                  {error}
                </p>
              </div>
            )}

            {/* Submit */}
            <button
              type='submit'
              disabled={loadingSession || loadingRestaurantes}
              onMouseEnter={() => setBtnHover(true)}
              onMouseLeave={() => setBtnHover(false)}
              style={{
                width: '100%',
                padding: '15px 0',
                background: (loadingSession || loadingRestaurantes) ? '#ccc' : btnHover ? C.orangeHover : C.orange,
                color: C.white,
                border: 'none',
                borderRadius: 14,
                fontFamily: 'Montserrat, sans-serif',
                fontWeight: 700,
                fontSize: 16,
                cursor: (loadingSession || loadingRestaurantes) ? 'not-allowed' : 'pointer',
                transition: 'background .14s',
                marginTop: 4,
              }}
            >
              {loadingSession ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'Inter, sans-serif',
  fontWeight: 600,
  fontSize: 13,
  color: '#374151',
  marginBottom: 6,
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: '#FFFFFF',
  border: '1.5px solid #DDDDE0',
  borderRadius: 10,
  fontFamily: 'Inter, sans-serif',
  fontSize: 15,
  color: '#1A1A2E',
  cursor: 'pointer',
  outline: 'none',
  appearance: 'auto',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: '#FFFFFF',
  border: '1.5px solid #DDDDE0',
  borderRadius: 10,
  fontFamily: 'Inter, sans-serif',
  fontSize: 15,
  color: '#1A1A2E',
  outline: 'none',
  boxSizing: 'border-box',
}
