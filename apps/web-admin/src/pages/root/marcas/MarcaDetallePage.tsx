import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Lock, Pencil, Plus, Store, Trash2, Undo2 } from 'lucide-react'
import type { RootMarcaDetalle, RootRestaurante } from '@menyu/types'
import { ApiError, api } from '../../../services/api'
import { DialogoBajaMarca, DialogoMarca, DialogoReactivarMarca } from '../dialogos/marca'
import { DialogoBajaRestaurante, DialogoReactivarRestaurante, DialogoRestaurante } from '../dialogos/restaurante'
import { avisoDeMarcaDeBaja } from '../copy'
import {
  Aviso,
  ChipEstado,
  ErrorDeCarga,
  EsqueletoDeFilas,
  MenuDeAcciones,
  Sigla,
  Vacio,
} from '../ui/piezas'
import { PaginaRoot } from '../ui/PaginaRoot'
import { useAvisoTemporal } from '../ui/useAvisoTemporal'
import { useCarga } from '../useCarga'

type Dialogo =
  | { tipo: 'editar-marca' }
  | { tipo: 'baja-marca' }
  | { tipo: 'reactivar-marca' }
  | { tipo: 'nuevo-restaurante' }
  | { tipo: 'editar-restaurante'; restaurante: RootRestaurante }
  | { tipo: 'baja-restaurante'; restaurante: RootRestaurante }
  | { tipo: 'reactivar-restaurante'; restaurante: RootRestaurante }

function Volver() {
  return (
    <Link to="/root/marcas" className="volver">
      <ChevronLeft size={16} aria-hidden="true" />
      Marcas
    </Link>
  )
}

/**
 * Donde ROOT trabaja una marca: sus datos, sus dueños (solo se ven: crearlos, cambiarles el email o eliminarlos llega con la
 * migración de autenticación) y sus restaurantes. Cierra con el recordatorio de lo que ROOT no ve.
 */
export function MarcaDetallePage() {
  const { id = '' } = useParams()
  // Con otra marca en la dirección, la pantalla empieza de cero: no queda a la vista lo de la anterior mientras carga.
  return <DetalleDeMarca key={id} id={id} />
}

