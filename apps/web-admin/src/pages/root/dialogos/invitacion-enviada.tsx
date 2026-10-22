import { Check, Mail } from 'lucide-react'
import { Dialogo } from '../ui/Dialogo'

interface DialogoInvitacionEnviadaProps {
  email: string
  /** `true`: se le mandó el mail. `false`: la persona ya tenía una cuenta y no se le mandó ninguno. */
  enviada: boolean
  /** La invitación fue a una cuenta ROOT y no a un dueño. */
  aRoot?: boolean
  onCerrar: () => void
}

/**
 * Lo que pasó después de invitar: a quién le llegó el mail, o que no se mandó porque la persona ya tenía una cuenta.
 *
 * Con un dueño, "ya tenía una cuenta" quiere decir que su `Usuario` ya existe en MenYU (es dueño de otra marca, es personal de
 * un restaurante o es alguien a quien ya se había invitado y se le quitó el acceso): la API solo le suma la marca y no manda
 * mail, aunque esa persona nunca haya llegado a aceptar la primera invitación. Por eso el texto no promete que "ya puede
 * entrar": le dice cómo pedir un enlace nuevo. Con una cuenta ROOT, en cambio, `invitacionEnviada: false` es una cuenta de
 * acceso ya confirmada (por ejemplo, la que creó con Google): esa sí puede entrar.
 */
export function DialogoInvitacionEnviada({ email, enviada, aRoot = false, onCerrar }: DialogoInvitacionEnviadaProps) {
  return (
    <Dialogo
      icono={enviada ? Mail : Check}
      titulo={enviada ? 'Invitación enviada' : 'Ya tenía una cuenta'}
      descripcion={
        enviada ? (
          <>
            Le mandamos un mail a <b>{email}</b> con el enlace para elegir su contraseña y entrar. Si no le llega, que revise el correo
            no deseado.
          </>
        ) : aRoot ? (
          <>
            <b>{email}</b> ya tiene una cuenta de acceso (por ejemplo, la que creó con Google), así que no hace falta ningún mail: ya
            puede entrar y usar la consola de ROOT con su contraseña de siempre o con Google.
          </>
        ) : (
          <>
            <b>{email}</b> ya tiene una cuenta de MenYU, así que no se le mandó ningún mail: ya figura como dueño y entra con su
            contraseña de siempre o con Google.
          </>
        )
      }
      onCerrar={onCerrar}
      avisaRegistro={false}
      pie={
        <button type="button" className="btn btn-primary" onClick={onCerrar}>
          Listo
        </button>
      }
    >
      {enviada && (
        <p className="ayuda">Si el enlace deja de servir, puede pedir uno nuevo desde «Olvidé mi contraseña» con ese mismo email.</p>
      )}
      {!enviada && !aRoot && (
        <p className="ayuda">
          Si nunca llegó a aceptar una invitación anterior, puede pedir un enlace desde «Olvidé mi contraseña» con ese mismo email.
        </p>
      )}
      <p className="ayuda" style={{ marginTop: 10 }}>
        Esta acción quedó registrada en el historial.
      </p>
    </Dialogo>
  )
}
