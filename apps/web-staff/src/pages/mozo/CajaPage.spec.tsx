import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { perfilDeJefeSalon, reiniciarSesionDePrueba } from '../../test/authClient'
import { montarContexto, reiniciarContexto } from '../../test/contexto'
import { CajaPage } from './CajaPage'

vi.mock('@menyu/auth-client', async () => (await import('../../test/authClient')).moduloSimulado())
vi.mock('@menyu/ui', () => ({ LogoMenYuOscuro: () => <span>MenYU</span> }))

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/mozo/caja']}>
      <Routes>
        <Route path="/mozo/caja" element={<CajaPage />} />
        <Route path="/mozo" element={<p>panel del mozo</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  reiniciarSesionDePrueba()
  reiniciarContexto()
  montarContexto(perfilDeJefeSalon())
})

describe('CajaPage', () => {
  it('muestra el encabezado de la caja con quién está y vuelve al panel', () => {
    abrir()

    expect(screen.getByText('Caja')).toBeInTheDocument()
    expect(screen.getByText('PANEL › CAJA')).toBeInTheDocument()
    expect(screen.getByText('Jefe de Salón de Prueba')).toBeInTheDocument()
    expect(screen.getByText('Jefe de salón')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button')[0])

    expect(screen.getByText('panel del mozo')).toBeInTheDocument()
  })
})
