import { clienteAuth } from '@menyu/auth-client'
import { isAuthRetryableFetchError, type EmailOtpType } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Aviso } from '../components/Aviso'
import { Boton } from '../components/Boton'
import { Cargando } from '../components/Cargando'
import { Encabezado } from '../components/Encabezado'
import { Enlace } from '../components/Enlace'
import { Marco } from '../components/Marco'
import { conRedirect } from '../flujo/rutas'
import { usePostLogin } from '../flujo/usePostLogin'
import { ERROR_GENERICO, mensajeDeError, mensajePorCodigo } from '../lib/mensajes'

const LINK_QUE_NO_SIRVE = 'No pudimos confirmar tu cuenta con este link.'

type Link =
  /** El de la plantilla de MenYU: se canjea con verifyOtp. `signup` es el nombre anterior del mismo canje. */
  | { tipo: 'token'; tokenHash: string; otp: EmailOtpType }
  /** El de la plantilla por defecto de Supabase: ya confirmó el email y vuelve con un `?code=` del flujo PKCE. */
  | { tipo: 'codigo' }
  /** Supabase no pudo confirmar (por ejemplo, el link venció) y vuelve con el error. */
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'ninguno' }

function leerLink(search: string, hash: string): Link {
  const params = new URLSearchParams(search)
  const delHash = new URLSearchParams(hash.replace(/^#/, ''))
  const codigoDeError = params.get('error_code') ?? delHash.get('error_code')
  if (codigoDeError || params.has('error') || delHash.has('error')) {
    return { tipo: 'error', mensaje: mensajePorCodigo(codigoDeError) ?? LINK_QUE_NO_SIRVE }
  }
  const tokenHash = params.get('token_hash')
  if (tokenHash) return { tipo: 'token', tokenHash, otp: params.get('type') === 'signup' ? 'signup' : 'email' }
  if (params.get('code')) return { tipo: 'codigo' }
  return { tipo: 'ninguno' }
}

/**
 * `/confirmar-email`: el link del mail que confirma una cuenta de cliente (Fase 4b). Vuelve con el `redirect` a
 * web-cliente que dejó CrearCuentaPage y, con la sesión abierta, el post-login la devuelve ahí.
 *
 * - Con la plantilla "Confirm signup" de MenYU (docs/auth/VariablesACambiar.md) trae un `token_hash`, que se canjea con
 *   verifyOtp recién al tocar el botón, como en /invitacion: un escáner de mail que abra el link no lo gasta. Sirve
 *   desde cualquier navegador.
 * - Con la plantilla por defecto de Supabase, el link pasa primero por Supabase, que confirma el email y vuelve con un
 *   `?code=` que el cliente canjea al inicializarse, como /google. Solo abre la sesión en el navegador en el que se creó
 *   la cuenta (ahí está el verificador PKCE); en otro, la cuenta igual quedó confirmada y se ingresa normal.
 */
export function ConfirmarEmailPage() {
  const navigate = useNavigate()
  const { search, hash } = useLocation()
  const { estado, continuar } = usePostLogin()
  const [inicial] = useState(() => ({ link: leerLink(search, hash), search }))
  const { link } = inicial
  // El link se canjea una sola vez: si después el post-login no puede seguir (el backend no respondió), se reintenta
  // solo eso, con la sesión que dejó el canje.
  const [canjeado, setCanjeado] = useState(false)
  const [confirmadaSinSesion, setConfirmadaSinSesion] = useState(false)
  const [linkInvalido, setLinkInvalido] = useState<string | null>(link.tipo === 'error' ? link.mensaje : null)
  const [error, setError] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  // Que el token (o el error) no quede en la barra ni en el historial. El `redirect` se queda. El `?code=` no se toca:
  // lo lee el cliente de Supabase al inicializarse.
  useEffect(() => {
    if (link.tipo === 'token' || link.tipo === 'error') {
      navigate(conRedirect('/confirmar-email', inicial.search), { replace: true })
    }
  }, [link, inicial, navigate])

  const revisado = useRef(false)
  useEffect(() => {
    if (link.tipo !== 'codigo' || revisado.current) return
    revisado.current = true

    async function canjearElCodigo() {
      try {
        const { error: errorDelCanje } = await clienteAuth().auth.initialize()
        const { data } = await clienteAuth().auth.getSession()
        if (errorDelCanje || !data.session) {
          setConfirmadaSinSesion(true)
          return
        }
        setCanjeado(true)
        await continuar()
      } catch {
        setConfirmadaSinSesion(true)
      }
    }
    void canjearElCodigo()
  }, [link, continuar])

  async function confirmar() {
    setError(null)
    setConfirmando(true)
    try {
      if (!canjeado) {
        if (link.tipo !== 'token') return
        const { data, error: errorDelCanje } = await clienteAuth().auth.verifyOtp({
          token_hash: link.tokenHash,
          type: link.otp,
        })
        if (errorDelCanje && isAuthRetryableFetchError(errorDelCanje)) {
          setError(mensajeDeError(errorDelCanje)) // sin red: el link sigue sirviendo
          return
        }
        if (errorDelCanje || !data.session) {
          setLinkInvalido(errorDelCanje ? mensajeDeError(errorDelCanje) : ERROR_GENERICO)
          return
        }
        setCanjeado(true)
      }
      await continuar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setConfirmando(false)
    }
  }

  const ingresar = (
    <Enlace to={conRedirect('/', inicial.search)} replace>
      Ingresar
    </Enlace>
  )

  if (estado.tipo === 'verificando') {
    return (
      <Marco titulo="Confirmar el email">
        <Cargando texto="Entrando…" />
      </Marco>
    )
  }

  if (link.tipo === 'codigo' && !canjeado && !confirmadaSinSesion) {
    return (
      <Marco titulo="Confirmar el email">
        <Cargando texto="Confirmando tu cuenta…" />
      </Marco>
    )
  }

  // El email ya quedó confirmado, pero no hay sesión: el link se abrió en otro navegador, o el backend rechazó la
  // sesión del canje. Se ingresa normal.
  if (confirmadaSinSesion || estado.tipo === 'sesion-vencida') {
    return (
      <Marco titulo="Confirmar el email">
        <Encabezado titulo="Tu cuenta está confirmada">Ingresá con tu email y tu contraseña.</Encabezado>
        {estado.tipo === 'sesion-vencida' && <Aviso tipo="error">{estado.mensaje}</Aviso>}
        <p className="mt-6 text-sm">{ingresar}</p>
      </Marco>
    )
  }

  if (link.tipo === 'ninguno') {
    return (
      <Marco titulo="Confirmar el email">
        <Encabezado titulo="Abrí el link del mail">
          Para confirmar tu cuenta, abrí el link que te mandamos por mail. Si ya la confirmaste, ingresá con tu email y
          tu contraseña.
        </Encabezado>
        <p className="text-sm">{ingresar}</p>
      </Marco>
    )
  }

  if (linkInvalido) {
    return (
      <Marco titulo="Confirmar el email">
        <Encabezado titulo="Este link ya no sirve" />
        <Aviso tipo="error">{linkInvalido}</Aviso>
        <p className="mt-6 leading-relaxed text-menyu-gris">
          Si ya confirmaste tu cuenta, ingresá con tu email y tu contraseña. Si no, creala de nuevo con el mismo email y
          te mandamos otro link.
        </p>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          {ingresar}
          <Enlace to={conRedirect('/crear-cuenta', inicial.search)} replace>
            Crear la cuenta
          </Enlace>
        </div>
      </Marco>
    )
  }

  // Si el canje salió pero el backend no respondió, el post-login deja su mensaje y el botón reintenta solo eso.
  const aviso = error ?? (estado.tipo === 'sin-verificar' ? estado.mensaje : null)

  return (
    <Marco titulo="Confirmar el email">
      <Encabezado titulo="Confirmá tu email">Tocá el botón para confirmar tu cuenta y volver a MenYU.</Encabezado>
      {aviso && (
        <div className="mb-5">
          <Aviso tipo="error">{aviso}</Aviso>
        </div>
      )}
      <Boton onClick={() => void confirmar()} cargando={confirmando && 'Confirmando…'}>
        {canjeado ? 'Probar de nuevo' : 'Confirmar y entrar'}
      </Boton>
    </Marco>
  )
}
