import { useRef } from 'react'
import type { DiscoveryOferta } from '@menyu/types'
import { C } from '../../theme'
import { Icono } from './Icono'
import { TarjetaOferta } from './TarjetaOferta'

const FLECHA =
  'absolute top-[calc(50%-28px)] z-[2] hidden h-11 w-11 items-center justify-center rounded-full border bg-white shadow-[0_4px_12px_rgba(45,53,97,0.15)] hover:border-[#2D3561] lg:flex'

/**
 * Carrusel de ofertas: el scroll horizontal queda dentro de la sección (la página no se mueve). En celular se desliza
 * con el dedo; en escritorio aparecen las flechas.
 */
export function CarruselOfertas({ ofertas }: { ofertas: DiscoveryOferta[] }) {
  const pista = useRef<HTMLDivElement>(null)

  const mover = (direccion: -1 | 1) => {
    const el = pista.current
    if (el) el.scrollBy({ left: direccion * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Ofertas anteriores"
        onClick={() => mover(-1)}
        className={`${FLECHA} left-[-18px]`}
        style={{ borderColor: C.border, color: C.navy }}
      >
        <Icono nombre="izquierda" tam={20} />
      </button>

      <div
        ref={pista}
        data-testid="carrusel-ofertas"
        className="-mx-[14px] flex snap-x snap-proximity gap-[10px] overflow-x-auto px-[14px] pb-2 pt-[2px] [-webkit-overflow-scrolling:touch] [scroll-padding-left:14px] [scrollbar-width:none] md:-mx-6 md:px-6 md:[scroll-padding-left:24px] lg:mx-0 lg:px-[2px] lg:[scroll-padding-left:2px] [&::-webkit-scrollbar]:hidden"
      >
        {ofertas.map((oferta) => (
          <div key={oferta.id} className="flex w-[148px] flex-none snap-start md:w-[172px] xl:w-[196px]">
            <div className="flex min-w-0 flex-1 flex-col [&>a]:flex-1">
              <TarjetaOferta oferta={oferta} />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        aria-label="Más ofertas"
        onClick={() => mover(1)}
        className={`${FLECHA} right-[-18px]`}
        style={{ borderColor: C.border, color: C.navy }}
      >
        <Icono nombre="derecha" tam={20} />
      </button>
    </div>
  )
}
