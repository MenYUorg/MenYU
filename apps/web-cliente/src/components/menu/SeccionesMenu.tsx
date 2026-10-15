import type { ReactNode } from 'react'
import type { MenuPublicoItem } from '@menyu/types'
import { ItemCard } from '../ItemCard'
import { TituloSeccion } from '../TituloSeccion'
import { CM } from './paleta'

function EmptyState({ buscar, hayDietas, onClear }: { buscar: string; hayDietas: boolean; onClear: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 10, paddingTop: 40 }}>
      <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: CM.textMuted, textAlign: 'center', margin: 0 }}>
        {buscar
          ? `No hay platos que coincidan con "${buscar}"`
          : hayDietas
            ? 'Ningún plato cumple todos los filtros de dieta'
            : 'No hay ítems en esta categoría'}
      </p>
      {(buscar || hayDietas) && (
        <button
          onClick={onClear}
          style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 13, color: CM.orange, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  )
}

interface SeccionProps {
  id: string
  titulo: ReactNode
  platos: MenuPublicoItem[]
  /** Con `onPress` las tarjetas se tocan (y tienen "+"); sin él son de solo lectura. */
  onPress?: (item: MenuPublicoItem) => void
  registrar: (id: string, el: HTMLDivElement | null) => void
}

function Seccion({ id, titulo, platos, onPress, registrar }: SeccionProps) {
  return (
    <div ref={(el) => registrar(id, el)} data-categoria-id={id} style={{ marginBottom: 28 }}>
      <TituloSeccion>{titulo}</TituloSeccion>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {platos.map((item) => (
          <ItemCard key={item.id} item={item} onPress={onPress ? () => onPress(item) : undefined} />
        ))}
      </div>
    </div>
  )
}

interface SeccionesMenuProps {
  descuentos: MenuPublicoItem[]
  recomendados: MenuPublicoItem[]
  nombreRecomendados: string
  categorias: { id: string; nombre: string; itemsDirectos: MenuPublicoItem[] }[]
  onPress?: (item: MenuPublicoItem) => void
  /** Para que la pantalla sepa qué sección se ve (el scroll-spy) y pueda llevar a una al tocar su chip. */
  registrar: (id: string, el: HTMLDivElement | null) => void
  buscar: string
  hayDietas: boolean
  onLimpiarFiltros: () => void
}

/** Las secciones del menú en este orden: Descuentos, recomendaciones y categorías; o el aviso si nada pasa los filtros. */
export function SeccionesMenu({ descuentos, recomendados, nombreRecomendados, categorias, onPress, registrar, buscar, hayDietas, onLimpiarFiltros }: SeccionesMenuProps) {
  return (
    <>
      {descuentos.length > 0 && (
        <Seccion id="descuentos" titulo="Descuentos" platos={descuentos} onPress={onPress} registrar={registrar} />
      )}
      {recomendados.length > 0 && (
        <Seccion id="recomendados" titulo={nombreRecomendados} platos={recomendados} onPress={onPress} registrar={registrar} />
      )}
      {categorias.length > 0 ? (
        categorias.map((cat) => (
          <Seccion key={cat.id} id={cat.id} titulo={cat.nombre} platos={cat.itemsDirectos} onPress={onPress} registrar={registrar} />
        ))
      ) : recomendados.length === 0 && descuentos.length === 0 ? (
        <EmptyState buscar={buscar} hayDietas={hayDietas} onClear={onLimpiarFiltros} />
      ) : null}
    </>
  )
}
