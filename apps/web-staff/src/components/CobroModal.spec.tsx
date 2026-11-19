import { fireEvent, render, screen } from '@testing-library/react'
import type { CajaAbierta } from '@menyu/types'
import { api, ApiError, type SesionActivaItem } from '../services/api'
import { useContextoStore } from '../store/contextoStore'
import { MENSAJE_OPERACION_SIMULTANEA } from '@menyu/ui/caja'
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
const onTurnoCambio = vi.fn()

const CAJA_1: CajaAbierta = { cajaId: 'caja-1', nombre: 'Caja 1' }
const CAJA_2: CajaAbierta = { cajaId: 'caja-2', nombre: 'Caja 2' }

function abrir(cajas: CajaAbierta[] | null = [CAJA_1]) {
  const props = (c: CajaAbierta[] | null) => (
    <CobroModal sesion={SESION} onClose={onClose} onDone={onDone} cajas={c} onTurnoCambio={onTurnoCambio} />
  )
  const vista = render(props(cajas))
  return { ...vista, conCajas: (c: CajaAbierta[] | null) => vista.rerender(props(c)) }
}

const confirmar = () => screen.getByRole('button', { name: /Confirmar pago/ })

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useContextoStore.setState({ restauranteId: 'rest-1' })
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

  describe('409 por operación simultánea', () => {
    it('es un error común y reintentable: sin la advertencia de pagos pendientes', async () => {
      registrarCobro.mockRejectedValueOnce(new ApiError('Otra operación modificó esto al mismo tiempo; probá de nuevo', 409))
      abrir()

      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
      fireEvent.click(confirmar())

      expect(await screen.findByText('Otra operación modificó esto al mismo tiempo; probá de nuevo')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Confirmar y cobrar mesa completa/ })).not.toBeInTheDocument()
      expect(confirmar()).toBeEnabled()
      expect(MENSAJE_OPERACION_SIMULTANEA).toBe('Otra operación modificó esto al mismo tiempo; probá de nuevo')
    })

    it('un segundo intento puede cobrar', async () => {
      registrarCobro
        .mockRejectedValueOnce(new ApiError('Otra operación modificó esto al mismo tiempo; probá de nuevo', 409))
        .mockResolvedValueOnce({ ok: true })
      abrir()

      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
      fireEvent.click(confirmar())
      await screen.findByText(/Otra operación modificó/)
      fireEvent.click(confirmar())

      await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith('4'))
    })
  })

  describe('el turno o la caja cambiaron (400)', () => {
    it.each([
      'No hay un turno abierto',
      'La caja no está abierta en este turno',
      'Hay más de una caja abierta: indicá en cuál se cobra',
    ])('"%s" se muestra y avisa a la pantalla', async (mensaje) => {
      registrarCobro.mockRejectedValue(new ApiError(mensaje, 400))
      abrir()

      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
      fireEvent.click(confirmar())

      expect(await screen.findByText(mensaje)).toBeInTheDocument()
      expect(onTurnoCambio).toHaveBeenCalledTimes(1)
      expect(onDone).not.toHaveBeenCalled()
    })

    it('otro 400 se muestra pero no avisa del turno', async () => {
      registrarCobro.mockRejectedValue(new ApiError('Método inválido', 400))
      abrir()

      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
      fireEvent.click(confirmar())

      expect(await screen.findByText('Método inválido')).toBeInTheDocument()
      expect(onTurnoCambio).not.toHaveBeenCalled()
    })
  })

  describe('propina', () => {
    const campo = () => screen.getByLabelText('Propina (opcional)')

    it('es un campo decimal con su label', () => {
      abrir()

      expect(campo()).toHaveAttribute('inputmode', 'decimal')
    })

    it('una propina válida va en el body, con coma decimal', () => {
      abrir()
      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))

      fireEvent.change(campo(), { target: { value: '150,5' } })
      fireEvent.click(confirmar())

      expect(registrarCobro).toHaveBeenCalledWith('sesion-1', { metodoPago: 'efectivo', propina: 150.5 })
    })

    it('vacía o en 0 no se manda', () => {
      abrir()
      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))

      fireEvent.change(campo(), { target: { value: '0' } })
      fireEvent.click(confirmar())

      expect(registrarCobro).toHaveBeenCalledWith('sesion-1', { metodoPago: 'efectivo' })
    })

    it('inválida: muestra el error asociado al campo y no deja confirmar', () => {
      abrir()
      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))

      fireEvent.change(campo(), { target: { value: '-5' } })

      const error = screen.getByRole('alert')
      expect(error).toHaveTextContent('La propina no puede ser negativa')
      expect(campo()).toHaveAttribute('aria-describedby', error.id)
      expect(confirmar()).toBeDisabled()

      fireEvent.change(campo(), { target: { value: '5' } })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(confirmar()).toBeEnabled()
    })
  })

  describe('caja del cobro', () => {
    const grupo = () => screen.queryByRole('radiogroup', { name: 'Caja' })

    it('con una sola caja no hay selector ni se manda cajaId', () => {
      abrir([CAJA_1])
      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
      fireEvent.click(confirmar())

      expect(grupo()).not.toBeInTheDocument()
      expect(registrarCobro).toHaveBeenCalledWith('sesion-1', { metodoPago: 'efectivo' })
    })

    it('sin poder leer las cajas (null) no bloquea nada', () => {
      abrir(null)
      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))

      expect(grupo()).not.toBeInTheDocument()
      expect(confirmar()).toBeEnabled()
    })

    it('con dos cajas hay selector, hay que elegir y se manda cajaId', () => {
      abrir([CAJA_1, CAJA_2])
      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))

      expect(grupo()).toBeInTheDocument()
      expect(confirmar()).toBeDisabled()
      expect(screen.getByText('Elegí en qué caja se cobra')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('radio', { name: 'Caja 2' }))
      expect(screen.getByRole('radio', { name: 'Caja 2' })).toBeChecked()
      fireEvent.click(confirmar())

      expect(registrarCobro).toHaveBeenCalledWith('sesion-1', { metodoPago: 'efectivo', cajaId: 'caja-2' })
    })

    it('sin caja recordada, guarda la que se usó al cobrar (no la primera)', async () => {
      abrir([CAJA_1, CAJA_2])
      fireEvent.click(screen.getByRole('radio', { name: 'Caja 2' }))
      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
      fireEvent.click(confirmar())

      await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
      expect(localStorage.getItem('menyu-staff-caja-id:rest-1')).toBe('caja-2')
    })

    it('las cajas son radios nativos del mismo grupo, para que anden las flechas del teclado', () => {
      abrir([CAJA_1, CAJA_2])

      const radios = screen.getAllByRole('radio') as HTMLInputElement[]
      expect(radios).toHaveLength(2)
      expect(radios.every((r) => r.tagName === 'INPUT' && r.type === 'radio')).toBe(true)
      expect(radios[0].name).not.toBe('')
      expect(radios[0].name).toBe(radios[1].name)
    })

    it('arranca en la caja recordada y guarda la que se usó al cobrar bien', async () => {
      localStorage.setItem('menyu-staff-caja-id:rest-1', 'caja-2')
      abrir([CAJA_1, CAJA_2])

      expect(screen.getByRole('radio', { name: 'Caja 2' })).toBeChecked()
      fireEvent.click(screen.getByRole('radio', { name: 'Caja 1' }))
      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
      fireEvent.click(confirmar())

      await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
      expect(localStorage.getItem('menyu-staff-caja-id:rest-1')).toBe('caja-1')
    })

    it('si el cobro falla no recuerda la caja', async () => {
      registrarCobro.mockRejectedValue(new Error('No se pudo registrar'))
      abrir([CAJA_1, CAJA_2])

      fireEvent.click(screen.getByRole('radio', { name: 'Caja 2' }))
      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
      fireEvent.click(confirmar())

      await screen.findByText('No se pudo registrar')
      expect(localStorage.getItem('menyu-staff-caja-id:rest-1')).toBeNull()
    })

    it('con el selector oculto (una caja) no se recuerda nada', async () => {
      abrir([CAJA_1])
      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
      fireEvent.click(confirmar())

      await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
      expect(localStorage.getItem('menyu-staff-caja-id:rest-1')).toBeNull()
    })

    it('si la caja elegida se cierra con el modal abierto, hay que elegir de nuevo', () => {
      const { conCajas } = abrir([CAJA_1, CAJA_2])
      fireEvent.click(screen.getByRole('radio', { name: 'Caja 2' }))
      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
      expect(confirmar()).toBeEnabled()

      conCajas([CAJA_1, { cajaId: 'caja-3', nombre: 'Caja 3' }])

      expect(confirmar()).toBeDisabled()
      expect(screen.getByText('Elegí en qué caja se cobra')).toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: 'Caja 2' })).not.toBeInTheDocument()
    })

    it('sin turno abierto avisa y no deja confirmar', () => {
      abrir([])
      fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))

      expect(screen.getByRole('alert')).toHaveTextContent('No hay un turno abierto')
      expect(grupo()).not.toBeInTheDocument()
      expect(confirmar()).toBeDisabled()
    })
  })

  it('un error que no es un Error muestra un mensaje genérico', async () => {
    registrarCobro.mockRejectedValue('caído')
    abrir()

    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
    fireEvent.click(confirmar())

    expect(await screen.findByText('Error al registrar pago')).toBeInTheDocument()
    expect(onTurnoCambio).not.toHaveBeenCalled()
  })

  it('sin restaurante en el contexto cobra igual, sin recordar la caja', async () => {
    useContextoStore.setState({ restauranteId: null })
    abrir([CAJA_1, CAJA_2])

    fireEvent.click(screen.getByRole('radio', { name: 'Caja 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
    fireEvent.click(confirmar())

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(registrarCobro).toHaveBeenCalledWith('sesion-1', { metodoPago: 'efectivo', cajaId: 'caja-2' })
    expect(localStorage.length).toBe(0)
  })

  it('"Cancelar" cierra el modal', () => {
    abrir()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
