import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AsistenteDeLaCarta } from './BotonDelAsistente'

// Si el chat no baja (sin conexión, o un deploy nuevo que lo cambió de nombre), el aviso se anuncia, tiene el foco, se cierra
// con su botón o con Esc y el próximo toque lo intenta de nuevo (A8 de docs/a11y/auditoria-general.md).

const noBaja = vi.fn(() => Promise.reject<{ default: () => null }>(new Error('Failed to fetch dynamically imported module')))

function renderCarta() {
  const alCambiar = vi.fn()
  render(
    <AsistenteDeLaCarta restauranteId="rest-1" nombreRestaurante="La Parrilla" habilitado conCarrito={false} onAbiertoChange={alCambiar} cargarElChat={noBaja} />,
  )
  return { alCambiar, boton: screen.getByRole('button', { name: 'Asistente' }) }
}

/** El aviso reemplaza a la hoja de "Abriendo el asistente…": se espera la alerta y recién ahí se toma el diálogo. */
async function elAviso() {
  const alerta = await screen.findByRole('alert')
  return { alerta, hoja: screen.getByRole('dialog', { name: 'Asistente' }) }
}

describe('AsistenteDeLaCarta: el aviso cuando no baja el chat', () => {
  // React escribe en la consola cada error que atrapa un límite: acá es lo esperado.
  beforeEach(() => {
    noBaja.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('es un diálogo con el foco adentro y una alerta; Esc lo cierra, el foco vuelve al botón y se avisa a la carta', async () => {
    const { alCambiar, boton } = renderCarta()

    await userEvent.click(boton)

    const { alerta, hoja } = await elAviso()
    expect(hoja).toContainElement(alerta)
    expect(alerta).toHaveTextContent('No pudimos abrir el asistente')
    expect(hoja).toHaveFocus()
    expect(within(hoja).getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
    expect(alCambiar).toHaveBeenLastCalledWith(true)

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(boton).toHaveFocus()
    expect(alCambiar).toHaveBeenLastCalledWith(false)
  })

  it('"Cerrar" lo cierra y el próximo toque vuelve a intentar bajar el chat', async () => {
    const { boton } = renderCarta()
    await userEvent.click(boton)
    const { hoja } = await elAviso()
    const intentos = noBaja.mock.calls.length

    await userEvent.click(within(hoja).getByRole('button', { name: 'Cerrar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(boton).toHaveFocus()

    await userEvent.click(boton)

    expect((await elAviso()).alerta).toHaveTextContent('No pudimos abrir el asistente')
    expect(noBaja.mock.calls.length).toBeGreaterThan(intentos)
  })
})
