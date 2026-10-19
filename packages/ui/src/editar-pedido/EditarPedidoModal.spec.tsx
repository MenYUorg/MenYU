// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  APARIENCIA_HISTORIAL,
  APARIENCIA_PEDIDOS,
  EditarPedidoModal,
  contarPalabras,
  type AparienciaEditarPedido,
  type EdicionDePedido,
  type ItemEditable,
} from './EditarPedidoModal'

// El modal compartido por el gerente y el mozo. Cada pantalla lo prueba con su API;
// acá se cubre el formulario en sí: límites de cantidades, justificación, aviso de anulación y errores.

const ITEMS: ItemEditable[] = [
  { id: 'i1', nombre: 'Milanesa', cantidadActual: 2, precioUnitario: 1250 },
  { id: 'i2', nombre: 'Gaseosa', cantidadActual: 1, precioUnitario: 800 },
]

function abrir({
  items = ITEMS,
  pagado,
  apariencia = APARIENCIA_PEDIDOS,
  onGuardar = vi.fn<(e: EdicionDePedido) => Promise<void>>().mockResolvedValue(undefined),
}: {
  items?: ItemEditable[]
  pagado?: boolean
  apariencia?: AparienciaEditarPedido
  onGuardar?: (e: EdicionDePedido) => Promise<void>
} = {}) {
  const onClose = vi.fn()
  render(<EditarPedidoModal codigo="#AB12CD34" items={items} pagado={pagado} apariencia={apariencia} onGuardar={onGuardar} onClose={onClose} />)
  return { onGuardar, onClose }
}

const fila = (nombre: string) => screen.getByText(nombre).parentElement!.parentElement as HTMLElement
const boton = (nombre: string, label: '−' | '+') => fila(nombre).querySelector(`button:nth-of-type(${label === '−' ? 1 : 2})`) as HTMLButtonElement
const justificar = (texto: string) => fireEvent.change(screen.getByPlaceholderText('Describí el motivo de la edición…'), { target: { value: texto } })
const guardar = () => screen.getByRole('button', { name: 'Guardar edición' })

afterEach(() => { cleanup() })

describe('contarPalabras', () => {
  it('cuenta palabras separadas por cualquier espacio; vacío o solo espacios es cero', () => {
    expect(contarPalabras('')).toBe(0)
    expect(contarPalabras('   ')).toBe(0)
    expect(contarPalabras(' el  cliente\ncambió\tde idea ')).toBe(5)
  })
})

