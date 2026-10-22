import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Dialogo } from './Dialogo'

function Ejemplo({ ocupado = false, avisaRegistro }: { ocupado?: boolean; avisaRegistro?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}>
        Abrir
      </button>
      {abierto && (
        <Dialogo
          titulo="Nueva marca"
          descripcion="Una marca agrupa restaurantes."
          onCerrar={() => setAbierto(false)}
          ocupado={ocupado}
          avisaRegistro={avisaRegistro}
          pie={
            <>
              <button type="button" onClick={() => setAbierto(false)}>
                Cancelar
              </button>
              <button type="button">Guardar</button>
            </>
          }
        >
          <label>
            Nombre
            <input />
          </label>
        </Dialogo>
      )}
    </>
  )
}

async function abrir() {
  const abridor = screen.getByRole('button', { name: 'Abrir' })
  await userEvent.click(abridor)
  return abridor
}

describe('Dialogo', () => {
  it('es un diálogo modal con título y descripción accesibles', async () => {
    render(<Ejemplo />)
    await abrir()

    const dialogo = screen.getByRole('dialog', { name: 'Nueva marca' })
    expect(dialogo).toHaveAttribute('aria-modal', 'true')
    expect(dialogo).toHaveTextContent('Una marca agrupa restaurantes.')
  })

  it('se dibuja en document.body, dentro de la clase .rc, y no dentro de la pantalla que lo abre', async () => {
    const { container } = render(<Ejemplo />)
    await abrir()

    const dialogo = screen.getByRole('dialog')
    expect(container).not.toContainElement(dialogo)
    expect(dialogo.closest('.rc')).not.toBeNull()
    expect(document.body).toContainElement(dialogo)
  })

  it('avisa que la acción queda registrada en el historial (salvo que se pida lo contrario)', async () => {
    const { unmount } = render(<Ejemplo />)
    await abrir()
    expect(screen.getByText('Esta acción queda registrada en el historial.')).toBeInTheDocument()
    unmount()

    render(<Ejemplo avisaRegistro={false} />)
    await abrir()
    expect(screen.queryByText('Esta acción queda registrada en el historial.')).not.toBeInTheDocument()
  })

  it('al abrir, el foco va al primer campo', async () => {
    render(<Ejemplo />)
    await abrir()

    expect(screen.getByLabelText('Nombre')).toHaveFocus()
  })

  it('Escape lo cierra y el foco vuelve a lo que lo abrió', async () => {
    render(<Ejemplo />)
    const abridor = await abrir()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(abridor).toHaveFocus()
  })

  it('mientras guarda, Escape no lo cierra', async () => {
    render(<Ejemplo ocupado />)
    await abrir()

    await userEvent.keyboard('{Escape}')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('tocar el fondo no lo cierra: no se pierde lo escrito por un toque de más', async () => {
    render(<Ejemplo />)
    await abrir()
    await userEvent.type(screen.getByLabelText('Nombre'), 'La Parrilla')

    const fondo = screen.getByRole('dialog').parentElement as HTMLElement
    await userEvent.click(fondo)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('La Parrilla')
  })

  it('Tab recorre los controles y vuelve al primero sin salir del diálogo', async () => {
    render(<Ejemplo />)
    await abrir()
    expect(screen.getByLabelText('Nombre')).toHaveFocus()

    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByLabelText('Nombre')).toHaveFocus()
  })

  it('Shift+Tab desde el primer control salta al último', async () => {
    render(<Ejemplo />)
    await abrir()

    await userEvent.tab({ shift: true })

    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus()
  })

  it('con un icono lo dibuja en un círculo verde justo arriba del título; sin icono no hay círculo', () => {
    const pie = <button type="button">Listo</button>
    const { unmount } = render(
      <Dialogo titulo="Invitación enviada" icono={Mail} onCerrar={vi.fn()} pie={pie}>
        Texto
      </Dialogo>,
    )

    const circulo = screen.getByRole('dialog').querySelector('.ok-ic')
    expect(circulo).not.toBeNull()
    expect(circulo?.nextElementSibling).toBe(screen.getByRole('heading', { name: 'Invitación enviada' }))
    expect(circulo?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    unmount()

    render(
      <Dialogo titulo="Sin icono" onCerrar={vi.fn()} pie={pie}>
        Texto
      </Dialogo>,
    )
    expect(document.querySelector('.ok-ic')).toBeNull()
  })
})
