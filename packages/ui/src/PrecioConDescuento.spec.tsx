import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CORAL, GRIS_TEXTO } from './colores'
import { PrecioConDescuento } from './PrecioConDescuento'

const formatear = (valor: number) => `$ ${valor}`

describe('PrecioConDescuento', () => {
  it('sin descuento dibuja solo el precio, con el estilo del lugar donde se usa', () => {
    const html = renderToStaticMarkup(
      <PrecioConDescuento precioBase={1000} precioVigente={1000} formatear={formatear} estilo={{ color: 'rgb(1, 2, 3)' }} />,
    )

    expect(html).toBe('<span style="color:rgb(1, 2, 3)">$ 1000</span>')
  })

  it('con descuento tacha el precio original en el gris de texto (4,8:1, no el gris claro de antes)', () => {
    const html = renderToStaticMarkup(<PrecioConDescuento precioBase={1000} precioVigente={800} formatear={formatear} />)

    expect(html).toContain('<s ')
    expect(html.toLowerCase()).toContain(`color:${GRIS_TEXTO.toLowerCase()}`)
    expect(html).toContain('line-through')
    expect(html.toLowerCase()).not.toContain('#9ca3af')
  })

  it('con descuento el precio vigente va en el coral de marca, en negrita', () => {
    const html = renderToStaticMarkup(<PrecioConDescuento precioBase={1000} precioVigente={800} formatear={formatear} />)

    expect(html.toLowerCase()).toContain(`color:${CORAL.toLowerCase()};font-weight:700`)
    expect(html).toContain('$ 800')
  })

  it('el color del descuento se puede cambiar por prop', () => {
    const html = renderToStaticMarkup(
      <PrecioConDescuento precioBase={1000} precioVigente={800} formatear={formatear} colorDescuento="rgb(9, 9, 9)" />,
    )

    expect(html).toContain('color:rgb(9, 9, 9);font-weight:700')
    expect(html.toLowerCase()).not.toContain(CORAL.toLowerCase())
  })

  it('el lector dice "Antes $ 1000, ahora $ 800" (el texto de más es solo para él)', () => {
    const html = renderToStaticMarkup(<PrecioConDescuento precioBase={1000} precioVigente={800} formatear={formatear} />)

    expect(html).toContain('Antes </span>')
    expect(html).toContain(', ahora </span>')
  })

  it.each([
    ['tarjeta', 11, 'flex-direction:column'],
    ['fila', 12, 'flex-wrap:wrap'],
    ['detalle', 15, 'gap:0 10px'],
  ] as const)('la variante %s tacha el original a %s px', (variante, tamano, rasgo) => {
    const html = renderToStaticMarkup(
      <PrecioConDescuento precioBase={1000} precioVigente={800} formatear={formatear} variante={variante} />,
    )

    expect(html).toContain(`font-size:${tamano}px`)
    expect(html).toContain(rasgo)
  })
})