function DetalleDeMarca({ id }: { id: string }) {
  const { estado, datos: marca, error, recargar, actualizar, reemplazar } = useCarga(() => api.root.marcas.detalle(id), [id])
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const [aviso, mostrarAviso] = useAvisoTemporal()

  if (estado === 'cargando' && !marca) {
    return (
      <PaginaRoot>
        <Volver />
        <div className="card" aria-busy="true" aria-label="Cargando">
          <div style={{ display: 'flex', gap: 14 }}>
            <div className="sk" style={{ width: 56, height: 56 }} />
            <div style={{ flex: 1 }}>
              <div className="sk" style={{ height: 20, width: '55%', marginBottom: 10 }} />
              <div className="sk" style={{ height: 12, width: '35%' }} />
            </div>
          </div>
        </div>
        <EsqueletoDeFilas filas={2} />
        <EsqueletoDeFilas filas={3} />
      </PaginaRoot>
    )
  }

  if (estado === 'error' || estado === 'sin-conexion') {
    const noExiste = error instanceof ApiError && error.status === 404
    return (
      <PaginaRoot>
        <Volver />
        {noExiste ? (
          <Vacio icono={Store} titulo="No encontramos esa marca">
            Puede que el enlace esté mal escrito. Volvé a la lista para buscarla.
          </Vacio>
        ) : (
          <ErrorDeCarga sinConexion={estado === 'sin-conexion'} onReintentar={recargar} />
        )}
      </PaginaRoot>
    )
  }

  if (!marca) return null

  const activos = marca.restaurantes.filter((r) => r.activo).length
  const cerrar = () => setDialogo(null)
  /** Una acción sobre la marca devuelve su detalle nuevo. */
  const marcaCambiada = (texto: string) => (nueva: RootMarcaDetalle) => {
    reemplazar(nueva)
    cerrar()
    mostrarAviso(texto)
  }
  /** Una acción sobre un restaurante: se vuelve a pedir el detalle (cambian las cuentas de la marca). */
  const restauranteCambiado = (texto: string) => () => {
    cerrar()
    actualizar()
    mostrarAviso(texto)
  }

  return (
    <PaginaRoot>
      <Volver />

      {!marca.activo && (
        <Aviso
          tipo="amb"
          accion={
            <>
              <br />
              <button type="button" className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setDialogo({ tipo: 'reactivar-marca' })}>
                <Undo2 size={16} aria-hidden="true" />
                Reactivar la marca
              </button>
            </>
          }
        >
          {avisoDeMarcaDeBaja().map(([fuerte, resto]) => (
            <span key={fuerte}>
              <b>{fuerte}</b>
              {resto}
            </span>
          ))}
        </Aviso>
      )}

      {marca.activo && marca.duenos.length === 0 && (
        <Aviso tipo="amb">
          <b>Esta marca no tiene dueño.</b> Nadie puede administrar su menú, sus mesas ni su logo hasta que le crees uno.
        </Aviso>
      )}

      {/* Cabecera */}
      <section className={`card${marca.activo ? '' : ' baja'}`}>
        <div className="cab-marca">
          <Sigla nombre={marca.nombre} grande />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="eyebrow">Marca</p>
            <h2>{marca.nombre}</h2>
          </div>
        </div>
        <dl className="datos">
          <div>
            <dt>Identificador</dt>
            <dd style={{ font: '500 12px ui-monospace, Consolas, monospace' }}>{marca.slug}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              <ChipEstado activo={marca.activo} femenino />
            </dd>
          </div>
          <div>
            <dt>Restaurantes</dt>
            <dd>
              {activos} {activos === 1 ? 'activo' : 'activos'} de {marca.restaurantes.length}
            </dd>
          </div>
          <div>
            <dt>Dueños</dt>
            <dd>{marca.duenos.length}</dd>
          </div>
        </dl>
        <div className="acciones">
          <button type="button" className="btn" onClick={() => setDialogo({ tipo: 'editar-marca' })}>
            <Pencil size={16} aria-hidden="true" />
            Editar
          </button>
          {marca.activo && (
            <button type="button" className="btn btn-danger" onClick={() => setDialogo({ tipo: 'baja-marca' })}>
              <Trash2 size={16} aria-hidden="true" />
              Dar de baja
            </button>
          )}
        </div>
      </section>

      {/* Dueños (solo lectura) */}
      <section className="card" aria-labelledby="titulo-duenos">
        <div className="card-head">
          <div>
            <h3 className="titulo" id="titulo-duenos">
              Dueños
            </h3>
            <p className="ayuda">Cuentas con acceso total a la marca. Los gerentes los crea el dueño desde su panel.</p>
          </div>
        </div>
        {marca.duenos.length === 0 && <p className="vacio-inline">Todavía no hay ningún dueño.</p>}
        {marca.duenos.map((dueno) => (
          <div className="item" key={dueno.id}>
            <div className="sigla" aria-hidden="true">
              {dueno.email.slice(0, 2).toUpperCase()}
            </div>
            <div className="item-txt">
              <b>{dueno.email}</b>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 12 }}>
          <Aviso tipo="info">
            Crear, cambiar el email o eliminar un dueño todavía no se hace desde esta pantalla: llega cuando termine la migración de
            autenticación. Mientras tanto, se hace desde la documentación de la API (<code>/docs</code>).
          </Aviso>
        </div>
      </section>

      {/* Restaurantes */}
      <section className="card" aria-labelledby="titulo-restaurantes">
        <div className="card-head">
          <div>
            <h3 className="titulo" id="titulo-restaurantes">
              Restaurantes
            </h3>
            <p className="ayuda">ROOT solo cambia el nombre y el estado. La dirección y el logo los carga el dueño.</p>
          </div>
          {marca.activo && (
            <button type="button" className="btn" onClick={() => setDialogo({ tipo: 'nuevo-restaurante' })}>
              <Plus size={16} aria-hidden="true" />
              Agregar restaurante
            </button>
          )}
        </div>
        {marca.restaurantes.length === 0 && <p className="vacio-inline">Todavía no tiene restaurantes.</p>}
        {marca.restaurantes.map((restaurante) => (
          <div className={`item${restaurante.activo ? '' : ' baja'}`} key={restaurante.id}>
            <Sigla nombre={restaurante.nombre} />
            <div className="item-txt">
              <b>{restaurante.nombre}</b>
              <small className="cortar2">{restaurante.direccion ?? 'Dirección no cargada'}</small>
              <div className="item-chips">
                <ChipEstado activo={restaurante.activo} />
              </div>
            </div>
            <MenuDeAcciones
              etiqueta={`Acciones de ${restaurante.nombre}`}
              opciones={[
                { texto: 'Editar nombre', icono: Pencil, onElegir: () => setDialogo({ tipo: 'editar-restaurante', restaurante }) },
                restaurante.activo
                  ? { texto: 'Dar de baja', icono: Trash2, peligro: true, separador: true, onElegir: () => setDialogo({ tipo: 'baja-restaurante', restaurante }) }
                  : { texto: 'Reactivar', icono: Undo2, separador: true, onElegir: () => setDialogo({ tipo: 'reactivar-restaurante', restaurante }) },
              ]}
            />
          </div>
        ))}
      </section>

      <p className="nota-priv">
        <Lock size={16} aria-hidden="true" />
        <span>
          ROOT no ve ni decide sobre el menú y los precios, los descuentos, las mesas y sus QR, los mozos, los pedidos, los reportes
          ni la caja. Tampoco cambia el logo ni la dirección: eso lo hace el dueño de la marca.
        </span>
      </p>

      {aviso}

      {dialogo?.tipo === 'editar-marca' && <DialogoMarca marca={marca} onGuardada={marcaCambiada('Cambios guardados')} onCerrar={cerrar} />}
      {dialogo?.tipo === 'baja-marca' && <DialogoBajaMarca marca={marca} onHecho={marcaCambiada('Marca dada de baja')} onCerrar={cerrar} />}
      {dialogo?.tipo === 'reactivar-marca' && <DialogoReactivarMarca marca={marca} onHecho={marcaCambiada('Marca reactivada')} onCerrar={cerrar} />}
      {dialogo?.tipo === 'nuevo-restaurante' && (
        <DialogoRestaurante marca={marca} onGuardado={restauranteCambiado('Restaurante creado')} onCerrar={cerrar} />
      )}
      {dialogo?.tipo === 'editar-restaurante' && (
        <DialogoRestaurante marca={marca} restaurante={dialogo.restaurante} onGuardado={restauranteCambiado('Cambios guardados')} onCerrar={cerrar} />
      )}
      {dialogo?.tipo === 'baja-restaurante' && (
        <DialogoBajaRestaurante restaurante={dialogo.restaurante} onHecho={restauranteCambiado('Restaurante dado de baja')} onCerrar={cerrar} />
      )}
      {dialogo?.tipo === 'reactivar-restaurante' && (
        <DialogoReactivarRestaurante restaurante={dialogo.restaurante} onHecho={restauranteCambiado('Restaurante reactivado')} onCerrar={cerrar} />
      )}
    </PaginaRoot>
  )
}
