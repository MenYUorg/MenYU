import { fireEvent, render, screen } from '@testing-library/react'
import { api, ApiError, type SesionActivaItem } from '../services/api'
import { CobroModal } from './CobroModal'

vi.mock('../services/api', async () => {
  class ApiErrorFalso extends Error {
    constructor(message: string, public readonly status: number) {
      super(message)
      this.name = 'ApiError'
    }
  }
  return { api: { sesiones: { registrarCobro: vi.fn() } }, ApiError: ApiErrorFalso }
})

const registrarCobro = vi.mocked(api.sesiones.registrarCobro)

const SESION: SesionActivaItem = {
  id: 'sesion-1',
  mesaId: 'mesa-1',
  mesaNumero: '4',
  tiempoTranscurrido: 45,
  cantidadItems: 3,
  cantidadPersonas: 2,
  totalAcumulado: 12500,
  quierePagar: true,
}

const onClose = vi.fn()
const onDone = vi.fn()

function abrir() {
  return render(<CobroModal sesion={SESION} onClose={onClose} onDone={onDone} />)
}

const confirmar = () => screen.getByRole('button', { name: /Confirmar pago/ })

beforeEach(() => {
  vi.clearAllMocks()
  registrarCobro.mockResolvedValue({ ok: true })
})

describe('CobroModal', () => {
  it('muestra la mesa y el total', () => {
    abrir()

    expect(screen.getByText('Registrar pago · Mesa 4')).toBeInTheDocument()
    expect(screen.getByText('$12.500')).toBeInTheDocument()
  })

  it('sin método de pago no se puede confirmar', () => {
    abrir()

    expect(confirmar()).toBeDisabled()
  })

  it.each([
    ['Efectivo', 'efectivo'],
    ['Débito', 'debito'],
    ['Crédito', 'credito'],
    ['Transferencia', 'transferencia'],
  ])('%s manda solo el método: quién cobra lo deduce el backend', async (etiqueta, metodoPago) => {
    abrir()

    fireEvent.click(screen.getByRole('button', { name: etiqueta }))
    fireEvent.click(confirmar())

    expect(registrarCobro).toHaveBeenCalledWith('sesion-1', { metodoPago })
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith('4'))
  })

  it('no pregunta quién cobra: no hay cobrador para elegir', () => {
    abrir()

    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))

    expect(screen.queryByText('Cobrado por')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gerente (yo)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  describe('Mercado Pago', () => {
    it('tampoco manda un nombre: el método ya dice que fue por Mercado Pago', () => {
      abrir()

      fireEvent.click(screen.getByRole('button', { name: 'Mercado Pago' }))
      fireEvent.click(confirmar())

      expect(registrarCobro).toHaveBeenCalledWith('sesion-1', { metodoPago: 'mercadopago' })
    })

    it('manda la referencia externa que se escribe', () => {
      abrir()
      fireEvent.click(screen.getByRole('button', { name: 'Mercado Pago' }))

      fireEvent.change(screen.getByPlaceholderText('Ej. 12345678901'), { target: { value: '  112233  ' } })
      fireEvent.click(confirmar())

      expect(registrarCobro).toHaveBeenCalledWith('sesion-1', {
        metodoPago: 'mercadopago',
        referenciaExterna: '112233',
      })
    })

    it('una referencia en blanco no se manda', () => {
      abrir()
      fireEvent.click(screen.getByRole('button', { name: 'Mercado Pago' }))

      fireEvent.change(screen.getByPlaceholderText('Ej. 12345678901'), { target: { value: '  ' } })
      fireEvent.click(confirmar())

      expect(registrarCobro).toHaveBeenCalledWith('sesion-1', { metodoPago: 'mercadopago' })
    })

    it('el campo de referencia es solo de Mercado Pago', () => {
      abrir()

      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))

      expect(screen.queryByPlaceholderText('Ej. 12345678901')).not.toBeInTheDocument()
    })
  })

  describe('pagos pendientes de la mesa (409)', () => {
    it('avisa y, al confirmar, repite el cobro cancelándolos', async () => {
      registrarCobro
        .mockRejectedValueOnce(new ApiError('La mesa tiene un pago pendiente', 409))
        .mockResolvedValueOnce({ ok: true })
      abrir()

      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
      fireEvent.click(confirmar())

      expect(await screen.findByText('La mesa tiene un pago pendiente')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /Confirmar y cobrar mesa completa/ }))

      await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith('4'))
      expect(registrarCobro).toHaveBeenLastCalledWith('sesion-1', {
        metodoPago: 'efectivo',
        confirmarCancelacionPagosPendientes: true,
      })
    })

    it('se puede cancelar la advertencia y volver atrás', async () => {
      registrarCobro.mockRejectedValue(new ApiError('La mesa tiene un pago pendiente', 409))
      abrir()

      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
      fireEvent.click(confirmar())

      expect(await screen.findByText('La mesa tiene un pago pendiente')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(screen.queryByText('La mesa tiene un pago pendiente')).not.toBeInTheDocument()
      expect(onDone).not.toHaveBeenCalled()
    })
  })

  it('un error del servidor se muestra y deja reintentar', async () => {
    registrarCobro.mockRejectedValue(new Error('No se pudo registrar'))
    abrir()

    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
    fireEvent.click(confirmar())

    expect(await screen.findByText('No se pudo registrar')).toBeInTheDocument()
    expect(confirmar()).toBeEnabled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('"Cancelar" cierra el modal', () => {
    abrir()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
