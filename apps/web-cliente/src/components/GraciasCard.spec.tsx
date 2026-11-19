import { fireEvent, render, screen } from '@testing-library/react'
import { axe } from '../test/axe'
import { GraciasCard } from './GraciasCard'

describe('GraciasCard como pantalla (/pago/exitoso)', () => {
  it('el título es el <h1> de la página y no es un diálogo', () => {
    render(<GraciasCard subtitulo="Tu pago fue acreditado." onSalir={() => {}} />)

    expect(screen.getByRole('heading', { level: 1, name: '¡Gracias por su visita!' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByText('Tu pago fue acreditado.')).toBeInTheDocument()
  })

  it('no toma el foco: de eso se ocupa el cambio de pantalla (el foco va al <h1> de la ruta)', () => {
    render(<GraciasCard subtitulo="Tu pago fue acreditado." onSalir={() => {}} />)

    expect(document.body).toHaveFocus()
  })

  it('"Salir" llama a onSalir', () => {
    const onSalir = vi.fn()
    render(<GraciasCard subtitulo="Tu pago fue acreditado." onSalir={onSalir} />)

    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))

    expect(onSalir).toHaveBeenCalledTimes(1)
  })

  it('el tilde es solo para la vista y el botón cambia de color al pasar el mouse', () => {
    const { container } = render(<GraciasCard subtitulo="Tu pago fue acreditado." onSalir={() => {}} />)

    expect(container.querySelector('svg')!.closest('[aria-hidden="true"]')).not.toBeNull()
    const salir = screen.getByRole('button', { name: 'Salir' })
    fireEvent.mouseEnter(salir)
    expect(salir).toHaveStyle({ background: '#d34a30' })
    fireEvent.mouseLeave(salir)
    expect(salir).toHaveStyle({ background: '#E8563A' })
  })

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const { container } = render(<main><GraciasCard subtitulo="Tu pago fue acreditado." onSalir={() => {}} /></main>)

    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('GraciasCard como diálogo (el local cerró o cobró la sesión)', () => {
  const abrirDialogo = () => render(<GraciasCard comoDialogo subtitulo="Su sesión ha sido cerrada." onSalir={() => {}} />)

  it('es un diálogo de alerta modal con nombre ("¡Gracias por su visita!") y descripción (el subtítulo)', () => {
    abrirDialogo()

    const dialogo = screen.getByRole('alertdialog', { name: '¡Gracias por su visita!' })
    expect(dialogo).toHaveAttribute('aria-modal', 'true')
    expect(dialogo).toHaveAccessibleDescription('Su sesión ha sido cerrada.')
  })

  it('el título es un <h2> (la pantalla de abajo ya tiene su <h1>) y recibe el foco', () => {
    abrirDialogo()

    const titulo = screen.getByRole('heading', { level: 2, name: '¡Gracias por su visita!' })
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(titulo).toHaveFocus()
    expect(titulo).toHaveAttribute('tabindex', '-1')
  })

  it('al cerrarse el foco vuelve a lo que lo tenía antes', () => {
    const antes = document.createElement('button')
    document.body.appendChild(antes)
    antes.focus()
    const { unmount } = abrirDialogo()
    expect(antes).not.toHaveFocus()

    unmount()

    expect(antes).toHaveFocus()
    antes.remove()
  })

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const { container } = abrirDialogo()

    expect(await axe(container)).toHaveNoViolations()
  })
})
