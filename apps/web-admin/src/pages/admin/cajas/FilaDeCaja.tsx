import { useId, useState, type FormEvent } from 'react'
import type { CajaDelRestaurante } from '@menyu/types'
import { Badge, Button } from '@menyu/ui'
import { api } from '../../../services/api'
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
    <li className="border border-gray-200 rounded-lg bg-white px-4 py-3 flex flex-col gap-2">
      {modo === 'renombrando' ? (
        <form noValidate onSubmit={guardar}>
          <CampoDeNombre
            id={id}
            autoFocus
            valor={texto}
            error={errorDelNombre}
            className="py-1 text-sm w-56"
            onChange={(valor) => {
              setTexto(valor)
              setErrorDelNombre(null)
              setError(null)
            }}
          >
            <Button type="submit" size="sm" loading={enviando}>Guardar</Button>
            <Button type="button" variant="ghost" size="sm" disabled={enviando} onClick={() => { setError(null); cerrar() }}>
              Cancelar
            </Button>
          </CampoDeNombre>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800 flex-1">{caja.nombre}</span>
          {!caja.activa && <Badge>Inactiva</Badge>}
          {abierta && <Badge variant="info">Abierta en el turno</Badge>}
          <Button
            autoFocus={volverAlBoton}
            variant="ghost"
            size="sm"
            aria-label={`Renombrar ${etiqueta}`}
            disabled={enviando}
            onClick={abrirEdicion}
          >
            Renombrar
          </Button>
          {caja.activa ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Desactivar ${etiqueta}`}
              aria-describedby={abierta ? `${id}-abierta` : undefined}
              disabled={enviando || abierta || modo === 'confirmando'}
              onClick={() => { setError(null); setModo('confirmando') }}
            >
              Desactivar
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Activar ${etiqueta}`}
              loading={enviando}
              onClick={() => void enviar({ activa: true }, 'No se pudo activar la caja')}
            >
              Activar
            </Button>
          )}
        </div>
      )}

      {abierta && modo !== 'renombrando' && (
        <p id={`${id}-abierta`} className="text-xs text-gray-500">
          No se puede desactivar con el turno abierto: se cierra desde la app del personal, en Caja
        </p>
      )}

      {modo === 'confirmando' && (
        <div className="flex items-center gap-2 bg-gray-50 rounded-md px-3 py-2">
          <p className="text-sm text-gray-700 flex-1">
            ¿Desactivar {etiqueta}? No se va a poder abrir en turnos nuevos. Podés volver a activarla.
          </p>
          <Button variant="danger" size="sm" loading={enviando} onClick={() => void enviar({ activa: false }, 'No se pudo desactivar la caja')}>
            Confirmar
          </Button>
          <Button variant="ghost" size="sm" disabled={enviando} onClick={() => { setError(null); setModo('viendo') }}>Cancelar</Button>
        </div>
      )}

      {error !== null && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </li>
  )
}
