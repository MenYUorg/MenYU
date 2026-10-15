import { C } from '../../theme'
import { TituloSeccion } from '../TituloSeccion'

// Esqueletos con la forma de las tarjetas: al llegar los datos no se mueve nada. Grises, con el pulso de Tailwind.
const bloque = (alto: number, ancho: string) => (
  <div className="animate-pulse" style={{ height: alto, width: ancho, background: C.border, borderRadius: 8 }} />
)

function EsqueletoOferta() {
  return (
    <div className="w-[148px] flex-none overflow-hidden rounded-xl border bg-white md:w-[172px] xl:w-[196px]" style={{ borderColor: C.border }}>
      <div className="animate-pulse" style={{ paddingBottom: '80%', background: C.border }} />
      <div style={{ padding: '12px 11px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bloque(12, '90%')}
        {bloque(10, '60%')}
        {bloque(14, '45%')}
      </div>
    </div>
  )
}

function EsqueletoRestaurante() {
  return (
    <div className="flex min-h-[80px] items-center gap-3 rounded-xl border bg-white p-3" style={{ borderColor: C.border }}>
      <div className="animate-pulse" style={{ width: 56, height: 56, borderRadius: 12, flex: 'none', background: C.border }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bloque(14, '70%')}
        {bloque(11, '90%')}
      </div>
    </div>
  )
}

/** La home mientras llegan los datos. */
export function EsqueletosHome() {
  const seis = Array.from({ length: 6 }, (_, i) => i)
  return (
    <div aria-busy="true" aria-label="Cargando restaurantes y ofertas">
      <section style={{ marginBottom: 28 }}>
        <TituloSeccion>Ofertas</TituloSeccion>
        <div className="-mx-[14px] flex gap-[10px] overflow-hidden px-[14px] pb-2 pt-[2px] md:-mx-6 md:px-6 lg:mx-0 lg:px-[2px]">
          {seis.map((i) => <EsqueletoOferta key={i} />)}
        </div>
      </section>
      <section style={{ marginBottom: 28 }}>
        <TituloSeccion>Restaurantes</TituloSeccion>
        <div className="grid grid-cols-1 gap-[10px] md:grid-cols-2 lg:grid-cols-3">
          {seis.map((i) => <EsqueletoRestaurante key={i} />)}
        </div>
      </section>
    </div>
  )
}
