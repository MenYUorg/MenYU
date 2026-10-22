import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { FilaDeDueno } from './FilaDeDueno'

const MARCA = { id: 'marca-1', nombre: 'La Parrilla', activo: true }

function dibujar(props: Partial<React.ComponentProps<typeof FilaDeDueno>> = {}) {
  const alQuitar = vi.fn()
  render(
    <MemoryRouter>
      <FilaDeDueno nombre="Juan Pérez" email="juan@laparrilla.com" onQuitar={alQuitar} {...props} />
    </MemoryRouter>,
  )
  return { alQuitar }
}

describe('FilaDeDueno', () => {
  it('muestra el nombre y el email', () => {
    dibujar()

    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
    expect(screen.getByText('juan@laparrilla.com')).toBeInTheDocument()
  })

  it('sin marca (en el detalle de una marca) no muestra ningún enlace', () => {
    dibujar()

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('con marca, se toca para abrirla', () => {
    dibujar({ marca: MARCA })

    expect(screen.getByRole('link', { name: 'La Parrilla' })).toHaveAttribute('href', '/root/marcas/marca-1')
    expect(screen.queryByText(/marca de baja/)).not.toBeInTheDocument()
  })

  it('si la marca está de baja lo dice', () => {
    dibujar({ marca: { ...MARCA, activo: false } })

    expect(screen.getByText(/marca de baja/)).toBeInTheDocument()
  })

  it('una cuenta desactivada lleva su aviso, y una activa no', () => {
    dibujar({ desactivada: true })

    expect(screen.getByText('Cuenta desactivada')).toBeInTheDocument()
  })

  it('por defecto no avisa nada de la cuenta', () => {
    dibujar()

    expect(screen.queryByText('Cuenta desactivada')).not.toBeInTheDocument()
  })

  it('su único menú es "Quitar acceso" (no hay eliminar, cambiar email ni restablecer)', async () => {
    const { alQuitar } = dibujar()

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Juan Pérez' }))

    expect(screen.getAllByRole('menuitem').map((o) => o.textContent)).toEqual(['Quitar acceso'])
    await userEvent.click(screen.getByRole('menuitem', { name: 'Quitar acceso' }))
    expect(alQuitar).toHaveBeenCalledTimes(1)
  })

  it('con marca, el botón del menú la nombra: una persona puede ser dueña de varias y las etiquetas no se repiten', () => {
    dibujar({ marca: MARCA })

    expect(screen.getByRole('button', { name: 'Acciones de Juan Pérez (La Parrilla)' })).toBeInTheDocument()
  })
})
