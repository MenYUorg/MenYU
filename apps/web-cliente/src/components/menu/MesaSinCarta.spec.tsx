import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../services/api'
import { useSessionStore } from '../../store/sessionStore'
import { MesaSinCarta } from './MesaSinCarta'

vi.mock('../../services/api', () => ({
  api: { waiterCalls: { llamar: vi.fn() } },
}))

const llamar = vi.mocked(api.waiterCalls.llamar)

function renderPantalla() {
  return render(
    <MemoryRouter initialEntries={['/menu']}>
      <Routes>
        <Route path="/menu" element={<MesaSinCarta />} />
        <Route path="/pagar" element={<p>Pantalla de pagar</p>} />
        <Route path="/pedidos" element={<p>Pantalla de pedidos</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MesaSinCarta (la mesa sigue abierta pero el restaurante se dio de baja)', () => {
  beforeEach(() => {
    llamar.mockReset().mockResolvedValue({ ok: true })
    useSessionStore.setState({ sesionId: 'ses-1', mesaId: 'mesa-1', jwt: 'jwt', numeroMesa: '5' })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('explica qué pasó y que la mesa sigue abierta, sin culpar a la persona ni decir "no se pudo cargar"', () => {
    renderPantalla()

    expect(screen.getByRole('heading', { name: 'Este restaurante ya no está disponible', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/tu mesa sigue abierta/)).toBeInTheDocument()
    expect(screen.queryByText('No se pudo cargar el menú')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('dice cómo pedir la cuenta: pagando (Mercado Pago o efectivo) o llamando al mozo', () => {
    renderPantalla()

    const guia = screen.getByRole('region', { name: 'Cómo pedir la cuenta' })
    expect(guia).toHaveTextContent('Pagar la cuenta')
    expect(guia).toHaveTextContent('Mercado Pago o efectivo')
    expect(guia).toHaveTextContent('el mozo te la cobra en la mesa')
    expect(guia).toHaveTextContent('Llamar al mozo')
  })

  it('muestra el número de la mesa', () => {
    renderPantalla()

    expect(screen.getByText('Mesa 5')).toBeInTheDocument()
  })

  it('"Pagar la cuenta" lleva a pagar y "Ver mis pedidos" a los pedidos', () => {
    renderPantalla()
    fireEvent.click(screen.getByRole('button', { name: 'Pagar la cuenta' }))
    expect(screen.getByText('Pantalla de pagar')).toBeInTheDocument()

    cleanup()
    renderPantalla()
    fireEvent.click(screen.getByRole('button', { name: 'Ver mis pedidos' }))
    expect(screen.getByText('Pantalla de pedidos')).toBeInTheDocument()
  })

  it('los botones miden 44 px o más', () => {
    renderPantalla()

    for (const nombre of ['Pagar la cuenta', 'Ver mis pedidos', 'Llamar al mozo']) {
      expect(screen.getByRole('button', { name: nombre })).toHaveStyle({ minHeight: '44px' })
    }
  })

  describe('"Llamar al mozo"', () => {
    it('avisa al mozo de la mesa y dice que está en camino', async () => {
      renderPantalla()

      fireEvent.click(screen.getByRole('button', { name: 'Llamar al mozo' }))

      expect(await screen.findByRole('button', { name: '¡Ya avisamos! El mozo va en camino' })).toBeInTheDocument()
      expect(llamar).toHaveBeenCalledTimes(1)
      expect(llamar).toHaveBeenCalledWith('ses-1', 'jwt')
    })

    it('mientras llama queda deshabilitado, y un segundo toque no vuelve a llamar', async () => {
      let responder!: (valor: { ok: boolean }) => void
      llamar.mockReturnValue(new Promise((res) => { responder = res }))
      renderPantalla()

      fireEvent.click(screen.getByRole('button', { name: 'Llamar al mozo' }))
      const llamando = await screen.findByRole('button', { name: 'Llamando…' })
      fireEvent.click(llamando)

      expect(llamando).toBeDisabled()
      expect(llamar).toHaveBeenCalledTimes(1)
      await act(async () => responder({ ok: true }))
    })

    it('con el aviso ya hecho, otro toque no vuelve a llamar hasta que el botón se reponga', async () => {
      renderPantalla()
      fireEvent.click(screen.getByRole('button', { name: 'Llamar al mozo' }))
      const avisado = await screen.findByRole('button', { name: '¡Ya avisamos! El mozo va en camino' })

      fireEvent.click(avisado)

      expect(llamar).toHaveBeenCalledTimes(1)
    })

    it('si falla, lo dice y deja volver a intentar a los pocos segundos', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      llamar.mockRejectedValueOnce(new Error('sin conexión'))
      renderPantalla()

      fireEvent.click(screen.getByRole('button', { name: 'Llamar al mozo' }))
      expect(await screen.findByRole('button', { name: 'No pudimos avisar. Probá de nuevo' })).toBeInTheDocument()

      await act(async () => { await vi.advanceTimersByTimeAsync(4100) })
      expect(screen.getByRole('button', { name: 'Llamar al mozo' })).toBeEnabled()
      fireEvent.click(screen.getByRole('button', { name: 'Llamar al mozo' }))
      await screen.findByRole('button', { name: '¡Ya avisamos! El mozo va en camino' })
      expect(llamar).toHaveBeenCalledTimes(2)
    })

    it('sin una sesión (sin token) no se ofrece llamar al mozo, pero sí lo demás', () => {
      useSessionStore.setState({ sesionId: null, jwt: null })
      renderPantalla()

      expect(screen.queryByRole('button', { name: 'Llamar al mozo' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Pagar la cuenta' })).toBeInTheDocument()
    })

    it('desmontar la pantalla con el aviso en curso no deja nada pendiente', async () => {
      const { unmount } = renderPantalla()
      fireEvent.click(screen.getByRole('button', { name: 'Llamar al mozo' }))
      await screen.findByRole('button', { name: '¡Ya avisamos! El mozo va en camino' })

      expect(() => unmount()).not.toThrow()
    })
  })
})
