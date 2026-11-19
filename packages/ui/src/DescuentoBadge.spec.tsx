import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CORAL } from './colores'
import { DescuentoBadge } from './DescuentoBadge'

describe('DescuentoBadge', () => {
  it('es una imagen con el texto "20% de descuento" y muestra -20%', () => {
    const html = renderToStaticMarkup(<DescuentoBadge porcentaje={20} />)

    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="20% de descuento"')
    expect(html).toContain('-20%')
  })

  it('el fondo es el coral de marca y el texto es blanco (4,6:1)', () => {
    const html = renderToStaticMarkup(<DescuentoBadge porcentaje={20} />)

    expect(html.toLowerCase()).toContain(`background:${CORAL.toLowerCase()}`)
    expect(html).toContain('color:white')
  })

  it('el tamaño se pasa por prop y la letra no baja de 9 px', () => {
    const grande = renderToStaticMarkup(<DescuentoBadge porcentaje={50} tamano={60} />)
    const chico = renderToStaticMarkup(<DescuentoBadge porcentaje={50} tamano={20} />)

    expect(grande).toContain('width:60px')
    expect(grande).toContain('font-size:18px')
    expect(chico).toContain('font-size:9px')
  })

  it('la sombra es del mismo coral (no del anterior)', () => {
    const html = renderToStaticMarkup(<DescuentoBadge porcentaje={20} />)

    expect(html).toContain('rgba(204,74,49,0.35)')
    expect(html).not.toContain('232,86,58')
  })
})
