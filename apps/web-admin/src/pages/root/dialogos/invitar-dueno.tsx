import { useState, type FormEvent } from 'react'
import { Mail, Store } from 'lucide-react'
import { ApiError, api } from '../../../services/api'
import { Campo, CampoFijo, CampoSelect } from '../ui/Campo'
import { Dialogo } from '../ui/Dialogo'
import { ErrorDeCarga } from '../ui/piezas'
import { useCarga } from '../useCarga'
import { AvisoDeError } from './AvisoDeError'
import { emailParaInvitar, errorDeEmail, errorDeNombreDePersona } from './cuentas'
import { useEnvio } from './envio'

/** A quién se invitó y si le llegó un mail (`false`: ya tenía una cuenta). */
export interface Invitado {
  email: string
  enviada: boolean
}

interface SelectorDeMarcaProps {
  valor: string
  error: string
  onCambio: (marcaId: string) => void
}

/** Las marcas activas para elegir una (en una marca dada de baja no se puede invitar a nadie). */
function SelectorDeMarca({ valor, error, onCambio }: SelectorDeMarcaProps) {
  const { estado, datos, recargar } = useCarga(() => api.root.marcas.listar(), [])
  if (estado === 'error' || estado === 'sin-conexion') {
    return (
      <div style={{ marginBottom: 14 }}>
        <ErrorDeCarga sinConexion={estado === 'sin-conexion'} onReintentar={recargar} />
      </div>
    )
  }
  const cargando = estado === 'cargando'
  const marcas = datos ?? []
  const vacio = cargando ? 'Cargando marcas…' : marcas.length ? 'Elegí la marca' : 'No hay marcas activas'
  return (
    <CampoSelect
      etiqueta="Marca *"
      opciones={[{ valor: '', texto: vacio }, ...marcas.map((m) => ({ valor: m.id, texto: m.nombre }))]}
      value={cargando ? '' : valor}
      disabled={cargando}
      error={error}
      onChange={(e) => onCambio(e.target.value)}
    />
  )
}

interface DialogoInvitarDuenoProps {
  /** Desde el detalle de una marca: la marca ya está elegida y no se cambia. */
  marca?: { id: string; nombre: string }
  /** Desde la lista de dueños: se elige entre las marcas activas (con esta ya elegida, si se sabe cuál). */
  marcaInicialId?: string
  onInvitado: (invitado: Invitado) => void
  onCerrar: () => void
}

// Los dos 4xx que tienen un lugar propio (el campo del email). El resto (la marca de baja, la cuenta desactivada…) se muestra
// arriba con el texto del servidor.
const YA_ES_DUENO = /ya tiene un rol/i
const ES_SU_PROPIO_EMAIL = /vos mismo/i

/** Invitar a un dueño: la persona recibe un mail con un enlace para elegir su contraseña (o entra con la cuenta que ya tenga). */
export function DialogoInvitarDueno({ marca, marcaInicialId, onInvitado, onCerrar }: DialogoInvitarDuenoProps) {
  const [marcaId, setMarcaId] = useState(marca?.id ?? marcaInicialId ?? '')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [intento, setIntento] = useState(false)
  const [errorDelServidor, setErrorDelServidor] = useState('')
  const { ocupado, error, enviar } = useEnvio()

  const errorMarca = intento && !marcaId ? 'Elegí la marca.' : ''
  const errorNombre = intento ? errorDeNombreDePersona(nombre) : ''
  const errorEmail = errorDelServidor || (intento ? errorDeEmail(email) : '')

  function enviarFormulario(e: FormEvent) {
    e.preventDefault()
    if (ocupado) return
    setIntento(true)
    if (!marcaId || errorDeNombreDePersona(nombre) || errorDeEmail(email)) return
    const datos = { email: emailParaInvitar(email), nombre: nombre.trim() }
    void enviar(
      () => api.root.duenos.invitar(marcaId, datos),
      (respuesta) => onInvitado({ email: datos.email, enviada: respuesta.invitacionEnviada }),
      alFallar,
    )
  }

  function alFallar(e: unknown): boolean {
    if (e instanceof ApiError && e.status === 409 && YA_ES_DUENO.test(e.message)) {
      setErrorDelServidor('Esa persona ya es dueña de esta marca.')
      return true
    }
    if (e instanceof ApiError && e.status === 403 && ES_SU_PROPIO_EMAIL.test(e.message)) {
      setErrorDelServidor('Ese es tu propio email: no podés invitarte.')
      return true
    }
    return false
  }

  return (
    <Dialogo
      titulo="Invitar dueño"
      descripcion="Una cuenta con acceso total a su marca. Le mandamos un mail con un enlace para que elija su contraseña y entre. Los gerentes los invita el dueño."
      onCerrar={onCerrar}
      ocupado={ocupado}
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button type="submit" form="form-invitar-dueno" className="btn btn-primary" disabled={ocupado}>
            <Mail size={16} aria-hidden="true" />
            {ocupado ? 'Enviando…' : 'Enviar invitación'}
          </button>
        </>
      }
    >
      <AvisoDeError texto={error} />
      <form id="form-invitar-dueno" onSubmit={enviarFormulario} noValidate>
        {marca ? (
          <CampoFijo etiqueta="Marca" icono={<Store size={16} aria-hidden="true" />} texto={marca.nombre} />
        ) : (
          <SelectorDeMarca valor={marcaId} error={errorMarca} onCambio={setMarcaId} />
        )}
        <Campo
          etiqueta="Nombre *"
          value={nombre}
          placeholder="Ej.: Juan Pérez"
          error={errorNombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Campo
          etiqueta="Email *"
          type="email"
          inputMode="email"
          value={email}
          placeholder="dueno@restaurante.com"
          error={errorEmail}
          ayuda="Si ya tiene una cuenta de MenYU, no hace falta mail: entra con la que tiene."
          onChange={(e) => {
            setEmail(e.target.value)
            setErrorDelServidor('')
          }}
        />
      </form>
    </Dialogo>
  )
}
