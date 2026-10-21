import { useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { Aviso } from '../components/Aviso'
import { Boton } from '../components/Boton'
import { Campo } from '../components/Campo'
import { Encabezado } from '../components/Encabezado'
import { Enlace } from '../components/Enlace'
import { Marco } from '../components/Marco'
import { conRedirect } from '../flujo/rutas'
import { mensajeDeError } from '../lib/mensajes'
import { supabase } from '../lib/supabase'

/**
 * `/olvide-contrasena`: manda el mail de recuperación. El link (plantilla "Reset password") lleva a
 * /restablecer-contrasena. Supabase no dice si el email tiene cuenta, y la pantalla tampoco.
 */
export function OlvideContrasenaPage() {
  const { search } = useLocation()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviadoA, setEnviadoA] = useState<string | null>(null)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setError(null)
    const destinatario = email.trim()
    if (!destinatario) {
      setError('Escribí el email de tu cuenta.')
      return
    }
    setEnviando(true)
    try {
      const { error: errorDeEnvio } = await supabase().auth.resetPasswordForEmail(destinatario)
      if (errorDeEnvio) {
        setError(mensajeDeError(errorDeEnvio))
        return
      }
      setEnviadoA(destinatario)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  const volver = (
    <p className="mt-6 text-sm">
      <Enlace to={conRedirect('/', search)}>Volver a ingresar</Enlace>
    </p>
  )

  if (enviadoA) {
    return (
      <Marco titulo="Revisá tu correo">
        <Encabezado titulo="Revisá tu correo" />
        <Aviso tipo="info">
          Si hay una cuenta con {enviadoA}, te mandamos un link para crear una contraseña nueva. Puede tardar unos
          minutos; revisá también el correo no deseado.
        </Aviso>
        {volver}
      </Marco>
    )
  }

  return (
    <Marco titulo="Recuperar la contraseña">
      <Encabezado titulo="Recuperá tu contraseña">Te mandamos un link por mail para crear una nueva.</Encabezado>
      <form onSubmit={enviar} noValidate className="space-y-5">
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Campo
          id="email"
          etiqueta="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Boton type="submit" cargando={enviando && 'Enviando…'}>
          Enviar el link
        </Boton>
      </form>
      {volver}
    </Marco>
  )
}
