import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../services/api'
import { useComensalStore } from '../../store/comensalStore'
import { useSessionStore } from '../../store/sessionStore'
import { axe } from '../../test/axe'
import { ElegirNombrePage } from './ElegirNombrePage'

vi.mock('../../services/api', () => ({
  api: { comensales: { crear: vi.fn() } },
}))

const crearComensal = vi.mocked(api.comensales.crear)

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/elegir-nombre']}>
      <Routes>
        <Route path="/elegir-nombre" element={<ElegirNombrePage />} />
        <Route path="/menu" element={<p>pantalla del menú</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const campo = () => screen.getByPlaceholderText('Ej: Juan')
const continuar = () => screen.getByRole('button', { name: /Continuar|Ingresando/ })

beforeEach(() => {
  sessionStorage.clear()
  crearComensal.mockReset().mockResolvedValue({ id: 'c-1', nombre: 'Ana' } as never)
  useSessionStore.setState({ sesionId: 'ses-1', jwt: 'jwt-mesa', esAnfitrion: false })
  useComensalStore.setState({ comensalId: null, nombre: null, error: null })
})

describe('ElegirNombrePage', () => {
  it('"Continuar" está apagado hasta que se escribe un nombre', () => {
    abrir()
    expect(continuar()).toBeDisabled()

    fireEvent.change(campo(), { target: { value: 'Ana' } })

    expect(continuar()).toBeEnabled()
  })

  it('registra el nombre (sin espacios de más) y sigue al menú', async () => {
    abrir()

    fireEvent.change(campo(), { target: { value: '  Ana  ' } })
    fireEvent.click(continuar())

    expect(await screen.findByText('pantalla del menú')).toBeInTheDocument()
    expect(crearComensal).toHaveBeenCalledWith('jwt-mesa', 'ses-1', 'Ana', false)
  })

  it('si no se pudo registrar, muestra el error y deja corregir', async () => {
    crearComensal.mockRejectedValue(new Error('Nombre repetido en la mesa'))
    abrir()

    fireEvent.change(campo(), { target: { value: 'Ana' } })
    fireEvent.click(continuar())

    expect(await screen.findByText('Nombre repetido en la mesa')).toBeInTheDocument()
    expect(screen.queryByText('pantalla del menú')).not.toBeInTheDocument()

    fireEvent.change(campo(), { target: { value: 'Ana M' } })
    expect(screen.queryByText('Nombre repetido en la mesa')).not.toBeInTheDocument()
  })

  it('sin sesión de mesa no registra nada', async () => {
    useSessionStore.setState({ sesionId: null })
    abrir()

    fireEvent.change(campo(), { target: { value: 'Ana' } })
    fireEvent.submit(campo().closest('form')!)

    await waitFor(() => expect(crearComensal).not.toHaveBeenCalled())
  })

  describe('estructura de la pantalla (accesibilidad)', () => {
    it('"¿Cómo te llamás?" es el <h1> y el formulario va dentro del <main>, fuera del encabezado', () => {
      abrir()

      const titulo = screen.getByRole('heading', { level: 1, name: '¿Cómo te llamás?' })
      const principal = screen.getByRole('main')
      expect(principal).toContainElement(titulo)
      expect(principal).toContainElement(campo())
      expect(principal).not.toContainElement(screen.getByRole('banner'))
    })

    it('no tiene violaciones de accesibilidad (axe)', async () => {
      const { container } = abrir()

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
