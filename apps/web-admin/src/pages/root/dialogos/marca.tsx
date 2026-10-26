import { useState, type FormEvent } from 'react'
import type { RootMarcaDetalle } from '@menyu/types'
import { ApiError, api } from '../../../services/api'
import { slugDe } from '../ui/texto'
import { Campo } from '../ui/Campo'
import { Dialogo } from '../ui/Dialogo'
import { efectosDeBajaDeMarca, efectosDeReactivarMarca } from '../copy'
import { AvisoDeError } from './AvisoDeError'
import { useEnvio } from './envio'
import { errorDeNombre, errorDeSlug } from './validaciones'

interface DialogoMarcaProps {
  /** Sin marca, crea; con marca, edita. */
  marca?: Pick<RootMarcaDetalle, 'id' | 'nombre' | 'slug'>
  onGuardada: (marca: RootMarcaDetalle) => void
  onCerrar: () => void
}

/** Nueva marca o editar nombre e identificador. El logo no: lo carga el dueño. */
export function DialogoMarca({ marca, onGuardada, onCerrar }: DialogoMarcaProps) {
  const editando = marca !== undefined
  const [nombre, setNombre] = useState(marca?.nombre ?? '')
  const [slug, setSlug] = useState(marca?.slug ?? '')
  // Al crear, el identificador se arma con el nombre hasta que ROOT lo toque.
  const [slugTocado, setSlugTocado] = useState(editando)
  const [intento, setIntento] = useState(false)
  const [slugRepetido, setSlugRepetido] = useState(false)
  const { ocupado, error, enviar } = useEnvio()

  const errorNombre = intento ? errorDeNombre(nombre) : ''
  const errorSlug = slugRepetido
    ? `Ya existe una marca con ese identificador. Cambialo para poder ${editando ? 'guardar los cambios' : 'crearla'}.`
    : intento || slugTocado
      ? errorDeSlug(slug)
      : ''

  function enviarFormulario(e: FormEvent) {
    e.preventDefault()
    if (ocupado) return
    setIntento(true)
    const datos = { nombre: nombre.trim(), slug: slug.trim().toLowerCase() }
    if (errorDeNombre(nombre) || errorDeSlug(slug)) return

    if (editando) {
      // Solo se manda lo que cambió; si no cambió nada, no hay nada que guardar ni que registrar.
      const cambios = {
        ...(datos.nombre !== marca.nombre ? { nombre: datos.nombre } : {}),
        ...(datos.slug !== marca.slug ? { slug: datos.slug } : {}),
      }
      if (!Object.keys(cambios).length) return onCerrar()
      void enviar(() => api.root.marcas.editar(marca.id, cambios), onGuardada, esSlugRepetido)
    } else {
      void enviar(() => api.root.marcas.crear(datos), onGuardada, esSlugRepetido)
    }
  }

  function esSlugRepetido(e: unknown): boolean {
    if (e instanceof ApiError && e.status === 409) {
      setSlugRepetido(true)
      return true
    }
    return false
  }

  return (
    <Dialogo
      titulo={editando ? 'Editar marca' : 'Nueva marca'}
      descripcion={
        editando
          ? 'ROOT cambia el nombre y el identificador. El logo lo carga el dueño.'
          : 'Una marca agrupa los restaurantes de un mismo dueño. Después le sumás los restaurantes y su dueño.'
      }
      onCerrar={onCerrar}
      ocupado={ocupado}
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button type="submit" form="form-marca" className="btn btn-primary" disabled={ocupado}>
            {ocupado ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear marca'}
          </button>
        </>
      }
    >
      <AvisoDeError texto={error} />
      <form id="form-marca" onSubmit={enviarFormulario} noValidate>
        <Campo
          etiqueta="Nombre *"
          value={nombre}
          placeholder="Ej.: La Parrilla de Juan"
          error={errorNombre}
          onChange={(e) => {
            setNombre(e.target.value)
            if (!slugTocado) setSlug(slugDe(e.target.value))
            setSlugRepetido(false)
          }}
        />
        <Campo
          etiqueta="Identificador *"
          value={slug}
          monoespaciado
          placeholder="la-parrilla-de-juan"
          error={errorSlug}
          ayuda="Es interno y único: no lo ven los clientes. Se arma solo con el nombre; podés cambiarlo."
          onChange={(e) => {
            setSlug(e.target.value)
            setSlugTocado(true)
            setSlugRepetido(false)
          }}
        />
      </form>
    </Dialogo>
  )
}

interface DialogoCambioDeEstadoProps {
  marca: Pick<RootMarcaDetalle, 'id' | 'nombre' | 'restaurantes'>
  onHecho: (marca: RootMarcaDetalle) => void
  onCerrar: () => void
}

/** Dar de baja una marca: reversible, y pide escribir su nombre para no hacerlo por un toque de más. */
export function DialogoBajaMarca({ marca, onHecho, onCerrar }: DialogoCambioDeEstadoProps) {
  const [confirmacion, setConfirmacion] = useState('')
  const { ocupado, error, enviar } = useEnvio()
  const activos = marca.restaurantes.filter((r) => r.activo).length
  const coincide = confirmacion.trim().toLowerCase() === marca.nombre.trim().toLowerCase()

  function dar(e: FormEvent) {
    e.preventDefault()
    if (!coincide || ocupado) return
    void enviar(() => api.root.marcas.baja(marca.id), onHecho)
  }

  return (
    <Dialogo
      titulo={<>Dar de baja «{marca.nombre}»</>}
      descripcion="Es reversible: la podés reactivar cuando quieras."
      onCerrar={onCerrar}
      ocupado={ocupado}
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button type="submit" form="form-baja-marca" className="btn btn-danger-solid" disabled={!coincide || ocupado}>
            {ocupado ? 'Dando de baja…' : 'Dar de baja'}
          </button>
        </>
      }
    >
      <AvisoDeError texto={error} />
      <ul>
        {efectosDeBajaDeMarca(activos).map(([fuerte, resto]) => (
          <li key={fuerte}>
            <b>{fuerte}</b>
            {resto}
          </li>
        ))}
      </ul>
      <form id="form-baja-marca" onSubmit={dar} noValidate>
        <Campo
          etiqueta="Para confirmar, escribí el nombre de la marca"
          value={confirmacion}
          placeholder={marca.nombre}
          onChange={(e) => setConfirmacion(e.target.value)}
        />
      </form>
    </Dialogo>
  )
}

export function DialogoReactivarMarca({ marca, onHecho, onCerrar }: DialogoCambioDeEstadoProps) {
  const { ocupado, error, enviar } = useEnvio()
  return (
    <Dialogo
      titulo={<>Reactivar «{marca.nombre}»</>}
      descripcion="Vuelve a estar disponible tal como estaba."
      onCerrar={onCerrar}
      ocupado={ocupado}
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={ocupado}
            onClick={() => void enviar(() => api.root.marcas.reactivar(marca.id), onHecho)}
          >
            {ocupado ? 'Reactivando…' : 'Reactivar'}
          </button>
        </>
      }
    >
      <AvisoDeError texto={error} />
      <ul>
        {efectosDeReactivarMarca().map((texto) => (
          <li key={texto}>{texto}</li>
        ))}
      </ul>
    </Dialogo>
  )
}
