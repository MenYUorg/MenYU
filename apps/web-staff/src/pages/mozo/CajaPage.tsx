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
import { ResultadoDelCierre } from '../../components/ResultadoDelCierre'
import type { ResultadoDelCierre as Resultado } from '../../utils/cierre'
import { estiloBotonSecundario, estiloCargandoPagina, estiloErrorBanda } from '../../components/estilosDeCaja'

function getInitials(name: string): string {
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
  // El turno se acaba de cerrar desde acá: el resultado queda en pantalla hasta "Abrir un turno nuevo".
  | { tipo: 'cerrado'; resultado: Resultado }

/**
 * La caja del restaurante (#359): abrir el turno, verlo, reasignar sus mesas, cargar movimientos y cerrarlo. OWNER,
 * GERENTE y JEFE_SALON. Lee el turno al entrar, al cambiar de restaurante y con "Actualizar"; no hay polling. Después de
 * cerrar, el resultado queda en pantalla (sin "Actualizar", para no descartarlo) hasta "Abrir un turno nuevo" o hasta
 * que cambie el restaurante.
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
  // El restaurante de ahora: un cierre que termina después de cambiar de restaurante no muestra su resultado.
  const restauranteActual = useRef(restauranteId)
  restauranteActual.current = restauranteId

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

  function alCerrar(resultado: Resultado) {
    if (restauranteId !== restauranteActual.current) return
    // Una lectura en vuelo (un "Actualizar" mientras se cerraba) no pisa el resultado.
    ultimaLectura.current++
    setAviso(null)
    setEstado({ tipo: 'cerrado', resultado })
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
        onRefresh={estado.tipo === 'cerrado' ? undefined : actualizar}
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
          <p role="status" style={estiloCargandoPagina}>Cargando el turno…</p>
        )}

        {estado.tipo === 'error' && (
          <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
            <p style={estiloErrorBanda}>{estado.mensaje}</p>
            <button
              type="button"
              onClick={() => void cargarTurno()}
              style={estiloBotonSecundario()}
            >
              Reintentar
            </button>
          </div>
        )}

        {estado.tipo === 'listo' && restauranteId && (
          estado.turno
            ? (
              <TurnoAbierto
                turno={estado.turno}
                restauranteId={restauranteId}
                onReasignado={mostrarTurno}
                onTurnoCambio={alCambiarElTurno}
                onCerrado={alCerrar}
              />
            )
            : (
              <FormularioDeApertura
                key={restauranteId}
                restauranteId={restauranteId}
                onAbierto={mostrarTurno}
                onTurnoCambio={alCambiarElTurno}
              />
            )
        )}

        {estado.tipo === 'cerrado' && <ResultadoDelCierre resultado={estado.resultado} onNuevoTurno={actualizar} />}
      </main>
    </div>
  )
}
