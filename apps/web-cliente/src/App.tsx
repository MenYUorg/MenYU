import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { ClienteMenuPage } from './pages/menu/ClienteMenuPage'
import { ItemDetailPage } from './pages/menu/ItemDetailPage'
import { CarritoPage } from './pages/carrito/CarritoPage'
import { PagoExitosoPage } from './pages/pago/PagoExitosoPage'
import { PagoFallidoPage } from './pages/pago/PagoFallidoPage'
import { PagoPendientePage } from './pages/pago/PagoPendientePage'
import { MisPedidosPage } from './pages/pedidos/MisPedidosPage'
import { PagarPage } from './pages/pago/PagarPage'
import { EntradaPage } from './pages/entrada/EntradaPage'
import { IngresoManualPage } from './pages/entrada/IngresoManualPage'
import { AuthPage } from './pages/auth/AuthPage'
import CheckInRedirectPage from './pages/entrada/CheckInRedirectPage'
import { SesionRequiredRoute } from './SesionRequiredRoute'
import { useSessionStore } from './store/sessionStore'
import { usePublicMenuStore } from './store/publicMenuStore'
import { GraciasCard } from './components/GraciasCard'

const WS_BASE = (import.meta.env.VITE_WS_URL as string) ??
  ((import.meta.env.VITE_API_URL as string) ?? '').replace('/api', '')

function SessionGuard({ children }: { children: React.ReactNode }) {
  const restauranteId = useSessionStore((s) => s.restauranteId)
  const sesionId      = useSessionStore((s) => s.sesionId)
  const clear         = useSessionStore((s) => s.clear)
  const navigate      = useNavigate()
  const [sesionCerrada, setSesionCerrada] = useState(false)
  const [showGracias, setShowGracias] = useState(false)

  // Ref para siempre tener el sesionId actual dentro del handler del socket
  // sin necesidad de recrear el socket cada vez que cambia.
  const sesionIdRef = useRef(sesionId)
  useEffect(() => { sesionIdRef.current = sesionId }, [sesionId])

  useEffect(() => {
    if (!restauranteId) return
    const socket = io(`${WS_BASE}/ws`, { transports: ['websocket'] })
    socket.on('connect', () => socket.emit('session:join', { restauranteId }))
    socket.on('sesion:cerrada', ({ sesionId: sid }: { sesionId: string }) => {
      if (sesionIdRef.current && sid === sesionIdRef.current) setShowGracias(true)
    })
    socket.on('sesion:cobrada', ({ sesionId: sid }: { sesionId: string }) => {
      if (sesionIdRef.current && sid === sesionIdRef.current) setShowGracias(true)
    })
    socket.on('menu:updated', ({ restauranteId: rid }: { restauranteId: string }) => {
      if (rid !== restauranteId) return
      const { clear: clearMenu, fetchMenu } = usePublicMenuStore.getState()
      clearMenu()
      void fetchMenu(rid)
    })
    return () => { socket.off('sesion:cobrada'); socket.disconnect() }
  }, [restauranteId])

  const handleAceptar = () => {
    clear()
    setSesionCerrada(false)
    navigate('/')
  }

  return (
    <>
      {showGracias && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(45, 53, 97, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}>
          <GraciasCard
            subtitulo="Su sesión ha sido cerrada. Esperamos verle pronto."
            onSalir={() => { setShowGracias(false); clear(); navigate('/') }}
          />
        </div>
      )}
      {children}
      {sesionCerrada && (
        <div
          style={{
            position:       'fixed',
            inset:          0,
            background:     'rgba(0,0,0,0.6)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            zIndex:         9999,
          }}
        >
          <div
            style={{
              background:   'white',
              borderRadius: 16,
              padding:      32,
              width:        320,
              maxWidth:     '90vw',
              textAlign:    'center',
            }}
          >
            <h3 style={{
              fontFamily: 'Montserrat,sans-serif',
              fontWeight: 700,
              fontSize:   20,
              color:      '#2D3561',
              margin:     '0 0 10px',
            }}>
              Sesión finalizada
            </h3>
            <p style={{
              fontFamily: 'Inter,sans-serif',
              fontSize:   14,
              color:      '#6b7280',
              margin:     '0 0 24px',
            }}>
              El establecimiento cerró tu sesión de mesa.
            </p>
            <button
              onClick={handleAceptar}
              style={{
                width:      '100%',
                padding:    '12px 0',
                borderRadius: 10,
                border:     'none',
                background: '#E8563A',
                color:      'white',
                fontFamily: 'Montserrat,sans-serif',
                fontWeight: 700,
                fontSize:   14,
                cursor:     'pointer',
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <SessionGuard>
        <Routes>
          <Route path="/" element={<EntradaPage />} />
          <Route path="/ingresar-pin" element={<IngresoManualPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/check-in" element={<CheckInRedirectPage />} />

          <Route element={<SesionRequiredRoute />}>
            <Route path="/menu" element={<ClienteMenuPage />} />
            <Route path="/menu/:itemId" element={<ItemDetailPage />} />
            <Route path="/carrito" element={<CarritoPage />} />
            <Route path="/pago/exitoso" element={<PagoExitosoPage />} />
            <Route path="/pago/fallido" element={<PagoFallidoPage />} />
            <Route path="/pago/pendiente" element={<PagoPendientePage />} />
            <Route path="/pedidos" element={<MisPedidosPage />} />
            <Route path="/pagar" element={<PagarPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionGuard>
    </BrowserRouter>
  )
}
