import { useState, type FormEvent } from 'react'
import { Lock, Store } from 'lucide-react'
import type { RootMarcaDetalle, RootRestaurante } from '@menyu/types'
import { api } from '../../../services/api'
import { Aviso } from '../ui/piezas'
import { Campo, CampoFijo } from '../ui/Campo'
import { Dialogo } from '../ui/Dialogo'
import { efectosDeBajaDeRestaurante, efectosDeReactivarRestaurante } from '../copy'
import { useEnvio } from './envio'
import { errorDeNombre } from './validaciones'

export const MAX_DIRECCION = 200

function errorDeDireccion(direccion: string): string {
  if (!direccion.trim()) return 'Escribí la dirección.'
  if (direccion.trim().length > MAX_DIRECCION) return `Tiene que tener hasta ${MAX_DIRECCION} caracteres.`
  return ''
}

function AvisoDeError({ texto }: { texto: string }) {
  if (!texto) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <Aviso tipo="err">
        <b>No pudimos completar la acción.</b> {texto}
      </Aviso>
    </div>
  )
}

interface DialogoRestauranteProps {
  marca: Pick<RootMarcaDetalle, 'id' | 'nombre'>
  /** Sin restaurante, crea; con restaurante, edita el nombre. */
  restaurante?: RootRestaurante
  onGuardado: () => void
  onCerrar: () => void
}

/** Nuevo restaurante (nombre y dirección, que se carga esta única vez) o editar su nombre (la dirección no se toca). */
export function DialogoRestaurante({ marca, restaurante, onGuardado, onCerrar }: DialogoRestauranteProps) {
  const editando = restaurante !== undefined
  const [nombre, setNombre] = useState(restaurante?.nombre ?? '')
  const [direccion, setDireccion] = useState('')
  const [intento, setIntento] = useState(false)
  const { ocupado, error, enviar } = useEnvio()

  const errorNombre = intento ? errorDeNombre(nombre) : ''
  const errorDireccion = intento && !editando ? errorDeDireccion(direccion) : ''

  function enviarFormulario(e: FormEvent) {
    e.preventDefault()
    if (ocupado) return
    setIntento(true)
    if (errorDeNombre(nombre) || (!editando && errorDeDireccion(direccion))) return

    if (editando) {
      if (nombre.trim() === restaurante.nombre) return onCerrar() // nada que cambiar ni que registrar
      void enviar(() => api.root.restaurantes.editar(restaurante.id, { nombre: nombre.trim() }), onGuardado)
    } else {
      void enviar(() => api.root.marcas.crearRestaurante(marca.id, { nombre: nombre.trim(), direccion: direccion.trim() }), onGuardado)
    }
  }

  return (
    <Dialogo
      titulo={editando ? 'Editar restaurante' : 'Nuevo restaurante'}
      descripcion={editando ? 'ROOT solo cambia el nombre.' : 'Se crea dentro de la marca y queda activo.'}
      onCerrar={onCerrar}
      ocupado={ocupado}
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button type="submit" form="form-restaurante" className="btn btn-primary" disabled={ocupado}>
            {ocupado ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear restaurante'}
          </button>
        </>
      }
    >
      <AvisoDeError texto={error} />
      <form id="form-restaurante" onSubmit={enviarFormulario} noValidate>
        {!editando && <CampoFijo etiqueta="Marca" icono={<Store size={16} aria-hidden="true" />} texto={marca.nombre} />}
        <Campo
          etiqueta="Nombre *"
          value={nombre}
          placeholder="Ej.: La Parrilla Centro"
          error={errorNombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        {editando ? (
          <CampoFijo
            etiqueta="Dirección"
            icono={<Lock size={16} aria-hidden="true" />}
            texto={restaurante.direccion ?? 'Dirección no cargada'}
            ayuda="La dirección y el logo los cambia el dueño de la marca."
          />
        ) : (
          <Campo
            etiqueta="Dirección *"
            value={direccion}
            placeholder="Calle y número, ciudad"
            error={errorDireccion}
            ayuda="Se carga acá una sola vez. Después solo la puede cambiar el dueño de la marca."
            onChange={(e) => setDireccion(e.target.value)}
          />
        )}
      </form>
    </Dialogo>
  )
}

interface DialogoEstadoDeRestauranteProps {
  restaurante: RootRestaurante
  onHecho: () => void
  onCerrar: () => void
}

export function DialogoBajaRestaurante({ restaurante, onHecho, onCerrar }: DialogoEstadoDeRestauranteProps) {
  const { ocupado, error, enviar } = useEnvio()
  return (
    <Dialogo
      titulo={<>Dar de baja «{restaurante.nombre}»</>}
      descripcion="Es reversible: lo podés reactivar cuando quieras."
      onCerrar={onCerrar}
      ocupado={ocupado}
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-danger-solid"
            disabled={ocupado}
            onClick={() => void enviar(() => api.root.restaurantes.baja(restaurante.id), onHecho)}
          >
            {ocupado ? 'Dando de baja…' : 'Dar de baja'}
          </button>
        </>
      }
    >
      <AvisoDeError texto={error} />
      <ul>
        {efectosDeBajaDeRestaurante().map(([fuerte, resto]) => (
          <li key={fuerte}>
            <b>{fuerte}</b>
            {resto}
          </li>
        ))}
      </ul>
    </Dialogo>
  )
}

export function DialogoReactivarRestaurante({ restaurante, onHecho, onCerrar }: DialogoEstadoDeRestauranteProps) {
  const { ocupado, error, enviar } = useEnvio()
  return (
    <Dialogo
      titulo={<>Reactivar «{restaurante.nombre}»</>}
      descripcion={efectosDeReactivarRestaurante()}
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
            onClick={() => void enviar(() => api.root.restaurantes.reactivar(restaurante.id), onHecho)}
          >
            {ocupado ? 'Reactivando…' : 'Reactivar'}
          </button>
        </>
      }
    >
      <AvisoDeError texto={error} />
    </Dialogo>
  )
}
