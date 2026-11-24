import { useId, useState, type FormEvent } from 'react'
import type { CajaDelRestaurante } from '@menyu/types'
import { api } from '../../../services/api'
import { C, botonPeligro, botonPeligroSolido, botonPrimario, botonSecundario, conEstado, textoAyuda } from '../marca/estilos'
import { mensajeDeFalla } from '../asistente/estilos'
import { pastillaMarca, pastillaNeutra } from './estilos'
import { errorDeCaja } from './errores'
import { CampoDeNombre } from './CampoDeNombre'
import { leerNombreDeCaja } from './nombre'

interface FilaDeCajaProps {
  caja: CajaDelRestaurante
  /** Está abierta en el turno, según la última lectura (false también si no se pudo saber). */
  abierta: boolean
  /** Hay que volver a leer la lista: se cambió algo, o la lista quedó vieja (404 o caja abierta). */
  onCambio: () => void
}

type Modo = 'viendo' | 'renombrando' | 'confirmando'

/**
 * Una caja del restaurante (#360): renombrarla en la fila, activarla o desactivarla (con confirmación). No se borra.
 * Abierta en el turno no se puede desactivar: se cierra desde la app del personal.
 */
export function FilaDeCaja({ caja, abierta, onCambio }: FilaDeCajaProps) {
  const id = useId()
  const [modo, setModo] = useState<Modo>('viendo')
  const [texto, setTexto] = useState(caja.nombre)
  const [errorDelNombre, setErrorDelNombre] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  // Al salir de la edición el foco vuelve al botón "Renombrar" de esta fila (autoFocus actúa cuando se vuelve a montar).
  const [volverAlBoton, setVolverAlBoton] = useState(false)

  function abrirEdicion() {
    setTexto(caja.nombre)
    setErrorDelNombre(null)
    setError(null)
    setModo('renombrando')
  }

  function cerrar() {
    setErrorDelNombre(null)
    setModo('viendo')
    setVolverAlBoton(true)
  }

  async function enviar(cambios: { nombre?: string; activa?: boolean }, porDefecto: string) {
    setError(null)
    setEnviando(true)
    try {
      await api.cajas.actualizar(caja.id, cambios)
      if (cambios.nombre !== undefined) cerrar()
      else setModo('viendo')
      onCambio()
    } catch (err) {
      const problema = errorDeCaja(err, porDefecto)
      if (problema.delNombre) setErrorDelNombre(problema.mensaje)
      else setError(problema.mensaje)
      if (problema.releer) {
        setModo('viendo')
        onCambio()
      }
    } finally {
      setEnviando(false)
    }
  }

  function guardar(e: FormEvent) {
    e.preventDefault()
    const nombre = leerNombreDeCaja(texto)
    if (!nombre.ok) {
      setErrorDelNombre(nombre.mensaje)
      return
    }
    // Sin cambios no se llama a la API.
    if (nombre.valor === caja.nombre) {
      cerrar()
      return
    }
    void enviar({ nombre: nombre.valor }, 'No se pudo renombrar la caja')
  }

  const etiqueta = `«${caja.nombre}»`
  return (
    <li style={{ padding: '16px 0', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {modo === 'renombrando' ? (
        <form noValidate onSubmit={guardar}>
          <CampoDeNombre
            id={id}
            autoFocus
            valor={texto}
            error={errorDelNombre}
            onChange={(valor) => {
              setTexto(valor)
              setErrorDelNombre(null)
              setError(null)
            }}
          >
            <button type="submit" disabled={enviando} style={conEstado(botonPrimario, enviando)}>Guardar</button>
            <button type="button" disabled={enviando} style={conEstado(botonSecundario, enviando)} onClick={() => { setError(null); cerrar() }}>
              Cancelar
            </button>
          </CampoDeNombre>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 600, color: C.text, flex: 1, minWidth: 0 }}>{caja.nombre}</span>
          {!caja.activa && <span style={pastillaNeutra}>Inactiva</span>}
          {abierta && <span style={pastillaMarca}>Abierta en el turno</span>}
          <button
            type="button"
            autoFocus={volverAlBoton}
            style={conEstado(botonSecundario, enviando)}
            aria-label={`Renombrar ${etiqueta}`}
            disabled={enviando}
            onClick={abrirEdicion}
          >
            Renombrar
          </button>
          {caja.activa ? (
            <button
              type="button"
              style={conEstado(botonPeligro, enviando || abierta || modo === 'confirmando')}
              aria-label={`Desactivar ${etiqueta}`}
              aria-describedby={abierta ? `${id}-abierta` : undefined}
              disabled={enviando || abierta || modo === 'confirmando'}
              onClick={() => { setError(null); setModo('confirmando') }}
            >
              Desactivar
            </button>
          ) : (
            <button
              type="button"
              style={conEstado(botonSecundario, enviando)}
              aria-label={`Activar ${etiqueta}`}
              disabled={enviando}
              onClick={() => void enviar({ activa: true }, 'No se pudo activar la caja')}
            >
              Activar
            </button>
          )}
        </div>
      )}

      {abierta && modo !== 'renombrando' && (
        <p id={`${id}-abierta`} style={textoAyuda}>
          No se puede desactivar con el turno abierto: se cierra desde la app del personal, en Caja
        </p>
      )}

      {modo === 'confirmando' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center" style={{ background: C.bg, borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.text, margin: 0, flex: 1 }}>
            ¿Desactivar {etiqueta}? No se va a poder abrir en turnos nuevos. Podés volver a activarla.
          </p>
          <button type="button" disabled={enviando} style={conEstado(botonPeligroSolido, enviando)} onClick={() => void enviar({ activa: false }, 'No se pudo desactivar la caja')}>
            Confirmar
          </button>
          <button type="button" disabled={enviando} style={conEstado(botonSecundario, enviando)} onClick={() => { setError(null); setModo('viendo') }}>Cancelar</button>
        </div>
      )}

      {error !== null && <p role="alert" style={mensajeDeFalla}>{error}</p>}
    </li>
  )
}
