import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useSessionStore } from '../../store/sessionStore'
import { MesaSinCarta } from './MesaSinCarta'

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
    useSessionStore.setState({ sesionId: 'ses-1', mesaId: 'mesa-1', jwt: 'jwt', numeroMesa: '5' })
  })

  afterEach(cleanup)

  it('explica qué pasó y que la mesa sigue abierta, sin culpar a la persona ni decir "no se pudo cargar"', () => {
    renderPantalla()

    expect(screen.getByRole('heading', { name: 'Este restaurante ya no está disponible', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/tu mesa sigue abierta/)).toBeInTheDocument()
    expect(screen.queryByText('No se pudo cargar el menú')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  // Con la baja, el personal recibe 403 al cobrar en efectivo o atender un llamado (entrega 4.7): ofrecerlos era mandar a
  // la persona a una espera que nadie podía atender.
  it('dice que se paga con Mercado Pago, y que el efectivo no está disponible', () => {
    renderPantalla()

    const guia = screen.getByRole('region', { name: 'Cómo pedir la cuenta' })
    expect(guia).toHaveTextContent('Pagar la cuenta')
    expect(guia).toHaveTextContent('Mercado Pago desde tu celular')
    expect(guia).toHaveTextContent('El pago en efectivo no está disponible')
  })

  it('no ofrece llamar al mozo ni pagar en efectivo', () => {
    renderPantalla()

    expect(screen.queryByRole('button', { name: /mozo/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/el mozo te la cobra/i)).not.toBeInTheDocument()
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

    for (const nombre of ['Pagar la cuenta', 'Ver mis pedidos']) {
      expect(screen.getByRole('button', { name: nombre })).toHaveStyle({ minHeight: '44px' })
    }
  })

  it('sin una sesión muestra lo mismo: la pantalla ya no depende del token de la mesa', () => {
    useSessionStore.setState({ sesionId: null, jwt: null })
    renderPantalla()

    expect(screen.getByRole('button', { name: 'Pagar la cuenta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver mis pedidos' })).toBeInTheDocument()
  })
})
