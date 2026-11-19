import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { api } from '../../services/api'
import { useAnunciadorStore } from '../../utils/anunciador'
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

const cantidad = () => screen.getByRole('button', { name: /editar cantidad/ }).textContent
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
    expect(screen.getByRole('button', { name: 'Restar comensal' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('si la cuenta no se divide justo, el monto por persona lleva los centavos con coma (6000 entre 7)', async () => {
    await abrir()
    await screen.findByText('Cantidad de comensales')

    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: 'Sumar comensal' }))

    expect(cantidad()).toBe('7')
    expect(porPersona()).toBe('$\u00a0857,14')
  })

  it('sumar y restar recalculan el monto por persona', async () => {
    await abrir()
    await screen.findByText('Cantidad de comensales')

    fireEvent.click(screen.getByRole('button', { name: 'Sumar comensal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sumar comensal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sumar comensal' }))
    expect(cantidad()).toBe('4')
    expect(porPersona()).toBe('$\u00a01.500')

    fireEvent.click(screen.getByRole('button', { name: 'Restar comensal' }))
    expect(cantidad()).toBe('3')
    expect(porPersona()).toBe('$\u00a02.000')
  })

  it('tocar el número deja escribirlo; Enter o salir del campo lo confirma, dentro de 1 a 99', async () => {
    await abrir()
    await screen.findByText('Cantidad de comensales')

    fireEvent.click(screen.getByRole('button', { name: /editar cantidad/ }))
    const campo = screen.getByRole('spinbutton')
    expect(campo).toHaveFocus()
    expect(campo).toHaveValue(1)
    fireEvent.change(campo, { target: { value: '150' } })
    fireEvent.keyDown(campo, { key: 'a' })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(cantidad()).toBe('99')
    expect(screen.getByRole('button', { name: 'Sumar comensal' })).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(screen.getByRole('button', { name: /editar cantidad/ }))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '-3' } })
    fireEvent.blur(screen.getByRole('spinbutton'))
    expect(cantidad()).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: /editar cantidad/ }))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } })
    fireEvent.blur(screen.getByRole('spinbutton'))
    expect(cantidad()).toBe('1')
  })

  it('"Continuar" lleva al mensaje con la cantidad', async () => {
    await abrir()
    await screen.findByText('Cantidad de comensales')

    fireEvent.click(screen.getByRole('button', { name: 'Sumar comensal' }))
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

  describe('cantidad y monto por persona (accesibilidad)', () => {
    const mensaje = () => useAnunciadorStore.getState().mensaje
    const sumar = () => fireEvent.click(screen.getByRole('button', { name: 'Sumar comensal' }))
    const restar = () => fireEvent.click(screen.getByRole('button', { name: 'Restar comensal' }))
    const abrirListo = async () => {
      useAnunciadorStore.setState({ mensaje: '', numero: 0 })
      await abrir()
      await screen.findByText('Cantidad de comensales')
    }

    it('el botón con el número dice cuántos son y qué hace (el nombre empieza con lo que se ve), y en singular con uno', async () => {
      await abrirListo()

      expect(screen.getByRole('button', { name: '1 comensal, editar cantidad' })).toHaveTextContent('1')
      sumar()
      expect(screen.getByRole('button', { name: '2 comensales, editar cantidad' })).toHaveTextContent('2')
    })

    it('sumar y restar dicen cuántos son y cuánto paga cada uno, porque el monto cambia solo', async () => {
      await abrirListo()

      sumar()
      expect(mensaje()).toBe('2 comensales: cada persona paga $\u00a03.000')
      sumar()
      expect(mensaje()).toBe('3 comensales: cada persona paga $\u00a02.000')
      restar()
      restar()
      expect(mensaje()).toBe('1 comensal: cada persona paga $\u00a06.000')
    })

    it('el monto con centavos se anuncia con coma', async () => {
      await abrirListo()

      for (let i = 0; i < 6; i++) sumar()

      expect(mensaje()).toBe('7 comensales: cada persona paga $\u00a0857,14')
    })

    it('en el mínimo y el máximo los botones no se deshabilitan: conservan el foco, no cambian nada y no anuncian', async () => {
      await abrirListo()
      const menos = screen.getByRole('button', { name: 'Restar comensal' })
      menos.focus()

      fireEvent.click(menos)

      expect(menos).not.toBeDisabled()
      expect(menos).toHaveFocus()
      expect(menos).toHaveAttribute('aria-disabled', 'true')
      expect(mensaje()).toBe('')
      expect(screen.getByRole('button', { name: /editar cantidad/ })).toHaveTextContent('1')
    })

    it('escribir la cantidad también anuncia (y si pasa de 99, anuncia 99), y Enter devuelve el foco al botón con el número', async () => {
      await abrirListo()

      fireEvent.click(screen.getByRole('button', { name: /editar cantidad/ }))
      const campo = screen.getByRole('spinbutton', { name: 'Cantidad de comensales' })
      fireEvent.change(campo, { target: { value: '150' } })
      fireEvent.keyDown(campo, { key: 'Enter' })

      expect(mensaje()).toBe('99 comensales: cada persona paga $\u00a060,61')
      expect(screen.getByRole('button', { name: '99 comensales, editar cantidad' })).toHaveFocus()
    })

    it('el Enter que confirma se cancela: si no, el navegador se lo manda también al botón que recibe el foco y vuelve a abrir el campo', async () => {
      await abrirListo()
      fireEvent.click(screen.getByRole('button', { name: /editar cantidad/ }))
      const campo = screen.getByRole('spinbutton')

      const seguiaSinCancelar = fireEvent.keyDown(campo, { key: 'Enter' })

      expect(seguiaSinCancelar).toBe(false)
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    })

    it('otras teclas en el campo no se cancelan (se puede escribir)', async () => {
      await abrirListo()
      fireEvent.click(screen.getByRole('button', { name: /editar cantidad/ }))

      expect(fireEvent.keyDown(screen.getByRole('spinbutton'), { key: '5' })).toBe(true)
      expect(screen.getByRole('spinbutton')).toBeInTheDocument()
    })

    it('escribir la misma cantidad no anuncia, y salir del campo sin Enter no le roba el foco a quien se fue a otro lado', async () => {
      await abrirListo()
      fireEvent.click(screen.getByRole('button', { name: /editar cantidad/ }))
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } })

      const continuar = screen.getByRole('button', { name: 'Continuar' })
      continuar.focus()
      fireEvent.blur(screen.getByRole('spinbutton'))

      expect(mensaje()).toBe('')
      expect(continuar).toHaveFocus()
    })

    it('si el total no llegó no hay monto que decir: cambia la cantidad sin anunciar', async () => {
      saldo.mockResolvedValue({ totalSesion: null, saldoPendiente: 0 } as never)
      await abrirListo()

      sumar()

      expect(mensaje()).toBe('')
      expect(screen.getByRole('button', { name: '2 comensales, editar cantidad' })).toBeInTheDocument()
    })

    it('con el campo para escribir abierto no tiene violaciones de accesibilidad (axe)', async () => {
      await abrirListo()
      fireEvent.click(screen.getByRole('button', { name: /editar cantidad/ }))

      expect(await axe(document.body)).toHaveNoViolations()
    })
  })

  describe('estructura de la pantalla (accesibilidad)', () => {
    it('el título es el <h1> y el selector de cantidad va dentro del <main>', async () => {
      await abrir()

      const titulo = screen.getByRole('heading', { level: 1, name: '¿Cuántos son?' })
      await screen.findByText('Cantidad de comensales')
      const principal = screen.getByRole('main')
      expect(principal).not.toContainElement(titulo)
      expect(principal).toContainElement(screen.getByRole('button', { name: 'Sumar comensal' }))
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
