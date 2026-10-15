import { useRef, useState, type ChangeEvent } from 'react'
import { ImageIcon, Trash2, Upload } from 'lucide-react'
import { LOGO_ACCEPT, validarLogo } from '../../../utils/logo'
import { mensajeDeError } from '../../../utils/mensajeDeError'
import {
  C,
  botonPeligro,
  botonPeligroSolido,
  botonPrimario,
  botonSecundario,
  conEstado,
  textoAyuda,
} from './estilos'

interface LogoUploaderProps {
  /** Nombre de la marca o sucursal: va en el texto alternativo y en las etiquetas de los botones. */
  nombre: string
  /** Logo propio, o null si todavía no tiene. */
  logoUrl: string | null
  /** Logo que se usa mientras no haya uno propio (el de la marca, en las sucursales). */
  logoHeredadoUrl?: string | null
  textoConLogo: string
  textoSinLogo: string
  textoHeredado?: string
  /** Qué pasa al quitar el logo; se muestra en la confirmación. */
  avisoAlQuitar: string
  onSubir: (archivo: File) => Promise<void>
  onQuitar: () => Promise<void>
}

type Trabajo = 'subiendo' | 'quitando' | null

export function LogoUploader({
  nombre,
  logoUrl,
  logoHeredadoUrl = null,
  textoConLogo,
  textoSinLogo,
  textoHeredado,
  avisoAlQuitar,
  onSubir,
  onQuitar,
}: LogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [trabajo, setTrabajo] = useState<Trabajo>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [urlRota, setUrlRota] = useState<string | null>(null)

  const src = logoUrl ?? logoHeredadoUrl
  const esHeredado = !logoUrl && !!logoHeredadoUrl
  const ocupado = trabajo !== null
  const leyenda = logoUrl ? textoConLogo : esHeredado && textoHeredado ? textoHeredado : textoSinLogo

  async function alElegirArchivo(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    // Se vacía el input para poder volver a elegir el mismo archivo si falló.
    e.target.value = ''
    if (!archivo) return

    setAviso(null)
    const motivo = validarLogo(archivo)
    if (motivo) {
      setError(motivo)
      return
    }

    setError(null)
    setTrabajo('subiendo')
    try {
      await onSubir(archivo)
      setAviso('Logo actualizado')
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo subir el logo. Probá de nuevo.'))
    } finally {
      setTrabajo(null)
    }
  }

  async function quitar() {
    setConfirmando(false)
    setError(null)
    setAviso(null)
    setTrabajo('quitando')
    try {
      await onQuitar()
      setAviso('Logo quitado')
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo quitar el logo. Probá de nuevo.'))
    } finally {
      setTrabajo(null)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
      <div
        style={{
          width:          96,
          height:         96,
          flexShrink:     0,
          borderRadius:   16,
          border:         esHeredado ? `2px dashed ${C.border}` : `1px solid ${C.border}`,
          background:     C.bg,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          overflow:       'hidden',
        }}
      >
        {src && src !== urlRota ? (
          <img
            src={src}
            alt={`Logo de ${nombre}`}
            onError={() => setUrlRota(src)}
            style={{
              width:     '100%',
              height:    '100%',
              objectFit: 'contain',
              padding:   6,
              opacity:   esHeredado ? 0.7 : 1,
            }}
          />
        ) : (
          <ImageIcon size={32} color={C.muted} aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 600,
            fontSize:   13,
            color:      C.navy,
            margin:     '0 0 10px',
          }}
        >
          {leyenda}
        </p>

        {confirmando ? (
          <div role="group" aria-label={`Confirmar quitar el logo de ${nombre}`}>
            <p style={{ ...textoAyuda, color: C.text, fontSize: 13, marginBottom: 10 }}>
              ¿Quitar el logo de {nombre}? {avisoAlQuitar}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={quitar} style={botonPeligroSolido}>
                Sí, quitar
              </button>
              <button type="button" onClick={() => setConfirmando(false)} style={botonSecundario}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => inputRef.current?.click()}
              aria-label={`${logoUrl ? 'Cambiar' : 'Subir'} logo de ${nombre}`}
              style={conEstado(logoUrl ? botonSecundario : botonPrimario, ocupado)}
            >
              <Upload size={16} aria-hidden="true" />
              {trabajo === 'subiendo' ? 'Subiendo…' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
            </button>
            {logoUrl && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  setError(null)
                  setAviso(null)
                  setConfirmando(true)
                }}
                aria-label={`Quitar logo de ${nombre}`}
                style={conEstado(botonPeligro, ocupado)}
              >
                <Trash2 size={16} aria-hidden="true" />
                {trabajo === 'quitando' ? 'Quitando…' : 'Quitar logo'}
              </button>
            )}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={LOGO_ACCEPT}
          onChange={alElegirArchivo}
          aria-label={`Archivo del logo de ${nombre}`}
          hidden
        />

        <p style={{ ...textoAyuda, marginTop: 10 }}>PNG, JPG o WebP · hasta 2 MB</p>

        {error && (
          <p role="alert" style={{ ...textoAyuda, color: C.red, fontSize: 13, marginTop: 8 }}>
            {error}
          </p>
        )}
        {aviso && !error && (
          <p role="status" style={{ ...textoAyuda, color: C.green, fontSize: 13, marginTop: 8 }}>
            {aviso}
          </p>
        )}
      </div>
    </div>
  )
}
