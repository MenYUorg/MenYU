import { fireEvent, render, screen } from '@testing-library/react'
import { axe } from '../../test/axe'
import { BloqueEstado } from './BloqueEstado'

describe('BloqueEstado', () => {
  it('por defecto el título es un <h2>: el bloque va dentro de una pantalla que ya tiene su <h1>', () => {
    render(<BloqueEstado icono="lupa" titulo="No encontramos nada" texto="Probá con otra palabra." />)

    expect(screen.getByRole('heading', { level: 2, name: 'No encontramos nada' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('cuando es toda la pantalla, el título es el <h1>', () => {
    render(<BloqueEstado icono="local" titulo="No encontramos este restaurante" texto="Puede que ya no esté." nivelDelTitulo={1} />)

    expect(screen.getByRole('heading', { level: 1, name: 'No encontramos este restaurante' })).toBeInTheDocument()
  })

  it('es una región de estado, o una alerta si es un error', () => {
    const { rerender } = render(<BloqueEstado icono="aviso" titulo="Hubo un problema" texto="Reintentá." />)
    expect(screen.getByRole('status')).toBeInTheDocument()

    rerender(<BloqueEstado icono="aviso" titulo="Hubo un problema" texto="Reintentá." rol="alert" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('con botón, lo muestra y avisa cuando se toca', () => {
    const alTocar = vi.fn()
    render(<BloqueEstado icono="aviso" titulo="Hubo un problema" texto="Reintentá." boton="Reintentar" onBoton={alTocar} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(alTocar).toHaveBeenCalledTimes(1)
  })

  it('sin botón no pone ninguno', () => {
    render(<BloqueEstado icono="aviso" titulo="Hubo un problema" texto="Reintentá." />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const { container } = render(<main><BloqueEstado icono="local" titulo="No encontramos este restaurante" texto="Puede que ya no esté." boton="Volver" nivelDelTitulo={1} /></main>)

    expect(await axe(container)).toHaveNoViolations()
  })
})
