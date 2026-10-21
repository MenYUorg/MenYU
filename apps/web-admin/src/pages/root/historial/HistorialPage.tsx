import { useState } from 'react'
import { ChevronDown, Clock, Lock, RefreshCw, Search } from 'lucide-react'
import type { RootEntidadTipo, RootHistorialFiltros, RootHistorialItem, RootHistorialPagina } from '@menyu/types'
import { api } from '../../../services/api'
import { OPCIONES_DE_TIPO, etiquetaDeAccion, etiquetaDeTipo } from '../copy'
import { Campo, CampoSelect } from '../ui/Campo'
import { Aviso, ErrorDeCarga, EsqueletoDeFilas, Vacio } from '../ui/piezas'
import { PaginaRoot } from '../ui/PaginaRoot'
import { mensajeDeEnvio } from '../dialogos/envio'
import { useCarga } from '../useCarga'
import { diaLargo, partesEnBuenosAires } from './fechas'

const SIN_ACTOR = ''
const SCRIPT = 'script'

interface Filtros {
  actor: string
  entidad: string
  desde: string
  hasta: string
}

const SIN_FILTROS: Filtros = { actor: SIN_ACTOR, entidad: '', desde: '', hasta: '' }

/** Lo que se pidió después de la primera página, atado a esa primera página (`base`). */
interface MasPaginas {
  base: RootHistorialPagina
  items: RootHistorialItem[]
  siguiente: number | null
  paginas: number
}

function haciaLaApi(f: Filtros, cursor?: number): RootHistorialFiltros {
  return {
    actor: f.actor || undefined,
    entidad: (f.entidad || undefined) as RootEntidadTipo | undefined,
    desde: f.desde || undefined,
    hasta: f.hasta || undefined,
    cursor,
  }
}

function FilaDeHistorial({ item, abierta, onAlternar }: { item: RootHistorialItem; abierta: boolean; onAlternar: () => void }) {
  const { dia, hora } = partesEnBuenosAires(item.cuando)
  const esScript = item.actorTipo === 'SCRIPT'
  return (
    <>
      <div className={`h-fila${abierta ? ' abierta' : ''}`}>
        <div className="h-hora">{hora}</div>
        <div className="h-main">
          <b>{etiquetaDeAccion(item.accion)}</b>
          <span className="h-quien">
            {esScript ? (
              <>
                <span className="chip chip-temp">Script</span> <span className="sub-gris">operador: {item.actorNombre}</span>
              </>
            ) : (
              item.actorNombre
            )}
          </span>
        </div>
        <div className="h-sobre">
          <span className="chip chip-baja">{etiquetaDeTipo(item.entidadTipo)}</span>
          <span className="h-nombre">{item.entidadNombre}</span>
          {item.marcaNombre && <small>{item.marcaNombre}</small>}
        </div>
        <button
          type="button"
          className="btn btn-ico h-ver"
          aria-label={`${abierta ? 'Ocultar' : 'Ver'} los cambios de «${etiquetaDeAccion(item.accion)}» del ${diaLargo(dia)} a las ${hora}`}
          aria-expanded={abierta}
          onClick={onAlternar}
        >
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </div>
      {abierta && (
        <div className="h-detalle">
          {item.cambios.length === 0 && <p className="ayuda">Esta acción no guardó el detalle de los cambios.</p>}
          {item.cambios.map((cambio, i) => (
            <div className="h-cambio" key={`${cambio.campo}-${i}`}>
              <b>{cambio.campo}</b>
              <div>
                <span className="e">Antes</span>
                {cambio.antes ?? '—'}
              </div>
              <div>
                <span className="e">Después</span>
                {cambio.despues ?? '—'}
              </div>
            </div>
          ))}
          <p className="ayuda">
            Acción {item.id} · {diaLargo(dia)}, {hora} h
          </p>
        </div>
      )}
    </>
  )
}

