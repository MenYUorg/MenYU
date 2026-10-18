import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { SelectorPage } from './SelectorPage'

const logout = vi.fn()
const setRestauranteId = vi.fn()
let usuario: { nombre?: string; email?: string; restauranteId?: string; tipo?: string } | null

vi.mock('@menyu/auth', () => ({ useAuth: () => ({ user: usuario, logout }) }))
vi.mock('@menyu/ui', () => ({ LogoMenYuOscuro: () => <span>MenYU</span> }))
vi.mock('../../store/mozoStore', () => ({ useMozoStore: () => ({ setRestauranteId }) }))

function Destino() {
  return <p>destino {useLocation().pathname}</p>
}

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<SelectorPage />} />
        <Route path="*" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  )
}

const tarjeta = (titulo: string) => screen.getByText(titulo).closest('div[style*="cursor"]') as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  usuario = { nombre: 'Ana Pérez', email: 'ana@menyu.com', restauranteId: 'rest-1', tipo: 'mozo' }
})

describe('SelectorPage', () => {
  it('saluda con el nombre y las iniciales; un mozo ve cocina y mozo, no la caja', () => {
    abrir()

    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('AP')).toBeInTheDocument()
    expect(screen.getByText('Panel Cocina')).toBeInTheDocument()
    expect(screen.getByText('Panel Mozo')).toBeInTheDocument()
    expect(screen.queryByText('Panel Caja / Cobros')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/22222222/)).not.toBeInTheDocument()
  })

  it('sin nombre usa el email; sin usuario dice "Usuario"', () => {
    usuario = { email: 'juan.gomez@menyu.com', restauranteId: 'rest-1' }
    const { unmount } = abrir()
    expect(screen.getByText('juan.gomez@menyu.com')).toBeInTheDocument()
    expect(screen.getByText('JG')).toBeInTheDocument()
    unmount()

    usuario = null
    abrir()
    expect(screen.getByText('Usuario')).toBeInTheDocument()
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it.each([
    ['Panel Cocina', 'destino /cocina'],
    ['Panel Mozo', 'destino /mozo'],
  ])('"%s" guarda el restaurante del usuario y entra', (panel, destino) => {
    abrir()

    const card = tarjeta(panel)
    fireEvent.mouseEnter(card)
    fireEvent.mouseLeave(card)
    fireEvent.click(card)

    expect(setRestauranteId).toHaveBeenCalledWith('rest-1')
    expect(screen.getByText(destino)).toBeInTheDocument()
  })

  it('un admin sin restaurante lo escribe a mano y puede entrar a la caja', () => {
    usuario = { nombre: 'Root', tipo: 'admin' }
    abrir()

    fireEvent.click(tarjeta('Panel Caja / Cobros'))
    expect(setRestauranteId).not.toHaveBeenCalled()

    const campo = screen.getByPlaceholderText(/22222222/)
    fireEvent.focus(campo)
    fireEvent.change(campo, { target: { value: '   ' } })
    fireEvent.blur(campo)
    fireEvent.click(tarjeta('Panel Cocina'))
    expect(setRestauranteId).not.toHaveBeenCalled()

    fireEvent.change(campo, { target: { value: '  rest-9  ' } })
    fireEvent.click(tarjeta('Panel Caja / Cobros'))
    expect(setRestauranteId).toHaveBeenCalledWith('rest-9')
    expect(screen.getByText('destino /gerente/pagos')).toBeInTheDocument()
  })

  it('"Salir" cierra la sesión', () => {
    abrir()

    const salir = screen.getByRole('button', { name: /Salir/ })
    fireEvent.mouseEnter(salir)
    fireEvent.mouseLeave(salir)
    fireEvent.click(salir)

    expect(logout).toHaveBeenCalledTimes(1)
  })
})
