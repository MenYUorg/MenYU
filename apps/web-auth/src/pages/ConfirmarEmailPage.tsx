import { clienteAuth } from '@menyu/auth-client'
import { isAuthRetryableFetchError, type EmailOtpType } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Aviso } from '../components/Aviso'
import { Boton } from '../components/Boton'
import { Cargando } from '../components/Cargando'
import { Encabezado } from '../components/Encabezado'
import { Enlace } from '../components/Enlace'
import { Marco } from '../components/Marco'
import { conRedirect } from '../flujo/rutas'
import { usePostLogin } from '../flujo/usePostLogin'
import { ERROR_GENERICO, mensajeDeError } from '../lib/mensajes'

/** El `type` del link. La plantilla manda `email`; `signup` es el nombre anterior del mismo canje. */
function tipoDelLink(valor: string | null): EmailOtpType {
  return valor === 'signup' ? 'signup' : 'email'
}

/**
 * `/confirmar-email`: el link del mail que confirma una cuenta de cliente (plantilla "Confirm signup" de
 * docs/auth/VariablesACambiar.md, Fase 4b). Trae el `token_hash` y el `redirect` a web-cliente que dejó
 * CrearCuentaPage. El token se canjea con verifyOtp recién al tocar el botón, como en /invitacion: un escáner de mail
 * que abra el link no lo gasta. Con la sesión abierta, el post-login la devuelve a web-cliente.
 */
export function ConfirmarEmailPage() {
  const navigate = useNavigate()
  const { search } = useLocation()
  const { estado, continuar } = usePostLogin()
  const [inicial] = useState(() => {
    const params = new URLSearchParams(search)
    return { tokenHash: params.get('token_hash'), tipo: tipoDelLink(params.get('type')), search }
  })
  // El token se canjea una sola vez: si después el post-login no puede seguir (el backend no respondió), se reintenta
  // solo eso, con la sesión que dejó verifyOtp.
  const [canjeado, setCanjeado] = useState(false)
  const [linkInvalido, setLinkInvalido] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  // Que el token no quede en la barra ni en el historial: se guarda en el estado. El `redirect` se queda.
  useEffect(() => {
    if (inicial.tokenHash) navigate(conRedirect('/confirmar-email', inicial.search), { replace: true })
  }, [inicial, navigate])

  async function confirmar() {
    if (!inicial.tokenHash) return
    setError(null)
    setConfirmando(true)
    try {
      if (!canjeado) {
        const { data, error: errorDelCanje } = await clienteAuth().auth.verifyOtp({
          token_hash: inicial.tokenHash,
          type: inicial.tipo,
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

  if (!inicial.tokenHash) {
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

  // La sesión del canje venció o el backend la rechazó: el email ya quedó confirmado, así que se ingresa normal.
  if (estado.tipo === 'sesion-vencida') {
    return (
      <Marco titulo="Confirmar el email">
        <Encabezado titulo="Tu cuenta está confirmada" />
        <Aviso tipo="error">{estado.mensaje}</Aviso>
        <p className="mt-6 text-sm">{ingresar}</p>
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
