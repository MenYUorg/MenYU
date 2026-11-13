import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from '../../test/axe'
import { ChipsSecciones, type SeccionMenu } from './ChipsSecciones'

const SECCIONES: SeccionMenu[] = [
  { id: 'descuentos', nombre: 'Descuentos' },
  { id: 'cat-1', nombre: 'Hamburguesas' },
  { id: 'cat-2', nombre: 'Cervezas' },
]

describe('ChipsSecciones', () => {
  it('es una navegación con nombre: "Secciones del menú"', () => {
    render(<ChipsSecciones secciones={SECCIONES} activa="cat-1" onElegir={() => {}} />)

    const navegacion = screen.getByRole('navigation', { name: 'Secciones del menú' })
    expect(navegacion).toContainElement(screen.getByRole('button', { name: 'Cervezas' }))
  })

  it('cada sección es un botón con su nombre', () => {
    render(<ChipsSecciones secciones={SECCIONES} activa="cat-1" onElegir={() => {}} />)

    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Descuentos', 'Hamburguesas', 'Cervezas'])
  })

  it('el chip de la sección que se está viendo lo dice (aria-current) y los demás no', () => {
    render(<ChipsSecciones secciones={SECCIONES} activa="cat-1" onElegir={() => {}} />)

    expect(screen.getByRole('button', { name: 'Hamburguesas' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'Descuentos' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Cervezas' })).not.toHaveAttribute('aria-current')
  })

  it('al cambiar la sección activa, el "actual" pasa al otro chip', () => {
    const { rerender } = render(<ChipsSecciones secciones={SECCIONES} activa="cat-1" onElegir={() => {}} />)

    rerender(<ChipsSecciones secciones={SECCIONES} activa="cat-2" onElegir={() => {}} />)

    expect(screen.getByRole('button', { name: 'Cervezas' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'Hamburguesas' })).not.toHaveAttribute('aria-current')
  })

  it('si ninguna es la activa, ninguna dice "actual"', () => {
    render(<ChipsSecciones secciones={SECCIONES} activa="" onElegir={() => {}} />)

    for (const chip of screen.getAllByRole('button')) expect(chip).not.toHaveAttribute('aria-current')
  })

  it('tocar un chip avisa cuál con su id', () => {
    const alElegir = vi.fn()
    render(<ChipsSecciones secciones={SECCIONES} activa="cat-1" onElegir={alElegir} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cervezas' }))

    expect(alElegir).toHaveBeenCalledWith('cat-2')
  })

  it('se elige con el teclado (Enter)', async () => {
    const usuario = userEvent.setup()
    const alElegir = vi.fn()
    render(<ChipsSecciones secciones={SECCIONES} activa="cat-1" onElegir={alElegir} />)
    screen.getByRole('button', { name: 'Descuentos' }).focus()

    await usuario.keyboard('{Enter}')

    expect(alElegir).toHaveBeenCalledWith('descuentos')
  })

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const { container } = render(<ChipsSecciones secciones={SECCIONES} activa="cat-1" onElegir={() => {}} />)

    expect(await axe(container)).toHaveNoViolations()
  })
})
