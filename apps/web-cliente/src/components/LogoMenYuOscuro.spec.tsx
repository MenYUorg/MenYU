import { render, screen } from '@testing-library/react'
import { LogoMenYuOscuro } from '@menyu/ui'
import { AnfitrionScreen, CodigoSesionScreen } from './SesionSeguraModals'

// El componente vive en @menyu/ui (que no tiene tests propios): se prueba acá, donde lo usa la tarjeta del modo seguro.
describe('LogoMenYuOscuro', () => {
  const logo = () => screen.getByRole('img', { name: 'MenYU' })

  it('muestra la imagen del logo para fondos oscuros, con el nombre de la marca', () => {
    render(<LogoMenYuOscuro alto={24} />)

    expect(logo()).toHaveAttribute('src', '/LogoParaOscuro.png')
  })

  it('se puede usar otra ruta de imagen', () => {
    render(<LogoMenYuOscuro alto={24} src="/otro.png" />)

    expect(logo()).toHaveAttribute('src', '/otro.png')
  })

  it('recorta el aire transparente del PNG: la caja mide el alto de las letras y es tan ancha como ellas', () => {
    render(<LogoMenYuOscuro alto={38} />)

    const caja = logo().parentElement as HTMLElement
    // escala = 38 / 380 letras de alto; las letras ocupan 1932 px de ancho en el archivo de 2172 × 724
    expect(caja.style.height).toBe('38px')
    expect(caja.style.width).toBe('193.2px')
    expect(caja.style.overflow).toBe('hidden')
    expect(logo().style.width).toBe('217.2px')
    expect(logo().style.height).toBe('72.4px')
    expect(logo().style.left).toBe('-12px')
    expect(logo().style.top).toBe('-16.5px')
  })

  it('con "soloU" muestra solo la U con el tenedor, centrada en una caja angosta', () => {
    render(<LogoMenYuOscuro alto={38} soloU />)

    const caja = logo().parentElement as HTMLElement
    expect(caja.style.height).toBe('38px')
    expect(caja.style.width).toBe('33.4px')
    expect(logo().style.left).toBe('-171.8px')
  })

  it('el alto manda: otro alto escala todo en proporción', () => {
    render(<LogoMenYuOscuro alto={19} />)

    const caja = logo().parentElement as HTMLElement
    expect(caja.style.height).toBe('19px')
    expect(caja.style.width).toBe('96.6px')
  })

  it('no se encoge dentro de un contenedor flex', () => {
    render(<LogoMenYuOscuro alto={24} />)

    expect((logo().parentElement as HTMLElement).style.flexShrink).toBe('0')
  })

  describe('en la tarjeta del modo seguro', () => {
    it('la pantalla del anfitrión lleva el logo real, no uno armado con texto', () => {
      render(<AnfitrionScreen codigo="731" onContinuar={vi.fn()} />)

      expect(logo()).toHaveAttribute('src', '/LogoParaOscuro.png')
      expect(screen.queryByText('MENY')).not.toBeInTheDocument()
    })

    it('la pantalla del código de la mesa también', () => {
      render(<CodigoSesionScreen loading={false} error={null} onSubmit={vi.fn()} onVolver={vi.fn()} />)

      expect(logo()).toHaveAttribute('src', '/LogoParaOscuro.png')
      expect(screen.queryByText('MENY')).not.toBeInTheDocument()
    })
  })
})
