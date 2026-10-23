import { clienteAuth } from '@menyu/auth-client'
import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Aviso } from '../components/Aviso'
import { Boton } from '../components/Boton'
import { BotonGoogle } from '../components/BotonGoogle'
import { Campo } from '../components/Campo'
import { Encabezado } from '../components/Encabezado'
import { Enlace } from '../components/Enlace'
import { Marco } from '../components/Marco'
import { Separador } from '../components/Separador'
import { conRedirect } from '../flujo/rutas'
import { useIngresoConGoogle } from '../flujo/useIngresoConGoogle'
import { destinoDelCliente, urlsDeApps } from '../lib/destinos'
import { mensajeDeError } from '../lib/mensajes'
import { redirectValido } from '../lib/redirect'

export const LARGO_MINIMO_DE_LA_CONTRASENA = 8
/** El mismo tope que aplica el backend al nombre del `Cliente` (cuenta-de-cliente.service.ts). */
export const LARGO_MAXIMO_DEL_NOMBRE = 80

type Errores = { nombre?: string; email?: string; contrasena?: string; repetida?: string; general?: string }

/**
 * `/crear-cuenta`: el registro de clientes (docs/auth/specs/auth.md, Fase 4b). La cuenta sirve para que las mesas que
 * abre la persona queden a su nombre; no da acceso al personal, que entra solo por invitación.
 *
 * Con "Confirm email" activo (Fase 0), `signUp` no abre sesión: Supabase manda el mail de la plantilla "Confirm signup",
 * cuyo link vuelve a `/confirmar-email` con el `redirect` a web-cliente (ConfirmarEmailPage). Google crea la cuenta
 * al entrar y vuelve por `/google` con el mismo `redirect`. Sin un `redirect` a web-cliente, el destino es su inicio.
 */
export function CrearCuentaPage() {
  const { search } = useLocation()
  const navigate = useNavigate()
  const [destino] = useState(() =>
    destinoDelCliente(redirectValido(new URLSearchParams(search).get('redirect')), urlsDeApps()),
  )
  const searchDelCliente = `?${new URLSearchParams({ redirect: destino })}`
  const { yendoAGoogle, irAGoogle } = useIngresoConGoogle(searchDelCliente)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [repetida, setRepetida] = useState('')
  const [errores, setErrores] = useState<Errores>({})
  const [enviando, setEnviando] = useState(false)
  const [enviadoA, setEnviadoA] = useState<string | null>(null)

  async function crear(evento: FormEvent) {
    evento.preventDefault()
    const nombreLimpio = nombre.replace(/\s+/g, ' ').trim()
    const emailLimpio = email.trim()
    const nuevos: Errores = {}
    if (!nombreLimpio) nuevos.nombre = 'Escribí tu nombre.'
    else if (Array.from(nombreLimpio).length > LARGO_MAXIMO_DEL_NOMBRE) {
      nuevos.nombre = `Puede tener hasta ${LARGO_MAXIMO_DEL_NOMBRE} caracteres.`
    }
    if (!emailLimpio) nuevos.email = 'Escribí tu email.'
    if (contrasena.length < LARGO_MINIMO_DE_LA_CONTRASENA) {
      nuevos.contrasena = `Tiene que tener al menos ${LARGO_MINIMO_DE_LA_CONTRASENA} caracteres.`
    } else if (repetida !== contrasena) nuevos.repetida = 'Las contraseñas no coinciden.'
    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return

    setEnviando(true)
    try {
      const { data, error } = await clienteAuth().auth.signUp({
        email: emailLimpio,
        password: contrasena,
        options: {
          // El backend crea el `Cliente` con este nombre la primera vez que la cuenta abre una mesa.
          data: { nombre: nombreLimpio },
          // La plantilla "Confirm signup" arma el link con esto: `{{ .RedirectTo }}&token_hash=…&type=email`.
          emailRedirectTo: `${window.location.origin}${conRedirect('/confirmar-email', searchDelCliente)}`,
        },
      })
      if (error) {
        setErrores({ general: mensajeDeError(error) })
        return
      }
      // Solo sin "Confirm email" hay sesión en el acto: el post-login de `/` la manda a web-cliente.
      if (data.session) {
        navigate(conRedirect('/', searchDelCliente), { replace: true })
        return
      }
      setEnviadoA(emailLimpio)
    } catch (e) {
      setErrores({ general: mensajeDeError(e) })
    } finally {
      setEnviando(false)
    }
  }

  async function ingresarConGoogle() {
    setErrores({})
    const errorDeGoogle = await irAGoogle()
    if (errorDeGoogle) setErrores({ general: errorDeGoogle })
  }

  const ingresar = (
    <Enlace to={conRedirect('/', search)} replace>
      Ingresá
    </Enlace>
  )

  if (enviadoA) {
    return (
      <Marco titulo="Revisá tu correo">
        <Encabezado titulo="Revisá tu correo" />
        {/* Con la confirmación activa, Supabase no dice si el email ya tenía cuenta (no manda otro mail), y la pantalla
            tampoco, como "Olvidé mi contraseña". */}
        <Aviso tipo="info">
          Te mandamos un link a {enviadoA} para confirmar tu cuenta. Puede tardar unos minutos; revisá también el correo
          no deseado.
        </Aviso>
        <p className="mt-6 text-sm leading-relaxed text-menyu-gris">
          Si ya tenías una cuenta con ese email, no te llega otro link: ingresá con ella o pedí una contraseña nueva
          desde “Olvidé mi contraseña”.
        </p>
        <p className="mt-6 text-sm">{ingresar}</p>
      </Marco>
    )
  }

  return (
    <Marco titulo="Crear cuenta">
      <Encabezado titulo="Creá tu cuenta">
        Con tu cuenta, las mesas que abrís en los restaurantes de MenYU quedan a tu nombre.
      </Encabezado>

      {errores.general && (
        <div className="mb-5">
          <Aviso tipo="error">{errores.general}</Aviso>
        </div>
      )}
      <BotonGoogle
        onClick={() => void ingresarConGoogle()}
        cargando={yendoAGoogle && 'Abriendo Google…'}
        disabled={enviando}
      />

      <Separador texto="o con tu email" />

      <form onSubmit={crear} noValidate className="space-y-5">
        <Campo
          id="nombre"
          etiqueta="Nombre"
          autoComplete="name"
          maxLength={LARGO_MAXIMO_DEL_NOMBRE}
          error={errores.nombre}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Campo
          id="email"
          etiqueta="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errores.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Campo
          id="contrasena"
          etiqueta="Contraseña"
          type="password"
          autoComplete="new-password"
          ayuda={`Al menos ${LARGO_MINIMO_DE_LA_CONTRASENA} caracteres.`}
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
        <Boton type="submit" cargando={enviando && 'Creando la cuenta…'} disabled={yendoAGoogle}>
          Crear cuenta
        </Boton>
      </form>

      <div className="mt-6 space-y-4 text-sm">
        <p>¿Ya tenés cuenta? {ingresar}</p>
        <p className="leading-relaxed text-menyu-gris">
          Al crear tu cuenta aceptás la <Enlace to="/privacidad">política de privacidad</Enlace>. Si trabajás en un
          restaurante, no hace falta: entrás con la invitación que te manda el administrador.
        </p>
      </div>
    </Marco>
  )
}
