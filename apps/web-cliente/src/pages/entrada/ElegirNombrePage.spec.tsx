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

const campo = () => screen.getByRole('textbox', { name: 'Tu nombre' })
const continuar = () => screen.getByRole('button', { name: /Continuar|Ingresando/ })

beforeEach(() => {
  sessionStorage.clear()
  crearComensal.mockReset().mockResolvedValue({ id: 'c-1', nombre: 'Ana' } as never)
  useSessionStore.setState({ sesionId: 'ses-1', jwt: 'jwt-mesa', esAnfitrion: false })
  useComensalStore.setState({ comensalId: null, nombre: null, error: null })
})

describe('ElegirNombrePage', () => {
  it('"Continuar" está siempre activo: con el campo vacío no registra nada y dice qué falta', () => {
    abrir()
    expect(continuar()).toBeEnabled()
    expect(continuar()).not.toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(continuar())

    expect(screen.getByRole('alert')).toHaveTextContent('Escribí tu nombre para continuar.')
    expect(crearComensal).not.toHaveBeenCalled()
  })

  it('con solo espacios cuenta como vacío', () => {
    abrir()
    fireEvent.change(campo(), { target: { value: '   ' } })

    fireEvent.click(continuar())

    expect(screen.getByRole('alert')).toHaveTextContent('Escribí tu nombre para continuar.')
    expect(crearComensal).not.toHaveBeenCalled()
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

  describe('el campo y los errores (accesibilidad)', () => {
    it('"Tu nombre" es la etiqueta del campo (ya no se anuncia por el texto de ejemplo)', () => {
      abrir()

      expect(campo()).toHaveAccessibleName('Tu nombre')
      expect(campo()).toHaveAttribute('placeholder', 'Ej: Juan')
      expect(screen.getByText('Tu nombre')).toHaveAttribute('for', campo().id)
    })

    it('no toma el foco al entrar: el foco queda para el título', () => {
      abrir()

      expect(campo()).not.toHaveFocus()
    })

    it('con el campo vacío, "Continuar" deja el campo inválido, asociado al error, y le devuelve el foco', () => {
      abrir()
      continuar().focus()

      fireEvent.click(continuar())

      expect(campo()).toHaveAttribute('aria-invalid', 'true')
      expect(campo()).toHaveAccessibleDescription('Escribí tu nombre para continuar.')
      expect(campo()).toHaveFocus()
    })

    it('al escribir, el error se va y el campo deja de estar inválido', () => {
      abrir()
      fireEvent.click(continuar())

      fireEvent.change(campo(), { target: { value: 'A' } })

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(campo()).not.toHaveAttribute('aria-invalid')
      expect(campo()).not.toHaveAttribute('aria-describedby')
    })

    it('un error del servidor se anuncia como alerta, no marca el campo como inválido y queda asociado a él', async () => {
      crearComensal.mockRejectedValue(new Error('Nombre repetido en la mesa'))
      abrir()
      fireEvent.change(campo(), { target: { value: 'Ana' } })

      fireEvent.click(continuar())

      expect(await screen.findByRole('alert')).toHaveTextContent('Nombre repetido en la mesa')
      expect(campo()).not.toHaveAttribute('aria-invalid')
      expect(campo()).toHaveAccessibleDescription('Nombre repetido en la mesa')
    })

    it('mientras se envía el botón dice "Ingresando...", queda aria-disabled (no disabled, para no perder el foco) y no envía dos veces', async () => {
      crearComensal.mockReturnValue(new Promise(() => {}))
      abrir()
      fireEvent.change(campo(), { target: { value: 'Ana' } })
      continuar().focus()

      fireEvent.click(continuar())

      const boton = await screen.findByRole('button', { name: 'Ingresando...' })
      expect(boton).toHaveAttribute('aria-disabled', 'true')
      expect(boton).not.toBeDisabled()
      expect(boton).toHaveFocus()
      fireEvent.click(boton)
      expect(crearComensal).toHaveBeenCalledTimes(1)
    })

    it('con el error de "falta el nombre" no tiene violaciones de accesibilidad (axe)', async () => {
      const { container } = abrir()
      fireEvent.click(continuar())

      expect(await axe(container)).toHaveNoViolations()
    })
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