describe('EditarPedidoModal', () => {
  it('arranca con las cantidades actuales: no se puede subir de ahí, ni bajar de 0, ni guardar sin cambios', () => {
    abrir()

    expect(screen.getByRole('heading', { name: 'Editar pedido #AB12CD34' })).toBeInTheDocument()
    expect(boton('Milanesa', '+')).toBeDisabled()
    expect(boton('Milanesa', '−')).toBeEnabled()
    expect(guardar()).toBeDisabled()

    fireEvent.click(boton('Gaseosa', '−'))
    expect(boton('Gaseosa', '−')).toBeDisabled()
    expect(boton('Gaseosa', '+')).toBeEnabled()
    expect(screen.getByText('Ítem anulado')).toBeInTheDocument()
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('con un cambio pide justificación; guarda solo los ítems que cambiaron, con el texto sin espacios de más', async () => {
    const { onGuardar } = abrir()

    fireEvent.click(boton('Milanesa', '−'))
    expect(screen.getByText('$1250.00')).toBeInTheDocument()
    expect(guardar()).toBeDisabled()

    justificar('  el cliente cambió de idea  ')
    expect(screen.getByText('5/50 palabras')).toBeInTheDocument()
    expect(guardar()).toBeEnabled()

    await act(async () => { fireEvent.click(guardar()) })

    expect(onGuardar).toHaveBeenCalledWith({
      justificacion: 'el cliente cambió de idea',
      ediciones: [{ pedidoItemId: 'i1', cantidadNueva: 1 }],
    })
  })

  it('volver a la cantidad original deja de contar como cambio', () => {
    abrir()
    justificar('ajuste')

    fireEvent.click(boton('Milanesa', '−'))
    expect(guardar()).toBeEnabled()
    fireEvent.click(boton('Milanesa', '+'))
    expect(guardar()).toBeDisabled()
  })

  it('más de 50 palabras no deja guardar y el contador lo marca', () => {
    abrir()
    fireEvent.click(boton('Milanesa', '−'))

    justificar(Array.from({ length: 51 }, () => 'palabra').join(' '))

    expect(screen.getByText('51/50 palabras')).toHaveStyle({ color: '#E8563A' })
    expect(guardar()).toBeDisabled()

    justificar(Array.from({ length: 50 }, () => 'palabra').join(' '))
    expect(guardar()).toBeEnabled()
  })

  it('dejar todo en cero avisa que se anula el pedido completo', () => {
    abrir()

    fireEvent.click(boton('Milanesa', '−'))
    expect(screen.queryByText('Esto anulará el pedido completo.')).not.toBeInTheDocument()
    fireEvent.click(boton('Milanesa', '−'))
    fireEvent.click(boton('Gaseosa', '−'))

    expect(screen.getByText('Esto anulará el pedido completo.')).toBeInTheDocument()
  })

  it('mientras guarda no deja guardar de nuevo; si falla muestra el error y deja reintentar', async () => {
    let rechazar: (e: unknown) => void = () => {}
    const onGuardar = vi.fn(() => new Promise<void>((_, reject) => { rechazar = reject }))
    abrir({ onGuardar })
    fireEvent.click(boton('Milanesa', '−'))
    justificar('ajuste')

    fireEvent.click(guardar())
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()

    await act(async () => { rechazar(new Error('El pedido ya está cerrado')) })
    expect(screen.getByText('El pedido ya está cerrado')).toBeInTheDocument()
    expect(guardar()).toBeEnabled()

    onGuardar.mockRejectedValueOnce('raro')
    await act(async () => { fireEvent.click(guardar()) })
    expect(screen.getByText('Error al editar pedido')).toBeInTheDocument()
    expect(onGuardar).toHaveBeenCalledTimes(2)
  })

  it('un pedido pagado no se edita: avisa en lugar del formulario', () => {
    abrir({ pagado: true })

    expect(screen.getByText('Este pedido ya fue pagado y no puede editarse.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar edición' })).not.toBeInTheDocument()
  })

  it('se cierra con la cruz, con "Cancelar" o tocando afuera; no tocando adentro', () => {
    const { onClose } = abrir()

    fireEvent.click(screen.getByRole('heading', { name: /Editar pedido/ }))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('heading', { name: /Editar pedido/ }).closest('div[style*="position: fixed"]')!)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  describe('apariencias', () => {
    it('la de pedidos: botones cuadrados sin resaltado, fila coloreada sin borde y el nombre sin tachar', () => {
      abrir({ apariencia: APARIENCIA_PEDIDOS })
      fireEvent.click(boton('Gaseosa', '−'))

      expect(boton('Milanesa', '−')).toHaveStyle({ borderRadius: '6px' })
      fireEvent.mouseEnter(boton('Milanesa', '−'))
      expect(boton('Milanesa', '−')).toHaveStyle({ background: 'white' })
      expect(fila('Gaseosa')).toHaveStyle({ background: '#FEF2F0', transition: 'background 0.15s' })
      expect(screen.getByText('Gaseosa')).not.toHaveStyle({ textDecoration: 'line-through' })
    })

    it('la del historial: botones redondos que resaltan, fila con borde y el ítem anulado tachado', () => {
      abrir({ apariencia: APARIENCIA_HISTORIAL })
      fireEvent.click(boton('Milanesa', '−'))
      fireEvent.click(boton('Gaseosa', '−'))

      expect(boton('Milanesa', '−')).toHaveStyle({ borderRadius: '50%' })
      fireEvent.mouseEnter(boton('Milanesa', '−'))
      expect(boton('Milanesa', '−')).toHaveStyle({ background: '#EEF0F8' })
      fireEvent.mouseLeave(boton('Milanesa', '−'))
      expect(boton('Milanesa', '−')).toHaveStyle({ background: 'white' })
      fireEvent.mouseEnter(boton('Gaseosa', '−'))
      expect(boton('Gaseosa', '−')).toHaveStyle({ background: '#F9FAFB' })

      expect(fila('Milanesa')).toHaveStyle({ background: '#FDF0ED', border: '1px solid #F6C4B8' })
      expect(fila('Gaseosa')).toHaveStyle({ background: '#FEE2E2', border: '1px solid #FECACA' })
      expect(screen.getByText('Gaseosa')).toHaveStyle({ textDecoration: 'line-through', color: '#DC2626' })
      expect(screen.getByText('Milanesa')).toHaveStyle({ textDecoration: 'none' })
    })

    it('sin transiciones, ni la fila ni "Guardar edición" animan', () => {
      abrir({ apariencia: { ...APARIENCIA_PEDIDOS, transicionFila: undefined, transicionGuardar: undefined } })
      fireEvent.click(boton('Milanesa', '−'))

      expect(fila('Milanesa').style.transition).toBe('')
      expect(guardar().style.transition).toBe('')
    })
  })
})
