import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AsistenteDeLaCarta } from './BotonDelAsistente'

// Mientras el chat baja (es otro chunk), la hoja de "Abriendo el asistente…" es un diálogo modal como el chat: tiene el foco,
// un estado que se anuncia, un botón para cerrarla y Esc la cierra (A7 de docs/a11y/auditoria-general.md). Acá el chat
// "baja" cuando el test lo libera; en AsistenteDeLaCarta.spec.tsx baja de una vez.

/** Un chat que tarda en bajar: `liberar()` lo deja bajar. */
function chatQueTarda() {
  let liberar!: () => void
  const espera = new Promise<void>((resolver) => {
    liberar = resolver
  })
  return { liberar, cargar: () => espera.then(() => ({ default: () => <p>El chat ya bajó</p> })) }
}

function renderCarta(cargarElChat: Parameters<typeof AsistenteDeLaCarta>[0]['cargarElChat']) {
  const alCambiar = vi.fn()
  render(
    <AsistenteDeLaCarta restauranteId="rest-1" nombreRestaurante="La Parrilla" habilitado conCarrito={false} onAbiertoChange={alCambiar} cargarElChat={cargarElChat} />,
  )
  return { alCambiar, boton: screen.getByRole('button', { name: 'Asistente' }) }
}

describe('AsistenteDeLaCarta: la hoja mientras baja el chat', () => {
  it('es un diálogo con el foco adentro, un estado que se anuncia y un botón de cerrar; Esc la cierra y el foco vuelve al botón', async () => {
    const { alCambiar, boton } = renderCarta(chatQueTarda().cargar)

    await userEvent.click(boton)

    const hoja = await screen.findByRole('dialog', { name: 'Asistente' })
    expect(hoja).toHaveFocus()
    expect(within(hoja).getByText('Abriendo el asistente…')).toHaveAttribute('role', 'status')
    expect(within(hoja).getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
    expect(alCambiar).toHaveBeenLastCalledWith(true)

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(boton).toHaveFocus()
    expect(alCambiar).toHaveBeenLastCalledWith(false)
  })

  it('"Cerrar" la cierra, y el foco vuelve al botón', async () => {
    const { alCambiar, boton } = renderCarta(chatQueTarda().cargar)
    await userEvent.click(boton)
    const hoja = await screen.findByRole('dialog', { name: 'Asistente' })

    await userEvent.click(within(hoja).getByRole('button', { name: 'Cerrar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(boton).toHaveFocus()
    expect(alCambiar).toHaveBeenLastCalledWith(false)
  })

  it('tocar el fondo también la cierra', async () => {
    const { boton } = renderCarta(chatQueTarda().cargar)
    await userEvent.click(boton)
    const hoja = await screen.findByRole('dialog', { name: 'Asistente' })

    await userEvent.click(hoja.previousElementSibling as HTMLElement)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(boton).toHaveFocus()
  })

  it('cuando termina de bajar, la hoja deja su lugar al chat', async () => {
    const { cargar, liberar } = chatQueTarda()
    const { boton } = renderCarta(cargar)
    await userEvent.click(boton)
    expect(await screen.findByText('Abriendo el asistente…')).toBeInTheDocument()

    liberar()

    expect(await screen.findByText('El chat ya bajó')).toBeInTheDocument()
    expect(screen.queryByText('Abriendo el asistente…')).not.toBeInTheDocument()
  })
})
