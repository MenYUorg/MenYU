import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronRight, Plus, Search, Store } from 'lucide-react'
import type { RootMarcaResumen } from '@menyu/types'
import { api } from '../../../services/api'
import { DialogoMarca } from '../dialogos/marca'
import { ChipEstado, ErrorDeCarga, EsqueletoDeFilas, Interruptor, Sigla, Vacio } from '../ui/piezas'
import { plural, sinAcentos } from '../ui/texto'
import { PaginaRoot } from '../ui/PaginaRoot'
import { useCarga } from '../useCarga'

function Restaurantes({ marca }: { marca: RootMarcaResumen }) {
  const { activos, total } = marca.restaurantes
  const deBaja = total - activos
  return (
    <>
      {plural(total, 'restaurante', 'restaurantes')}
      {deBaja > 0 && <span className="sub-gris"> ({deBaja} de baja)</span>}
    </>
  )
}

function Duenos({ marca }: { marca: RootMarcaResumen }) {
  if (marca.duenos > 0) return <>{plural(marca.duenos, 'dueño', 'dueños')}</>
  return (
    <span className="chip chip-aviso">
      <AlertTriangle size={12} aria-hidden="true" /> Sin dueño
    </span>
  )
}

/** Lista de marcas: se busca por nombre o identificador, se puede sumar las dadas de baja y se crea una nueva. */
export function MarcasPage() {
  const navigate = useNavigate()
  const [bajas, setBajas] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [creando, setCreando] = useState(false)
  const { estado, datos, recargar } = useCarga(() => api.root.marcas.listar({ bajas }), [bajas])

  const texto = sinAcentos(busqueda.trim())
  const visibles = useMemo(
    () => (datos ?? []).filter((m) => !texto || sinAcentos(m.nombre).includes(texto) || m.slug.includes(texto)),
    [datos, texto],
  )

  return (
    <PaginaRoot>
      <div className="barra">
        <div className="barra-izq">
          <div className="buscar campo" style={{ margin: 0 }}>
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="Buscar marca"
              aria-label="Buscar marca"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoComplete="off"
            />
          </div>
          <Interruptor activo={bajas} onCambio={setBajas}>
            Mostrar dadas de baja
          </Interruptor>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreando(true)}>
          <Plus size={16} aria-hidden="true" />
          Nueva marca
        </button>
      </div>

      {estado === 'cargando' && <EsqueletoDeFilas filas={5} />}
      {(estado === 'error' || estado === 'sin-conexion') && <ErrorDeCarga sinConexion={estado === 'sin-conexion'} onReintentar={recargar} />}

      {estado === 'ok' && datos && datos.length === 0 && (
        <Vacio
          icono={Store}
          titulo={bajas ? 'Todavía no hay marcas' : 'Todavía no hay marcas activas'}
          accion={
            <button type="button" className="btn btn-primary" onClick={() => setCreando(true)}>
              <Plus size={16} aria-hidden="true" />
              Crear la primera marca
            </button>
          }
        >
          Creá la primera, después sumale sus restaurantes.{bajas ? '' : ' Si ya tenías, activá «Mostrar dadas de baja».'}
        </Vacio>
      )}

      {estado === 'ok' && datos && datos.length > 0 && visibles.length === 0 && (
        <Vacio icono={Search} titulo={`No encontramos marcas${busqueda.trim() ? ` con «${busqueda.trim()}»` : ''}`}>
          {bajas ? 'Probá con otra palabra.' : 'Probá con otra palabra o activá «Mostrar dadas de baja».'}
        </Vacio>
      )}

      {estado === 'ok' && visibles.length > 0 && (
        <div className="card lista" aria-label="Marcas">
          <div className="cab" aria-hidden="true">
            <span>Marca</span>
            <span>Restaurantes</span>
            <span>Dueños</span>
            <span>Estado</span>
          </div>
          {visibles.map((marca) => (
            <Link key={marca.id} to={`/root/marcas/${marca.id}`} className={`fila${marca.activo ? '' : ' baja'}`}>
              <Sigla nombre={marca.nombre} />
              <div className="nom">
                <b className="cortar2">{marca.nombre}</b>
                <small className="cortar">{marca.slug}</small>
              </div>
              <div className="c-rest">
                <Restaurantes marca={marca} />
              </div>
              <div className="c-due">
                <Duenos marca={marca} />
              </div>
              <div className="est">
                <ChipEstado activo={marca.activo} femenino />
              </div>
              <div className="meta">
                <span>
                  <Restaurantes marca={marca} />
                </span>
                <span>·</span>
                <span>
                  <Duenos marca={marca} />
                </span>
              </div>
              <div className="chev">
                <ChevronRight size={16} aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {creando && (
        <DialogoMarca
          onCerrar={() => setCreando(false)}
          onGuardada={(marca) => {
            setCreando(false)
            navigate(`/root/marcas/${marca.id}`)
          }}
        />
      )}
    </PaginaRoot>
  )
}
