import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { api } from '../../services/api'
import { CantidadComensalesPage } from './CantidadComensalesPage'
import { axe } from '../../test/axe'

let sesion: { jwt: string | null; sesionId: string | null }

vi.mock('../../store/sessionStore', () => ({
  useSessionStore: (selector: (s: typeof sesion) => unknown) => selector(sesion),
}))
vi.mock('../../services/api', () => ({ api: { sesiones: { saldo: vi.fn() } } }))

const saldo = vi.mocked(api.sesiones.saldo)

function Destino() {
  const { pathname, search } = useLocation()
  return <p>destino {pathname}{search}</p>
}

async function abrir() {
  render(
    <MemoryRouter initialEntries={['/dividir/cantidad']}>
      <Routes>
        <Route path="/dividir/cantidad" element={<CantidadComensalesPage />} />
        <Route path="*" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  )
}

const cantidad = () => screen.getByRole('button', { name: 'Editar cantidad' }).textContent
const porPersona = () => screen.getByText('Cada persona paga').nextElementSibling?.textContent

beforeEach(() => {
  vi.clearAllMocks()
  sesion = { jwt: 'jwt-mesa', sesionId: 'ses-1' }
  saldo.mockResolvedValue({ totalSesion: 6000, saldoPendiente: 6000 } as never)
})

describe('CantidadComensalesPage', () => {
  it('sin sesión dice que no hay sesión activa y no consulta', async () => {
    sesion = { jwt: null, sesionId: 'ses-1' }

    await abrir()

    expect(await screen.findByText('No hay sesión activa')).toBeInTheDocument()
    expect(saldo).not.toHaveBeenCalled()
  })

  it('arranca en 1 con el total entero por persona', async () => {
    await abrir()

    expect(await screen.findByText('Cantidad de comensales')).toBeInTheDocument()
    expect(saldo).toHaveBeenCalledWith('jwt-mesa', 'ses-1')
    expect(cantidad()).toBe('1')
    expect(porPersona()).toBe('$\u00a06.000')
    expect(screen.getByRole('button', { name: 'Restar' })).toBeDisabled()
  })

  it('si la cuenta no se divide justo, el monto por persona lleva los centavos con coma (6000 entre 7)', async () => {
    await abrir()
    await screen.findByText('Cantidad de comensales')

    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: 'Sumar' }))

    expect(cantidad()).toBe('7')
    expect(porPersona()).toBe('$\u00a0857,14')
  })

  it('sumar y restar recalculan el monto por persona', async () => {
    await abrir()
    await screen.findByText('Cantidad de comensales')

    fireEvent.click(screen.getByRole('button', { name: 'Sumar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sumar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sumar' }))
    expect(cantidad()).toBe('4')
    expect(porPersona()).toBe('$\u00a01.500')

    fireEvent.click(screen.getByRole('button', { name: 'Restar' }))
    expect(cantidad()).toBe('3')
    expect(porPersona()).toBe('$\u00a02.000')
  })

  it('tocar el número deja escribirlo; Enter o salir del campo lo confirma, dentro de 1 a 99', async () => {
    await abrir()
    await screen.findByText('Cantidad de comensales')

    fireEvent.click(screen.getByRole('button', { name: 'Editar cantidad' }))
    const campo = screen.getByRole('spinbutton')
    expect(campo).toHaveFocus()
    expect(campo).toHaveValue(1)
    fireEvent.change(campo, { target: { value: '150' } })
    fireEvent.keyDown(campo, { key: 'a' })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(cantidad()).toBe('99')
    expect(screen.getByRole('button', { name: 'Sumar' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Editar cantidad' }))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '-3' } })
    fireEvent.blur(screen.getByRole('spinbutton'))
    expect(cantidad()).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: 'Editar cantidad' }))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } })
    fireEvent.blur(screen.getByRole('spinbutton'))
    expect(cantidad()).toBe('1')
  })

  it('"Continuar" lleva al mensaje con la cantidad', async () => {
    await abrir()
    await screen.findByText('Cantidad de comensales')

    fireEvent.click(screen.getByRole('button', { name: 'Sumar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByText('destino /dividir/mensaje?cantidad=2')).toBeInTheDocument()
  })

  it('"Volver" vuelve a pagar', async () => {
    await abrir()

    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))

    expect(screen.getByText('destino /pagar')).toBeInTheDocument()
  })

  it('si la carga falla muestra el error; "Reintentar" vuelve a pedir', async () => {
    saldo.mockRejectedValueOnce(new Error('Sin conexión')).mockRejectedValueOnce('raro')

    await abrir()
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Error al cargar los datos de la sesión')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Cantidad de comensales')).toBeInTheDocument()
  })

  describe('estructura de la pantalla (accesibilidad)', () => {
    it('el título es el <h1> y el selector de cantidad va dentro del <main>', async () => {
      await abrir()

      const titulo = screen.getByRole('heading', { level: 1, name: '¿Cuántos son?' })
      await screen.findByText('Cantidad de comensales')
      const principal = screen.getByRole('main')
      expect(principal).not.toContainElement(titulo)
      expect(principal).toContainElement(screen.getByRole('button', { name: 'Sumar' }))
    })

    it('no tiene violaciones de accesibilidad (axe)', async () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/dividir/cantidad']}>
          <Routes>
            <Route path="/dividir/cantidad" element={<CantidadComensalesPage />} />
          </Routes>
        </MemoryRouter>,
      )
      await screen.findByText('Cantidad de comensales')

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