/**
 * Todo lo que hicieron las cuentas ROOT y el script de cuentas, de lo más nuevo a lo más viejo, agrupado por día (hora de
 * Buenos Aires). Es de solo lectura: el historial no se puede editar ni borrar, ni desde acá ni desde la API ni desde la base.
 */
export function HistorialPage() {
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS)
  const [abiertas, setAbiertas] = useState<ReadonlySet<number>>(new Set())
  // Las páginas siguientes se guardan junto con la primera a la que pertenecen: si los filtros cambian (o se vuelve a pedir),
  // la primera página es otra y todo lo acumulado deja de valer sin tener que limpiarlo a mano.
  const [mas, setMas] = useState<MasPaginas | null>(null)
  const [pidiendo, setPidiendo] = useState<RootHistorialPagina | null>(null)
  const [falloMas, setFalloMas] = useState<{ base: RootHistorialPagina; texto: string } | null>(null)

  const rangoInvertido = filtros.desde !== '' && filtros.hasta !== '' && filtros.desde > filtros.hasta
  const hayFiltros = Object.values(filtros).some((v) => v !== '')

  // Las personas del filtro "Quién" salen de las cuentas ROOT. Si no se pueden cargar, el filtro sigue con "Todos" y "Script".
  const cuentas = useCarga(() => api.root.cuentas.listar(), [])
  const opcionesDeActor = [
    { valor: SIN_ACTOR, texto: 'Todos' },
    ...(cuentas.datos ?? []).map((c) => ({ valor: c.email, texto: c.esPropia ? `${c.email} (vos)` : c.email })),
    { valor: SCRIPT, texto: 'Script (línea de comandos)' },
  ]

  const primera = useCarga(
    () => (rangoInvertido ? Promise.resolve({ items: [], siguiente: null }) : api.root.historial.listar(haciaLaApi(filtros))),
    [filtros.actor, filtros.entidad, filtros.desde, filtros.hasta],
  )

  const base = primera.datos
  // Una respuesta que llega tarde, de filtros que ya cambiaron, queda atada a la primera página vieja y no se dibuja.
  const acumulado = base && mas && mas.base === base ? mas : null
  const items = base ? [...base.items, ...(acumulado?.items ?? [])] : []
  const siguiente = acumulado ? acumulado.siguiente : (base?.siguiente ?? null)
  const paginas = acumulado ? acumulado.paginas : 1
  const cargandoMas = base !== null && pidiendo === base
  const errorAlCargarMas = falloMas && falloMas.base === base ? falloMas.texto : ''

  function cambiar(campo: keyof Filtros, valor: string) {
    setFiltros((f) => ({ ...f, [campo]: valor }))
  }

  function cargarMas() {
    if (!base || siguiente === null || cargandoMas) return
    const pedida = base
    const filtrosPedidos = filtros
    setPidiendo(pedida)
    setFalloMas(null)
    api.root.historial.listar(haciaLaApi(filtrosPedidos, siguiente)).then(
      (pagina) => {
        setMas((previo) => {
          const vigente = previo && previo.base === pedida ? previo : { base: pedida, items: [], siguiente: pedida.siguiente, paginas: 1 }
          return { base: pedida, items: [...vigente.items, ...pagina.items], siguiente: pagina.siguiente, paginas: vigente.paginas + 1 }
        })
        setPidiendo((actual) => (actual === pedida ? null : actual)) // no apaga el "Cargando…" de un pedido más nuevo
      },
      (error: unknown) => {
        setFalloMas({ base: pedida, texto: mensajeDeEnvio(error) })
        setPidiendo((actual) => (actual === pedida ? null : actual)) // no apaga el "Cargando…" de un pedido más nuevo
      },
    )
  }

  function alternar(id: number) {
    setAbiertas((previas) => {
      const nuevas = new Set(previas)
      if (nuevas.has(id)) nuevas.delete(id)
      else nuevas.add(id)
      return nuevas
    })
  }

  // Los registros se agrupan por día; el orden de la API (de más nuevo a más viejo) se respeta.
  const grupos: Array<{ dia: string; items: RootHistorialItem[] }> = []
  for (const item of items) {
    const { dia } = partesEnBuenosAires(item.cuando)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.dia === dia) ultimo.items.push(item)
    else grupos.push({ dia, items: [item] })
  }

  const cargando = primera.estado === 'cargando'
  const conError = primera.estado === 'error' || primera.estado === 'sin-conexion'

  return (
    <PaginaRoot>
      <section className="card" aria-label="Filtros" style={{ padding: 0 }}>
        <div className="filtros">
          <CampoSelect
            etiqueta="Quién"
            value={filtros.actor}
            opciones={opcionesDeActor}
            onChange={(e) => cambiar('actor', e.target.value)}
          />
          <CampoSelect
            etiqueta="Sobre qué"
            value={filtros.entidad}
            opciones={OPCIONES_DE_TIPO}
            onChange={(e) => cambiar('entidad', e.target.value)}
          />
          <Campo etiqueta="Desde" type="date" value={filtros.desde} onChange={(e) => cambiar('desde', e.target.value)} />
          <Campo
            etiqueta="Hasta"
            type="date"
            value={filtros.hasta}
            error={rangoInvertido ? 'No puede ser anterior a «Desde».' : undefined}
            onChange={(e) => cambiar('hasta', e.target.value)}
          />
        </div>
      </section>

      {hayFiltros && (
        <div>
          <button type="button" className="btn" onClick={() => setFiltros(SIN_FILTROS)}>
            Limpiar filtros
          </button>
        </div>
      )}

      {cargando && <EsqueletoDeFilas filas={6} />}
      {conError && <ErrorDeCarga sinConexion={primera.estado === 'sin-conexion'} onReintentar={primera.recargar} />}

      {!cargando && !conError && !rangoInvertido && items.length === 0 && !hayFiltros && (
        <Vacio icono={Clock} titulo="Todavía no hay acciones registradas">
          Cada cosa que haga un ROOT queda acá.
        </Vacio>
      )}

      {!cargando && !conError && !rangoInvertido && items.length === 0 && hayFiltros && (
        <Vacio
          icono={Search}
          titulo="Ninguna acción coincide con los filtros"
          accion={
            <button type="button" className="btn" onClick={() => setFiltros(SIN_FILTROS)}>
              Limpiar filtros
            </button>
          }
        >
          Probá con otras fechas o con otra persona.
        </Vacio>
      )}

      {!cargando && !conError && items.length > 0 && (
        <section className="card hist" aria-label="Acciones de ROOT">
          {grupos.map((grupo) => (
            <div key={grupo.dia}>
              <p className="h-dia">{diaLargo(grupo.dia)}</p>
              <div className="h-grupo">
                {grupo.items.map((item) => (
                  <FilaDeHistorial key={item.id} item={item} abierta={abiertas.has(item.id)} onAlternar={() => alternar(item.id)} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {!cargando && !conError && items.length > 0 && errorAlCargarMas && (
        <Aviso tipo="err">
          <b>No pudimos cargar más.</b> {errorAlCargarMas}
        </Aviso>
      )}

      {!cargando && !conError && items.length > 0 && siguiente !== null && (
        <div style={{ textAlign: 'center' }}>
          <button type="button" className="btn" onClick={cargarMas} disabled={cargandoMas}>
            {cargandoMas ? (
              'Cargando…'
            ) : (
              <>
                <RefreshCw size={16} aria-hidden="true" />
                Cargar más
              </>
            )}
          </button>
        </div>
      )}

      {!cargando && !conError && items.length > 0 && siguiente === null && paginas > 1 && (
        <p className="ayuda" style={{ textAlign: 'center' }}>
          Llegaste al principio del historial.
        </p>
      )}

      <p className="nota-priv">
        <Lock size={16} aria-hidden="true" />
        <span>
          <b>El historial no se puede editar ni borrar:</b> ni desde la consola ni desde la API, y la base de datos lo impide. Guarda
          quién, qué, sobre qué y cuándo; nunca una contraseña.
        </span>
      </p>
    </PaginaRoot>
  )
}
