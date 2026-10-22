import { useState, type FormEvent } from 'react'
import { Mail } from 'lucide-react'
import { ApiError, api } from '../../../services/api'
import { Campo } from '../ui/Campo'
import { Dialogo } from '../ui/Dialogo'
import { AvisoDeError } from './AvisoDeError'
import { emailParaInvitar, errorDeEmail, errorDeNombreDePersona } from './cuentas'
import { useEnvio } from './envio'
import type { Invitado } from './invitar-dueno'

interface DialogoInvitarRootProps {
  onInvitada: (invitada: Invitado) => void
  onCerrar: () => void
}

/**
 * Invitar a otra cuenta ROOT. Solo para quien todavía no tiene cuenta en MenYU: la API responde 409 si el email ya es de una
 * cuenta (de un dueño, del personal o de otro ROOT), porque hacerla ROOT es del script de cuentas ROOT.
 */
export function DialogoInvitarRoot({ onInvitada, onCerrar }: DialogoInvitarRootProps) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [intento, setIntento] = useState(false)
  const [conCuenta, setConCuenta] = useState(false)
  const { ocupado, error, enviar } = useEnvio()

  const errorNombre = intento ? errorDeNombreDePersona(nombre) : ''
  const errorEmail = conCuenta
    ? 'Ese email ya tiene una cuenta de MenYU, así que no se puede invitar desde acá. Para hacerla ROOT, el equipo usa el script de cuentas ROOT.'
    : intento
      ? errorDeEmail(email)
      : ''

  function enviarFormulario(e: FormEvent) {
    e.preventDefault()
    if (ocupado) return
    setIntento(true)
    if (errorDeNombreDePersona(nombre) || errorDeEmail(email)) return
    const datos = { email: emailParaInvitar(email), nombre: nombre.trim() }
    void enviar(
      () => api.root.cuentas.invitar(datos),
      (respuesta) => onInvitada({ email: datos.email, enviada: respuesta.invitacionEnviada }),
      (fallo) => {
        if (fallo instanceof ApiError && fallo.status === 409) {
          setConCuenta(true)
          return true
        }
        return false
      },
    )
  }

  return (
    <Dialogo
      titulo="Invitar cuenta ROOT"
      descripcion="Para otra persona del equipo. Va a poder lo mismo que vos: administrar marcas, restaurantes y dueños, invitar a otras cuentas ROOT y ver el historial. Le mandamos un mail con un enlace para elegir su contraseña."
      onCerrar={onCerrar}
      ocupado={ocupado}
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button type="submit" form="form-invitar-root" className="btn btn-primary" disabled={ocupado}>
            <Mail size={16} aria-hidden="true" />
            {ocupado ? 'Enviando…' : 'Enviar invitación'}
          </button>
        </>
      }
    >
      <AvisoDeError texto={error} />
      <form id="form-invitar-root" onSubmit={enviarFormulario} noValidate>
        <Campo
          etiqueta="Nombre *"
          value={nombre}
          placeholder="Ej.: Bruno Gómez"
          error={errorNombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Campo
          etiqueta="Email *"
          type="email"
          inputMode="email"
          value={email}
          placeholder="persona@menyu.com"
          error={errorEmail}
          ayuda="Tiene que ser una persona que todavía no tenga cuenta en MenYU."
          onChange={(e) => {
            setEmail(e.target.value)
            setConCuenta(false)
          }}
        />
      </form>
    </Dialogo>
  )
}
