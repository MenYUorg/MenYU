// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SesionHistorial } from '@menyu/types'
import { BadgeEstado, PedidoEnSesion, SesionCard, SesionDetalleModal, type SesionPedido } from './HistorialSesiones'

// La vista compartida del historial. Las pantallas de web-admin y web-staff la prueban con sus datos;
// acá se cubre lo que cada caso de un pedido o una sesión dibuja, sin depender de ninguna app.

const local = (dia: number, hora: number, minuto = 0) => new Date(2026, 9, dia, hora, minuto).toISOString()

function pedido(extra: Partial<SesionPedido> = {}): SesionPedido {
  return {
    id: 'ab12cd34',
    estado: 'entregado',
    createdAt: local(18, 12),
    totalPedido: 12500,
    tieneEdiciones: false,
    items: [{ id: 'i1', cantidad: 2, cantidadEditada: null, precioUnitario: 1250, itemNombre: 'Milanesa', mods: [] }],
    ediciones: [],
    ...extra,
  }
}

function sesion(extra: Partial<SesionHistorial> = {}): SesionHistorial {
  return {
    sesionId: 's1',
    mesaNumero: '7',
    iniciadaEn: local(18, 12),
    cerradaEn: local(18, 13, 30),
    cantidadPedidos: 1,
    totalSesion: 12500,
    pedidos: [pedido()],
    ...extra,
  }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('BadgeEstado', () => {
  it('traduce los estados conocidos y muestra tal cual uno desconocido', () => {
    render(
      <>
        <BadgeEstado estado="en_preparacion" />
        <BadgeEstado estado="otro_estado" />
      </>,
    )
    expect(screen.getByText('En preparación')).toBeInTheDocument()
    expect(screen.getByText('otro_estado')).toBeInTheDocument()
  })
})

describe('PedidoEnSesion', () => {
  it('muestra el número corto, los ítems con sus modificaciones y el total', () => {
    render(
      <PedidoEnSesion
        pedido={pedido({
          items: [{
            id: 'i1', cantidad: 1, cantidadEditada: null, precioUnitario: 2500, itemNombre: 'Hamburguesa',
            mods: [{ accion: 'QUITAR', ingredienteNombre: 'cebolla' }, { accion: 'AGREGAR', ingredienteNombre: 'huevo' }],
          }],
        })}
      />,
    )
    expect(screen.getByText('#AB12')).toBeInTheDocument()
    expect(screen.getByText('Entregado')).toBeInTheDocument()
    expect(screen.getByText('1× Hamburguesa')).toBeInTheDocument()
    expect(screen.getByText('sin cebolla')).toBeInTheDocument()
    expect(screen.getByText('+ huevo')).toBeInTheDocument()
    expect(screen.getByText(/^\$12\.500,00$/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ver ediciones/ })).not.toBeInTheDocument()
  })

  it('un ítem que bajó de cantidad muestra lo que quedó y lo quitado; uno en cero queda tachado y sin modificaciones', () => {
    render(
      <PedidoEnSesion
        pedido={pedido({
          items: [
            { id: 'i1', cantidad: 3, cantidadEditada: 1, precioUnitario: 1000, itemNombre: 'Empanada', mods: [] },
            { id: 'i2', cantidad: 2, cantidadEditada: 0, precioUnitario: 500, itemNombre: 'Gaseosa', mods: [{ accion: 'AGREGAR', ingredienteNombre: 'hielo' }] },
          ],
        })}
      />,
    )
    expect(screen.getByText('1× Empanada')).toBeInTheDocument()
    expect(screen.getByText('2× Empanada')).toHaveStyle({ textDecoration: 'line-through' })
    expect(screen.getByText('2× Gaseosa')).toHaveStyle({ textDecoration: 'line-through' })
    expect(screen.queryByText('+ hielo')).not.toBeInTheDocument()
  })

  it('un pedido editado se marca y despliega sus ediciones (quién, cuándo, por qué y cuánto se descontó)', () => {
    render(
      <PedidoEnSesion
        pedido={pedido({
          tieneEdiciones: true,
          ediciones: [{
            id: 'e1',
            justificacion: 'El cliente cambió de idea',
            creadoEn: local(18, 12, 40),
            editor: { nombre: 'Ana', tipo: 'mozo' },
            itemsEliminados: [{ itemNombre: 'Milanesa', cantidadAntes: 2, cantidadDespues: 1, precioUnitario: 1250, esAnulacion: false }],
          }],
        })}
      />,
    )
    expect(screen.getByText('Editado')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver ediciones (1)' }))

    expect(screen.getByText('Ana · mozo')).toBeInTheDocument()
    expect(screen.getByText('"El cliente cambió de idea"')).toBeInTheDocument()
    expect(screen.getByText('Milanesa: 2 → 1')).toBeInTheDocument()
    expect(screen.getByText('−$1250.00')).toBeInTheDocument()
    expect(screen.queryByText('anulado')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver ediciones (1)' }))
    expect(screen.queryByText('Ana · mozo')).not.toBeInTheDocument()
  })

  it('un pedido anulado lleva su marca (no la de editado) y la anulación se señala en la edición', () => {
    render(
      <PedidoEnSesion
        pedido={pedido({
          estado: 'anulado',
          tieneEdiciones: true,
          ediciones: [{
            id: 'e1',
            justificacion: 'Error de carga',
            creadoEn: local(18, 12, 40),
            editor: { nombre: 'Luis', tipo: 'gerente' },
            itemsEliminados: [{ itemNombre: 'Milanesa', cantidadAntes: 2, cantidadDespues: 0, precioUnitario: 1250, esAnulacion: true }],
          }],
        })}
      />,
    )
    expect(screen.getAllByText('Anulado')).toHaveLength(2)
    expect(screen.queryByText('Editado')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver ediciones (1)' }))
    expect(screen.getByText('anulado')).toBeInTheDocument()
  })

  it('la acción de cada app va al pie de cada pedido', () => {
    const accion = vi.fn((p: SesionPedido) => <button>Editar {p.id}</button>)
    render(<PedidoEnSesion pedido={pedido()} accionPedido={accion} />)

    expect(screen.getByRole('button', { name: 'Editar ab12cd34' })).toBeInTheDocument()
    expect(accion).toHaveBeenCalledWith(expect.objectContaining({ id: 'ab12cd34' }))
  })
})

describe('SesionDetalleModal', () => {
  it('encabeza con la mesa, el horario, la duración y el total, y lista los pedidos con la acción de la app', () => {
    render(
      <SesionDetalleModal
        sesion={sesion()}
        onClose={vi.fn()}
        accionPedido={() => <button>Editar pedido</button>}
      />,
    )
    expect(screen.getByText('Mesa 7')).toBeInTheDocument()
    expect(screen.getByText(/1h 30m · \$12\.500,00/)).toBeInTheDocument()
    expect(screen.getByText('#AB12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar pedido' })).toBeInTheDocument()
  })

  it('sin pedidos lo avisa', () => {
    render(<SesionDetalleModal sesion={sesion({ pedidos: [], cantidadPedidos: 0 })} onClose={vi.fn()} />)
    expect(screen.getByText('Sin pedidos registrados.')).toBeInTheDocument()
  })

  it('se cierra con la cruz o tocando afuera, no tocando adentro', () => {
    const onClose = vi.fn()
    render(<SesionDetalleModal sesion={sesion()} onClose={onClose} />)

    fireEvent.click(screen.getByText('Mesa 7'))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Mesa 7').closest('div[style*="position: fixed"]')!)
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getAllByRole('button')[0])
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('SesionCard', () => {
  it('resume la sesión de hoy: mesa, duración, pedidos, total y hora de cierre (sin fecha)', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 18, 20, 0), toFake: ['Date'] })
    render(<SesionCard sesion={sesion()} onClick={vi.fn()} />)

    expect(screen.getByText('MESA')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('1h 30m')).toBeInTheDocument()
    expect(screen.getByText('1 pedido')).toBeInTheDocument()
    expect(screen.getByText(/^\$12\.500,00$/)).toBeInTheDocument()
    expect(screen.getByText(/1:30/)).toBeInTheDocument()
    expect(screen.queryByText(/^0?18\/10$/)).not.toBeInTheDocument()
    expect(screen.queryByText('con anulaciones')).not.toBeInTheDocument()
    expect(screen.queryByText('con ediciones')).not.toBeInTheDocument()
  })

  it('una sesión de otro día muestra la fecha, y las marcas de anulaciones y ediciones', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 20, 20, 0), toFake: ['Date'] })
    render(
      <SesionCard
        sesion={sesion({ cantidadPedidos: 2, pedidos: [pedido({ estado: 'anulado' }), pedido({ id: 'ff00', tieneEdiciones: true })] })}
        onClick={vi.fn()}
      />,
    )
    expect(screen.getByText('2 pedidos')).toBeInTheDocument()
    expect(screen.getByText(/^0?18\/10$/)).toBeInTheDocument()
    expect(screen.getByText('con anulaciones')).toBeInTheDocument()
    expect(screen.getByText('con ediciones')).toBeInTheDocument()
  })

  it('al tocarla abre el detalle; resalta al pasar el mouse y se hunde al presionar', () => {
    const onClick = vi.fn()
    render(<SesionCard sesion={sesion()} onClick={onClick} />)
    const tarjeta = screen.getByText('MESA').parentElement!.parentElement!

    fireEvent.mouseEnter(tarjeta)
    expect(tarjeta).toHaveStyle({ border: '1px solid #F6C4B8' })
    fireEvent.mouseDown(tarjeta)
    expect(tarjeta).toHaveStyle({ transform: 'translateY(1px)' })
    fireEvent.mouseUp(tarjeta)
    expect(tarjeta).toHaveStyle({ transform: 'none' })
    fireEvent.mouseDown(tarjeta)
    fireEvent.mouseLeave(tarjeta)
    expect(tarjeta).toHaveStyle({ border: '1px solid #e5e7eb', transform: 'none' })

    fireEvent.click(tarjeta)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
