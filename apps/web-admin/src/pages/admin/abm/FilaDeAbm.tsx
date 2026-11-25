import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { C, botonPeligro, botonPeligroSolido, botonPrimario, botonSecundario, conEstado, textoAyuda } from '../marca/estilos'
import { mensajeDeFalla } from '../asistente/estilos'
import { pastillaMarca, pastillaNeutra } from '../cajas/estilos'
import { errorDeAbm } from './errores'
import { CampoDeNombre } from './CampoDeNombre'
import { leerNombre } from './nombre'
import type { Bloqueo, ConfigDeAbm, ItemDelAbm } from './tipos'

interface FilaDeAbmProps {
  config: ConfigDeAbm
  item: ItemDelAbm
  /** Por qué no se puede desactivar ahora, según la última lectura (null si se puede, o si no se pudo saber). */
  bloqueo: Bloqueo | null
  actualizar: (id: string, cambios: { nombre?: string; activa?: boolean }) => Promise<unknown>
  /** Hay que volver a leer la lista: se cambió algo, o la lista quedó vieja (404 o conflicto). */
  onCambio: () => void
}

type Modo = 'viendo' | 'renombrando' | 'confirmando'

/**
 * Un ítem del ABM: renombrarlo en la fila, activarlo o desactivarlo (con confirmación). No se borra. Con un bloqueo no
 * se puede desactivar.
 */
export function FilaDeAbm({ config, item, bloqueo, actualizar, onCambio }: FilaDeAbmProps) {
  const id = useId()
  const [modo, setModo] = useState<Modo>('viendo')
  const [texto, setTexto] = useState(item.nombre)
  const [errorDelNombre, setErrorDelNombre] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  // Al salir de la edición el foco vuelve al botón "Renombrar" de esta fila (el efecto de abajo, solo al pasar de renombrar a ver).
  const [volverAlBoton, setVolverAlBoton] = useState(false)
  const botonRenombrar = useRef<HTMLButtonElement>(null)
  const modoAnterior = useRef<Modo>(modo)

  useEffect(() => {
    if (modoAnterior.current === 'renombrando' && modo === 'viendo' && volverAlBoton) botonRenombrar.current?.focus()
    modoAnterior.current = modo
  }, [modo, volverAlBoton])

  function abrirEdicion() {
    setTexto(item.nombre)
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
      await actualizar(item.id, cambios)
      if (cambios.nombre !== undefined) cerrar()
      else setModo('viendo')
      onCambio()
    } catch (err) {
      const problema = errorDeAbm(err, porDefecto, config)
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
    const nombre = leerNombre(texto, config.maximoDelNombre, config.mensajeNombreVacio)
    if (!nombre.ok) {
      setErrorDelNombre(nombre.mensaje)
      return
    }
    // Sin cambios no se llama a la API.
    if (nombre.valor === item.nombre) {
      cerrar()
      return
    }
    void enviar({ nombre: nombre.valor }, config.errorAlRenombrar)
  }

  const etiqueta = `«${item.nombre}»`
  const bloqueado = bloqueo !== null
  return (
    <li style={{ padding: '16px 0', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {modo === 'renombrando' ? (
        <form noValidate onSubmit={guardar}>
          <CampoDeNombre
            id={id}
            etiqueta={config.etiquetaDelCampo}
            maximo={config.maximoDelNombre}
            enfocarAlMontar
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
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 600, color: C.text, flex: 1, minWidth: 0 }}>{item.nombre}</span>
          {!item.activa && <span style={pastillaNeutra}>Inactiva</span>}
          {bloqueo && <span style={pastillaMarca}>{bloqueo.pastilla}</span>}
          <button
            type="button"
            ref={botonRenombrar}
            style={conEstado(botonSecundario, enviando)}
            aria-label={`Renombrar ${etiqueta}`}
            disabled={enviando}
            onClick={abrirEdicion}
          >
            Renombrar
          </button>
          {item.activa ? (
            <button
              type="button"
              style={conEstado(botonPeligro, enviando || bloqueado || modo === 'confirmando')}
              aria-label={`Desactivar ${etiqueta}`}
              aria-describedby={bloqueado ? `${id}-bloqueo` : undefined}
              disabled={enviando || bloqueado || modo === 'confirmando'}
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
              onClick={() => void enviar({ activa: true }, config.errorAlActivar)}
            >
              Activar
            </button>
          )}
        </div>
      )}

      {bloqueo && modo !== 'renombrando' && (
        <p id={`${id}-bloqueo`} style={textoAyuda}>
          {bloqueo.ayuda}
        </p>
      )}

      {modo === 'confirmando' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center" style={{ background: C.bg, borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.text, margin: 0, flex: 1 }}>
            {config.textoDeConfirmacion(etiqueta)}
          </p>
          <button type="button" disabled={enviando} style={conEstado(botonPeligroSolido, enviando)} onClick={() => void enviar({ activa: false }, config.errorAlDesactivar)}>
            Confirmar
          </button>
          <button type="button" disabled={enviando} style={conEstado(botonSecundario, enviando)} onClick={() => { setError(null); setModo('viendo') }}>Cancelar</button>
        </div>
      )}

      {error !== null && <p role="alert" style={mensajeDeFalla}>{error}</p>}
    </li>
  )
}
