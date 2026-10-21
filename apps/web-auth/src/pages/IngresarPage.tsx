import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { Aviso } from '../components/Aviso'
import { Boton } from '../components/Boton'
import { Campo } from '../components/Campo'
import { Cargando } from '../components/Cargando'
import { Encabezado } from '../components/Encabezado'
import { Enlace } from '../components/Enlace'
import { Marco } from '../components/Marco'
import { conRedirect } from '../flujo/rutas'
import { usePostLogin } from '../flujo/usePostLogin'
import { mensajeDeError } from '../lib/mensajes'
import { supabase } from '../lib/supabase'

/** `/`: email y contraseña. Si ya hay una sesión, sigue directo (por ejemplo, cuando otra app manda acá con redirect). */
export function IngresarPage() {
  const { search } = useLocation()
  const { estado, continuar, cerrarSesion } = usePostLogin({ tipo: 'verificando' })
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const revisada = useRef(false)
  useEffect(() => {
    if (revisada.current) return
    revisada.current = true
    void continuar()
  }, [continuar])

  async function ingresar(evento: FormEvent) {
    evento.preventDefault()
    setError(null)
    if (!email.trim() || !contrasena) {
      setError('Completá el email y la contraseña.')
      return
    }
    setEnviando(true)
    try {
      const { error: errorDeLogin } = await supabase().auth.signInWithPassword({
        email: email.trim(),
        password: contrasena,
      })
      if (errorDeLogin) {
        setError(mensajeDeError(errorDeLogin))
        return
      }
      await continuar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  if (estado.tipo === 'verificando') {
    return (
      <Marco titulo="Ingresar">
        <Cargando texto="Entrando…" />
      </Marco>
    )
  }

  if (estado.tipo === 'sin-verificar') {
    return (
      <Marco titulo="Ingresar">
        <Encabezado titulo="No pudimos entrar" />
        <Aviso tipo="error">{estado.mensaje}</Aviso>
        <div className="mt-6 space-y-3">
          <Boton onClick={() => void continuar()}>Probar de nuevo</Boton>
          <Boton variante="secundario" onClick={() => void cerrarSesion()}>
            Cerrar sesión
          </Boton>
        </div>
      </Marco>
    )
  }

  const aviso = error ?? (estado.tipo === 'sesion-vencida' ? estado.mensaje : null)

  return (
    <Marco titulo="Ingresar">
      <Encabezado titulo="Ingresá a MenYU" />

      <form onSubmit={ingresar} noValidate className="space-y-5">
        {aviso && <Aviso tipo="error">{aviso}</Aviso>}
        <Campo
          id="email"
          etiqueta="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Campo
          id="contrasena"
          etiqueta="Contraseña"
          type="password"
          autoComplete="current-password"
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
        />
        <Boton type="submit" cargando={enviando && 'Ingresando…'}>
          Ingresar
        </Boton>
      </form>

      <div className="mt-6 space-y-4 text-sm">
        <p>
          <Enlace to={conRedirect('/olvide-contrasena', search)}>Olvidé mi contraseña</Enlace>
        </p>
        <p className="leading-relaxed text-menyu-gris">
          ¿Te invitaron a un restaurante?
          <br />
          Abrí el link del mail de invitación para crear tu contraseña.
        </p>
      </div>
    </Marco>
  )
}
