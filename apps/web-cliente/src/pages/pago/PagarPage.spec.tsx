import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { api } from '../../services/api'
import { PagarPage } from './PagarPage'
import { axe } from '../../test/axe'
import { useAnunciadorStore } from '../../utils/anunciador'

let sesion: { jwt: string | null; sesionId: string | null; numeroMesa: string | null }

vi.mock('../../store/sessionStore', () => ({
  useSessionStore: (selector: (s: typeof sesion) => unknown) => selector(sesion),
}))
vi.mock('../../services/api', () => ({
  api: {
    sesiones: { saldo: vi.fn() },
    orders: { list: vi.fn() },
    payments: { solicitarEfectivo: vi.fn(), pagarConMercadoPago: vi.fn() },
  },
}))

const saldo = vi.mocked(api.sesiones.saldo)
const listar = vi.mocked(api.orders.list)
const efectivo = vi.mocked(api.payments.solicitarEfectivo)
const mercadoPago = vi.mocked(api.payments.pagarConMercadoPago)

const PEDIDOS = [
  { id: 'p1', items: [{ id: 'i1', cantidad: 2, precioUnitario: '1500.00', item: { nombre: 'Milanesa' } }, { id: 'i2', cantidad: 1, precioUnitario: 500, item: { nombre: 'Agua' } }] },
  { id: 'p2', items: [{ id: 'i3', cantidad: 1, precioUnitario: 1500, item: { nombre: 'Milanesa' } }] },
]

function Destino() {
  const { pathname, search } = useLocation()
  return <p>destino {pathname}{search}</p>
}

