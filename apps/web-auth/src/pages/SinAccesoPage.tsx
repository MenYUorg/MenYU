import { useEffect, useState } from 'react'
import { Boton } from '../components/Boton'
import { Encabezado } from '../components/Encabezado'
import { Marco } from '../components/Marco'
import { usePostLogin } from '../flujo/usePostLogin'
import { supabase } from '../lib/supabase'

/**
 * `/sin-acceso`: la cuenta existe en Supabase pero no tiene `Usuario` en nuestra base (403 en /auth/me) o no tiene
 * membresías. Iniciar sesión no da acceso: lo da la invitación (docs/auth/specs/auth.md, Notas de seguridad).
 */
export function SinAccesoPage() {
  const { cerrarSesion } = usePostLogin()
  const [email, setEmail] = useState<string | null>(null)
  const [cerrando, setCerrando] = useState(false)

  useEffect(() => {
    let vigente = true
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (vigente) setEmail(data.session?.user.email ?? null)
      })
      .catch(() => undefined)
    return () => {
      vigente = false
    }
  }, [])

  return (
    <Marco titulo="Sin acceso">
      <Encabezado titulo="Tu cuenta no tiene acceso">
        Pedile una invitación al administrador de tu restaurante. Cuando te invite, te llega un mail para entrar.
      </Encabezado>
      {email && <p className="-mt-4 mb-8 text-sm text-menyu-gris">Entraste como {email}.</p>}
      <Boton
        variante="secundario"
        cargando={cerrando && 'Cerrando sesión…'}
        onClick={() => {
          setCerrando(true)
          void cerrarSesion()
        }}
      >
        Cerrar sesión
      </Boton>
    </Marco>
  )
}
