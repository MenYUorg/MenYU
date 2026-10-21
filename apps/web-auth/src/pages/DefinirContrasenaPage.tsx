import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Aviso } from '../components/Aviso'
import { Boton } from '../components/Boton'
import { Campo } from '../components/Campo'
import { Cargando } from '../components/Cargando'
import { Encabezado } from '../components/Encabezado'
import { Enlace } from '../components/Enlace'
import { Marco } from '../components/Marco'
import { usePostLogin } from '../flujo/usePostLogin'
import { verificarLink } from '../flujo/verificarLink'
import { ERROR_GENERICO, mensajeDeError } from '../lib/mensajes'
import { supabase } from '../lib/supabase'

export type ModoContrasena = 'invitacion' | 'recuperacion'

const RUTA: Record<ModoContrasena, string> = {
  invitacion: '/invitacion',
  recuperacion: '/restablecer-contrasena',
}

const LARGO_MINIMO = 8

type Paso =
  | { tipo: 'revisando-link' }
  | { tipo: 'formulario'; email: string }
  | { tipo: 'link-invalido'; mensaje: string }

/**
 * `/invitacion` y `/restablecer-contrasena`, los links de los mails (plantillas "Invite user" y "Reset password" de
 * docs/auth/VariablesACambiar.md). Canjea el token_hash por una sesión, pide la contraseña y sigue como un login.
 */
export function DefinirContrasenaPage({ modo }: { modo: ModoContrasena }) {
  const navigate = useNavigate()
  const { search } = useLocation()
  const { estado, continuar } = usePostLogin()
  const [tokenHash] = useState(() => new URLSearchParams(search).get('token_hash'))
  const [paso, setPaso] = useState<Paso>({ tipo: 'revisando-link' })
  const [contrasena, setContrasena] = useState('')
  const [repetida, setRepetida] = useState('')
  const [errores, setErrores] = useState<{ contrasena?: string; repetida?: string; general?: string }>({})
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vigente = true
    async function preparar() {
      try {
        if (tokenHash) {
          const { data, error } = await verificarLink(tokenHash, modo === 'invitacion' ? 'invite' : 'recovery')
          if (!vigente) return
          // El token ya no sirve: que no quede en la URL ni en el historial.
          navigate(RUTA[modo], { replace: true })
          if (error || !data.user) {
            setPaso({ tipo: 'link-invalido', mensaje: error ? mensajeDeError(error) : ERROR_GENERICO })
          } else {
            setPaso({ tipo: 'formulario', email: data.user.email ?? '' })
          }
          return
        }
        // Sin token: alguien que recargó la página después de abrir el link.
        const { data } = await supabase().auth.getSession()
        if (!vigente) return
        setPaso(
          data.session
            ? { tipo: 'formulario', email: data.session.user.email ?? '' }
            : { tipo: 'link-invalido', mensaje: 'Este link no es válido.' },
        )
      } catch (e) {
        if (vigente) setPaso({ tipo: 'link-invalido', mensaje: mensajeDeError(e) })
      }
    }
    void preparar()
    return () => {
      vigente = false
    }
  }, [tokenHash, modo, navigate])

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    const nuevos: typeof errores = {}
    if (contrasena.length < LARGO_MINIMO) nuevos.contrasena = `Tiene que tener al menos ${LARGO_MINIMO} caracteres.`
    else if (repetida !== contrasena) nuevos.repetida = 'Las contraseñas no coinciden.'
    setErrores(nuevos)
    if (nuevos.contrasena || nuevos.repetida) return

    setGuardando(true)
    try {
      const { error } = await supabase().auth.updateUser({ password: contrasena })
      if (error) {
        setErrores({ general: mensajeDeError(error) })
        return
      }
      await continuar()
    } catch (e) {
      setErrores({ general: mensajeDeError(e) })
    } finally {
      setGuardando(false)
    }
  }

  const titulo = modo === 'invitacion' ? 'Crear la contraseña' : 'Contraseña nueva'

  if (paso.tipo === 'revisando-link' || estado.tipo === 'verificando') {
    return (
      <Marco titulo={titulo}>
        <Cargando texto={paso.tipo === 'revisando-link' ? 'Revisando el link…' : 'Entrando…'} />
      </Marco>
    )
  }

  if (paso.tipo === 'link-invalido') {
    return (
      <Marco titulo={titulo}>
        <Encabezado titulo="Este link ya no sirve" />
        <Aviso tipo="error">{paso.mensaje}</Aviso>
        <p className="mt-6 leading-relaxed text-menyu-gris">
          {modo === 'invitacion'
            ? 'Si ya creaste tu contraseña, ingresá con tu email. Si no, pedí un link nuevo desde “Olvidé mi contraseña” con el mismo email de la invitación.'
            : 'Pedí un link nuevo: vence a la hora y sirve una sola vez.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <Enlace to="/olvide-contrasena">Pedir un link nuevo</Enlace>
          <Enlace to="/">Ingresar</Enlace>
        </div>
      </Marco>
    )
  }

  const general = errores.general ?? (estado.tipo !== 'listo' ? estado.mensaje : undefined)

  return (
    <Marco titulo={titulo}>
      {modo === 'invitacion' ? (
        <Encabezado titulo="Creá tu contraseña">
          Te invitaron a MenYU con {paso.email}. Vas a ingresar con ese email y esta contraseña.
        </Encabezado>
      ) : (
        <Encabezado titulo="Elegí una contraseña nueva">Para la cuenta {paso.email}.</Encabezado>
      )}

      <form onSubmit={guardar} noValidate className="space-y-5">
        {general && <Aviso tipo="error">{general}</Aviso>}
        <Campo
          id="contrasena"
          etiqueta="Contraseña"
          type="password"
          autoComplete="new-password"
          ayuda={`Al menos ${LARGO_MINIMO} caracteres.`}
          error={errores.contrasena}
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
        />
        <Campo
          id="repetida"
          etiqueta="Repetí la contraseña"
          type="password"
          autoComplete="new-password"
          error={errores.repetida}
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
        />
        <Boton type="submit" cargando={guardando && 'Guardando…'}>
          Guardar y entrar
        </Boton>
      </form>
    </Marco>
  )
}
