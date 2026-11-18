import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePerfil } from '@menyu/auth-client'
import { Wallet } from 'lucide-react'
import type { TurnoDeCaja } from '@menyu/types'
import { api } from '../../services/api'
import { useNombreDelRol, useRestauranteId } from '../../store/contextoStore'
import { PageHeader } from '../../components/PageHeader'
import { FormularioDeApertura } from '../../components/FormularioDeApertura'
import { TurnoAbierto } from '../../components/TurnoAbierto'

function getInitials(name?: string): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

const C = {
  navy:     '#2D3561',
  bg:       '#F6F7F9',
  white:    '#FFFFFF',
  border:   '#E6E8EF',
  textMut:  '#6B7280',
  red:      '#dc2626',
  orange:   '#E8563A',
  orangeBg: '#FDF0ED',
} as const

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; turno: TurnoDeCaja | null }

/**
 * La caja del restaurante (#359): abrir el turno, verlo y reasignar sus mesas. OWNER, GERENTE y JEFE_SALON. Lee el turno
 * al entrar, al cambiar de restaurante y con "Actualizar"; no hay polling.
 */
export function CajaPage() {
  const navigate = useNavigate()
  const perfil = usePerfil()
  const rolMostrado = useNombreDelRol()
  const restauranteId = useRestauranteId()
  const nombreUsuario = perfil.nombre || perfil.email

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  // Un aviso que sobrevive a la recarga: por qué la pantalla pasó a mostrar el turno (un 409 al abrir).
  const [aviso, setAviso] = useState<string | null>(null)
  // La respuesta de una lectura anterior (otro restaurante, un "Actualizar" que se cruzó) no pisa la más nueva.
  const ultimaLectura = useRef(0)

  const cargarTurno = useCallback(async () => {
    if (!restauranteId) return
    const lectura = ++ultimaLectura.current
    setEstado({ tipo: 'cargando' })
    try {
      const { turno } = await api.turnos.actual(restauranteId)
      if (lectura === ultimaLectura.current) setEstado({ tipo: 'listo', turno })
    } catch (e) {
      if (lectura === ultimaLectura.current) {
        setEstado({ tipo: 'error', mensaje: e instanceof Error && e.message ? e.message : 'No se pudo leer el turno' })
      }
    }
  }, [restauranteId])

  useEffect(() => { void cargarTurno() }, [cargarTurno])

  function actualizar() {
    setAviso(null)
    void cargarTurno()
  }

  function mostrarTurno(turno: TurnoDeCaja) {
    ultimaLectura.current++
    setAviso(null)
    setEstado({ tipo: 'listo', turno })
  }

  function alCambiarElTurno(mensaje: string) {
    setAviso(mensaje)
    void cargarTurno()
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Caja"
        breadcrumb="PANEL › CAJA"
        icon={<Wallet size={18} />}
        onBack={() => navigate('/mozo')}
        onRefresh={actualizar}
        userName={nombreUsuario}
        userRole={rolMostrado}
        userInitials={getInitials(nombreUsuario)}
      />

      <main style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760, width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
        {aviso && (
          <p
            role="alert"
            style={{
              margin: 0, background: C.orangeBg, border: `1px solid ${C.orange}`, borderRadius: 10,
              padding: '12px 16px', fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.navy,
            }}
          >
            {aviso}
          </p>
        )}

        {estado.tipo === 'cargando' && (
          <p role="status" style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMut, margin: 0 }}>Cargando el turno…</p>
        )}

        {estado.tipo === 'error' && (
          <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.red, margin: 0 }}>{estado.mensaje}</p>
            <button
              type="button"
              onClick={() => void cargarTurno()}
              style={{
                padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white,
                fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.navy, cursor: 'pointer',
              }}
            >
              Reintentar
            </button>
          </div>
        )}

        {estado.tipo === 'listo' && restauranteId && (
          estado.turno
            ? <TurnoAbierto turno={estado.turno} />
            : (
              <FormularioDeApertura
                key={restauranteId}
                restauranteId={restauranteId}
                onAbierto={mostrarTurno}
                onTurnoCambio={alCambiarElTurno}
              />
            )
        )}
      </main>
    </div>
  )
}
