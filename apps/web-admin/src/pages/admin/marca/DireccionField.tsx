import { useEffect, useId, useState, type FormEvent } from 'react'
import { mensajeDeError } from '../../../utils/mensajeDeError'
import { C, botonPrimario, conEstado, textoAyuda } from './estilos'

// Mismo tope que valida el backend.
const DIRECCION_MAX = 200

interface DireccionFieldProps {
  /** Nombre de la sucursal, para que el campo se identifique bien con un lector de pantalla. */
  nombre: string
  /** Dirección guardada, o null si la sucursal todavía no tiene. */
  direccion: string | null
  onGuardar: (direccion: string) => Promise<void>
}

export function DireccionField({ nombre, direccion, onGuardar }: DireccionFieldProps) {
  const idInput = useId()
  const idMensaje = useId()
  const guardada = direccion ?? ''
  const [valor, setValor] = useState(guardada)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Si la dirección guardada cambia desde afuera (por ejemplo al recargar los datos), el campo la refleja.
  useEffect(() => {
    setValor(guardada)
  }, [guardada])

  const limpia = valor.trim()
  const vacia = limpia.length === 0
  const cambio = limpia !== guardada
  const errorValidacion = vacia && valor !== guardada ? 'La dirección es obligatoria' : null
  const puedeGuardar = !guardando && !vacia && cambio
  const mensajeError = errorValidacion ?? error

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!puedeGuardar) return

    setError(null)
    setAviso(null)
    setGuardando(true)
    try {
      await onGuardar(limpia)
      setAviso('Dirección guardada')
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar la dirección. Probá de nuevo.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} noValidate aria-label={`Dirección de ${nombre}`}>
      <label
        htmlFor={idInput}
        style={{
          display:      'block',
          fontFamily:   'Montserrat, sans-serif',
          fontWeight:   600,
          fontSize:     13,
          color:        C.navy,
          marginBottom: 8,
        }}
      >
        Dirección
      </label>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          id={idInput}
          type="text"
          value={valor}
          maxLength={DIRECCION_MAX}
          placeholder="Ej: Av. Corrientes 1234, CABA"
          autoComplete="street-address"
          aria-invalid={mensajeError ? true : undefined}
          aria-describedby={idMensaje}
          onChange={(e) => {
            setValor(e.target.value)
            setAviso(null)
            setError(null)
          }}
          className="min-w-0 flex-1"
          style={{
            minHeight:    44,
            padding:      '0 12px',
            borderRadius: 10,
            border:       `1px solid ${mensajeError ? C.red : C.border}`,
            fontFamily:   'Inter, sans-serif',
            // 16px evita que iOS haga zoom al enfocar el campo.
            fontSize:     16,
            color:        C.text,
            background:   'white',
          }}
        />
        <button
          type="submit"
          disabled={!puedeGuardar}
          style={conEstado(botonPrimario, !puedeGuardar)}
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      <div id={idMensaje} style={{ marginTop: 8, minHeight: 18 }}>
        {mensajeError ? (
          <p role="alert" style={{ ...textoAyuda, color: C.red, fontSize: 13 }}>
            {mensajeError}
          </p>
        ) : aviso ? (
          <p role="status" style={{ ...textoAyuda, color: C.green, fontSize: 13 }}>
            {aviso}
          </p>
        ) : guardada === '' ? (
          <p style={{ ...textoAyuda, color: C.orange, fontSize: 13 }}>
            Esta sucursal todavía no tiene dirección.
          </p>
        ) : (
          <p style={textoAyuda}>Se muestra a los comensales junto al nombre de la sucursal.</p>
        )}
      </div>
    </form>
  )
}
