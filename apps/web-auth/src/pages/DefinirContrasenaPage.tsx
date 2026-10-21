import { isAuthRetryableFetchError } from '@supabase/supabase-js'
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
import { ERROR_GENERICO, mensajeDeError } from '../lib/mensajes'
import { supabase } from '../lib/supabase'

export type ModoContrasena = 'invitacion' | 'recuperacion'

const RUTA: Record<ModoContrasena, string> = {
  invitacion: '/invitacion',
  recuperacion: '/restablecer-contrasena',
}

const LARGO_MINIMO = 8

type Errores = { contrasena?: string; repetida?: string; general?: string }

/**
 * `/invitacion` y `/restablecer-contrasena`, los links de los mails (plantillas "Invite user" y "Reset password" de
 * docs/auth/VariablesACambiar.md). El token_hash se canjea con verifyOtp recién al guardar la contraseña: así un
 * escáner de mail que abra el link no lo gasta, y el formulario solo sirve con un link (no con cualquier sesión).
 */
export function DefinirContrasenaPage({ modo }: { modo: ModoContrasena }) {
  const navigate = useNavigate()
  const { search } = useLocation()
  const { estado, continuar } = usePostLogin()
  const [tokenHash] = useState(() => new URLSearchParams(search).get('token_hash'))
  // El token se canjea una sola vez: si después falla updateUser (por ejemplo, una contraseña débil), se reintenta
  // solo eso, con la sesión que dejó verifyOtp.
  const [canjeado, setCanjeado] = useState(false)
  const [linkInvalido, setLinkInvalido] = useState<string | null>(tokenHash ? null : 'Este link no es válido.')
  const [contrasena, setContrasena] = useState('')
  const [repetida, setRepetida] = useState('')
  const [errores, setErrores] = useState<Errores>({})
  const [guardando, setGuardando] = useState(false)

  // Que el token no quede en la barra ni en el historial: se guarda en el estado.
  useEffect(() => {
    if (tokenHash) navigate(RUTA[modo], { replace: true })
  }, [tokenHash, modo, navigate])

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    const nuevos: Errores = {}
    if (contrasena.length < LARGO_MINIMO) nuevos.contrasena = `Tiene que tener al menos ${LARGO_MINIMO} caracteres.`
    else if (repetida !== contrasena) nuevos.repetida = 'Las contraseñas no coinciden.'
    setErrores(nuevos)
    if (nuevos.contrasena || nuevos.repetida || !tokenHash) return

    setGuardando(true)
    try {
      if (!canjeado) {
        const { data, error } = await supabase().auth.verifyOtp({
          token_hash: tokenHash,
          type: modo === 'invitacion' ? 'invite' : 'recovery',
        })
        if (error && isAuthRetryableFetchError(error)) {
          setErrores({ general: mensajeDeError(error) }) // sin red: el link sigue sirviendo
          return
        }
        if (error || !data.session) {
          setLinkInvalido(error ? mensajeDeError(error) : ERROR_GENERICO)
          return
        }
        setCanjeado(true)
      }
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

  if (estado.tipo === 'verificando') {
    return (
      <Marco titulo={titulo}>
        <Cargando texto="Entrando…" />
      </Marco>
    )
  }

  if (linkInvalido) {
    return (
      <Marco titulo={titulo}>
        <Encabezado titulo="Este link ya no sirve" />
        <Aviso tipo="error">{linkInvalido}</Aviso>
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
          Te invitaron a MenYU. Vas a ingresar con el email de la invitación y esta contraseña.
        </Encabezado>
      ) : (
        <Encabezado titulo="Elegí una contraseña nueva">La vas a usar desde ahora para ingresar a MenYU.</Encabezado>
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
