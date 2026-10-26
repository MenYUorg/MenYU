import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { api } from '../../services/api'
import { PagarPage } from './PagarPage'

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
    expect(fila('Milanesa')).toEqual(['Milanesa', '3', '$1500.00', '$4500.00'])
    expect(fila('Agua')).toEqual(['Agua', '1', '$500.00', '$500.00'])
    expect(screen.getByText('$5000.00')).toBeInTheDocument() // subtotal
    expect(await screen.findByText('$3000.00')).toBeInTheDocument() // saldo pendiente (ya se pagó una parte)
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
})