async function abrir() {
  render(
    <MemoryRouter initialEntries={['/pagar']}>
      <Routes>
        <Route path="/pagar" element={<PagarPage />} />
        <Route path="*" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** La fila de un ítem en la tabla de la cuenta: nombre, cantidad, precio unitario y total. */
const fila = (nombre: string) => Array.from(screen.getByText(nombre).parentElement!.children).map((c) => c.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  sesion = { jwt: 'jwt-mesa', sesionId: 'ses-1', numeroMesa: '4' }
  saldo.mockResolvedValue({ saldoPendiente: 3000 } as never)
  listar.mockResolvedValue(PEDIDOS as never)
})

describe('PagarPage', () => {
  it('sin sesión de mesa dice que no hay sesión y no consulta', async () => {
    sesion = { jwt: null, sesionId: null, numeroMesa: null }

    await abrir()

    expect(await screen.findByText('No hay sesión activa')).toBeInTheDocument()
    expect(listar).not.toHaveBeenCalled()
    expect(saldo).not.toHaveBeenCalled()
  })

  it('muestra la cuenta agrupada por plato, el subtotal y el saldo pendiente', async () => {
    await abrir()

    expect(await screen.findByText('Cuenta de la mesa')).toBeInTheDocument()
    expect(screen.getByText('Mesa 4')).toBeInTheDocument()
    expect(listar).toHaveBeenCalledWith('jwt-mesa')
    expect(saldo).toHaveBeenCalledWith('jwt-mesa', 'ses-1')
    expect(fila('Milanesa')).toEqual(['Milanesa', '3', '$\u00a01.500', '$\u00a04.500'])
    expect(fila('Agua')).toEqual(['Agua', '1', '$\u00a0500', '$\u00a0500'])
    expect(screen.getByText('$ 5.000')).toBeInTheDocument() // subtotal
    expect(await screen.findByText('$ 3.000')).toBeInTheDocument() // saldo pendiente (ya se pagó una parte)
  })

  it('si el saldo no llega muestra un guion y deja pagar igual', async () => {
    saldo.mockRejectedValue(new Error('caído'))

    await abrir()

    expect(await screen.findByText('—')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pagar toda la cuenta en efectivo' })).toBeEnabled()
  })

  it('sin pedidos invita a ver el menú; "volver" también lleva al menú', async () => {
    listar.mockResolvedValue([] as never)

    await abrir()

    expect(await screen.findByText('No hay pedidos en esta sesión')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver menú' }))
    expect(screen.getByText('destino /menu')).toBeInTheDocument()
  })

  it('si la carga falla muestra el error y "Reintentar" vuelve a pedir', async () => {
    listar.mockRejectedValueOnce(new Error('Sin conexión')).mockRejectedValueOnce('raro').mockResolvedValueOnce(PEDIDOS as never)

    await abrir()
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Error al cargar la cuenta')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Cuenta de la mesa')).toBeInTheDocument()
  })

  it('con la cuenta saldada no ofrece pagar', async () => {
    saldo.mockResolvedValue({ saldoPendiente: 0 } as never)

    await abrir()

    expect(await screen.findByText('Esta cuenta ya está saldada.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Pagar toda la cuenta/ })).not.toBeInTheDocument()
  })

  describe('pagar toda la cuenta', () => {
    it('en efectivo avisa que el mozo va a cobrar', async () => {
      let terminar: () => void = () => {}
      efectivo.mockReturnValue(new Promise<void>((r) => { terminar = r }) as never)
      await abrir()
      await screen.findByText('Cuenta de la mesa')

      fireEvent.click(screen.getByRole('button', { name: 'Pagar toda la cuenta en efectivo' }))
      expect(screen.getByRole('button', { name: 'Pagar toda la cuenta con Mercado Pago' })).toBeDisabled()
      await act(async () => { terminar() })

      expect(efectivo).toHaveBeenCalledWith('jwt-mesa', 'ses-1')
      expect(screen.getByText('El mozo se va a acercar a la mesa a cobrar el total.')).toBeInTheDocument()
    })

    it('si el efectivo falla muestra el mensaje del servidor (o el genérico)', async () => {
      efectivo.mockRejectedValueOnce(new Error('Esta sesión ya está completamente pagada')).mockRejectedValueOnce('raro')
      await abrir()
      await screen.findByText('Cuenta de la mesa')

      fireEvent.click(screen.getByRole('button', { name: 'Pagar toda la cuenta en efectivo' }))
      expect(await screen.findByText('Esta sesión ya está completamente pagada')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Pagar toda la cuenta en efectivo' }))
      expect(await screen.findByText('Error al registrar el pago en efectivo')).toBeInTheDocument()
    })

    it('con Mercado Pago va al checkout', async () => {
      const ubicacion = { href: 'http://localhost/pagar' }
      vi.stubGlobal('location', ubicacion)
      mercadoPago.mockResolvedValue({ initPoint: 'https://mp.test/checkout' } as never)
      await abrir()
      await screen.findByText('Cuenta de la mesa')

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pagar toda la cuenta con Mercado Pago' })) })

      expect(mercadoPago).toHaveBeenCalledWith('jwt-mesa', 'ses-1')
      expect(ubicacion.href).toBe('https://mp.test/checkout')
      vi.unstubAllGlobals()
    })

    it('si Mercado Pago falla muestra el error y deja reintentar', async () => {
      mercadoPago.mockRejectedValueOnce(new Error('El restaurante no tiene Mercado Pago')).mockRejectedValueOnce('raro')
      await abrir()
      await screen.findByText('Cuenta de la mesa')

      fireEvent.click(screen.getByRole('button', { name: 'Pagar toda la cuenta con Mercado Pago' }))
      expect(await screen.findByText('El restaurante no tiene Mercado Pago')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Pagar toda la cuenta con Mercado Pago' }))
      expect(await screen.findByText('Error al iniciar el pago con Mercado Pago')).toBeInTheDocument()
    })
  })

  describe('armar el mensaje para dividir', () => {
    it.each([
      ['Partes iguales', 'destino /dividir/cantidad'],
      ['Por consumo', 'destino /etiquetar?destino=mensaje'],
    ])('"%s" lleva a su pantalla', async (opcion, destino) => {
      await abrir()
      await screen.findByText('Cuenta de la mesa')

      fireEvent.click(screen.getByRole('button', { name: 'Armar mensaje' }))
      expect(screen.getByText('Generador de mensaje')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: opcion }))

      expect(screen.getByText(destino)).toBeInTheDocument()
    })

    it('se cierra con "Cancelar" o tocando afuera', async () => {
      await abrir()
      await screen.findByText('Cuenta de la mesa')

      fireEvent.click(screen.getByRole('button', { name: 'Armar mensaje' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByText('Generador de mensaje')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Armar mensaje' }))
      fireEvent.click(screen.getByText('Generador de mensaje'))
      expect(screen.getByText('Generador de mensaje')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Generador de mensaje').closest('div[style*="position: fixed"]') as HTMLElement)
      expect(screen.queryByText('Generador de mensaje')).not.toBeInTheDocument()
    })
  })

  it('el botón de volver lleva al menú', async () => {
    await abrir()
    await screen.findByText('Cuenta de la mesa')

    fireEvent.click(screen.getByRole('button', { name: 'Volver al menú' }))

    expect(screen.getByText('destino /menu')).toBeInTheDocument()
  })

  describe('la cuenta es una tabla (accesibilidad)', () => {
    it('tiene el nombre "Cuenta de la mesa" y encabezados de columna que el lector dice enteros', async () => {
      await abrir()

      const tabla = await screen.findByRole('table', { name: 'Cuenta de la mesa' })

      const encabezados = within(tabla).getAllByRole('columnheader')
      expect(encabezados.map((e) => e.textContent)).toEqual(['ÍTEMÍtem', 'CANT.Cantidad', 'P. UNIT.Precio unitario', 'TOTALTotal'])
      expect(encabezados.map((e) => e.querySelector('[aria-hidden="true"]')?.textContent)).toEqual(['ÍTEM', 'CANT.', 'P. UNIT.', 'TOTAL'])
      expect(encabezados.map((e) => e.querySelector('.sr-only')?.textContent)).toEqual(['Ítem', 'Cantidad', 'Precio unitario', 'Total'])
    })

    it('cada plato es una fila: el nombre es el encabezado de la fila y después van cantidad, precio unitario y total', async () => {
      await abrir()
      const tabla = await screen.findByRole('table', { name: 'Cuenta de la mesa' })

      const filas = within(tabla).getAllByRole('row')

      // Encabezados, Milanesa, Agua y el subtotal.
      expect(filas).toHaveLength(4)
      const milanesa = filas[1]
      expect(within(milanesa).getByRole('rowheader')).toHaveTextContent('Milanesa')
      expect(within(milanesa).getAllByRole('cell').map((c) => c.textContent)).toEqual(['3', '$\u00a01.500', '$\u00a04.500'])
    })

    it('el subtotal es la última fila de la tabla', async () => {
      await abrir()
      const tabla = await screen.findByRole('table', { name: 'Cuenta de la mesa' })

      const filas = within(tabla).getAllByRole('row')
      const ultima = filas[filas.length - 1]

      expect(within(ultima).getByRole('rowheader')).toHaveTextContent('Subtotal')
      expect(within(ultima).getByRole('cell')).toHaveTextContent('$ 5.000')
    })

    it('"Cuenta de la mesa" y "Total a pagar" son encabezados de nivel 2', async () => {
      await abrir()

      expect(await screen.findByRole('heading', { level: 2, name: 'Cuenta de la mesa' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2, name: 'Total a pagar' })).toBeInTheDocument()
    })
  })

  describe('el generador de mensaje es un diálogo (accesibilidad)', () => {
    const abrirElDialogo = async () => {
      await abrir()
      await screen.findByRole('table', { name: 'Cuenta de la mesa' })
      const armar = screen.getByRole('button', { name: 'Armar mensaje' })
      armar.focus()
      fireEvent.click(armar)
      return armar
    }
    const inerte = (elemento: HTMLElement) => elemento.closest('[inert]') !== null

    it('es un diálogo modal con nombre y el foco entra a él', async () => {
      await abrirElDialogo()

      const dialogo = screen.getByRole('dialog', { name: 'Generador de mensaje' })
      expect(dialogo).toHaveAttribute('aria-modal', 'true')
      expect(dialogo).toHaveFocus()
      expect(screen.getByRole('heading', { level: 2, name: 'Generador de mensaje' })).toBeInTheDocument()
    })

    it('el fondo tocable es solo para el mouse (role="presentation") y no es un control', async () => {
      await abrirElDialogo()

      const fondo = screen.getByRole('dialog').parentElement!
      expect(fondo).toHaveAttribute('role', 'presentation')
    })

    it('con el diálogo abierto, el encabezado, la cuenta y las opciones de pago quedan inertes; el diálogo no', async () => {
      await abrirElDialogo()

      expect(inerte(screen.getByRole('heading', { level: 1, name: 'Pagar la cuenta', hidden: true }))).toBe(true)
      expect(inerte(screen.getByRole('table', { name: 'Cuenta de la mesa', hidden: true }))).toBe(true)
      expect(inerte(screen.getByRole('button', { name: 'Pagar toda la cuenta en efectivo', hidden: true }))).toBe(true)
      expect(inerte(screen.getByRole('dialog'))).toBe(false)
      expect(inerte(screen.getByRole('button', { name: 'Cancelar' }))).toBe(false)
    })

    it('Esc lo cierra, devuelve el foco a "Armar mensaje" y la pantalla vuelve a estar activa', async () => {
      const armar = await abrirElDialogo()

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(armar).toHaveFocus()
      expect(inerte(screen.getByRole('table', { name: 'Cuenta de la mesa' }))).toBe(false)
      expect(inerte(screen.getByRole('heading', { level: 1, name: 'Pagar la cuenta' }))).toBe(false)
    })

    it('"Cancelar" también devuelve el foco a "Armar mensaje"', async () => {
      const armar = await abrirElDialogo()

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(armar).toHaveFocus()
    })

    it('Esc sin el diálogo abierto no hace nada', async () => {
      await abrir()
      await screen.findByRole('table', { name: 'Cuenta de la mesa' })

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('table', { name: 'Cuenta de la mesa' })).toBeInTheDocument()
    })

    it('con el diálogo abierto no tiene violaciones de accesibilidad (axe)', async () => {
      await abrirElDialogo()

      expect(await axe(document.body)).toHaveNoViolations()
    })
  })

  describe('pagar toda la cuenta: avisos (accesibilidad)', () => {
    it('un error al pagar se anuncia como alerta', async () => {
      efectivo.mockRejectedValue(new Error('Esta sesión ya está completamente pagada'))
      await abrir()
      await screen.findByRole('table', { name: 'Cuenta de la mesa' })

      fireEvent.click(screen.getByRole('button', { name: 'Pagar toda la cuenta en efectivo' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Esta sesión ya está completamente pagada')
    })

    it('al pedir el cobro en efectivo se anuncia que el mozo va a venir (los botones desaparecen y el foco se pierde) y el ✅ queda oculto', async () => {
      useAnunciadorStore.setState({ mensaje: '', numero: 0 })
      efectivo.mockResolvedValue(undefined as never)
      await abrir()
      await screen.findByRole('table', { name: 'Cuenta de la mesa' })

      fireEvent.click(screen.getByRole('button', { name: 'Pagar toda la cuenta en efectivo' }))

      expect(await screen.findByText('✅')).toHaveAttribute('aria-hidden', 'true')
      expect(useAnunciadorStore.getState().mensaje).toBe('El mozo se va a acercar a la mesa a cobrar el total.')
    })
  })

  describe('estructura de la pantalla (accesibilidad)', () => {
    it('el título es el <h1> y la cuenta y las opciones de pago van dentro del <main>', async () => {
      await abrir()

      const titulo = await screen.findByRole('heading', { level: 1, name: 'Pagar la cuenta' })
      const principal = screen.getByRole('main')
      expect(principal).not.toContainElement(titulo)
      expect(principal).toContainElement(await screen.findByText('Milanesa'))
    })

    it('no tiene violaciones de accesibilidad (axe)', async () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/pagar']}>
          <Routes>
            <Route path="/pagar" element={<PagarPage />} />
          </Routes>
        </MemoryRouter>,
      )
      await screen.findByText('Milanesa')

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
