import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { PedidoCliente } from '../../hooks/usePedidosCliente'
import { MisPedidosPage } from './MisPedidosPage'

let estado: { pedidos: PedidoCliente[]; loading: boolean; error: string | null }

vi.mock('../../hooks/usePedidosCliente', () => ({ usePedidosCliente: () => estado }))

const pedido = (id: string, estadoPedido: PedidoCliente['estado'], hora: string): PedidoCliente => ({
  id,
  sesionId: 'ses-1',
  estado: estadoPedido,
  createdAt: `2026-10-18T${hora}:00`,
  items: [
    { id: `${id}-1`, cantidad: 2, item: { nombre: 'Milanesa' } },
    { id: `${id}-2`, cantidad: 1, item: { nombre: 'Agua' } },
  ],
})

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/pedidos']}>
      <Routes>
        <Route path="/pedidos" element={<MisPedidosPage />} />
        <Route path="/menu" element={<p>pantalla del menú</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

/** La barra de progreso de una tarjeta: el ancho del relleno, o null si no tiene. */
const progreso = (id: string) => {
  const tarjeta = screen.getByText(`#${id.slice(0, 6).toUpperCase()}`).parentElement!.parentElement!
  const relleno = tarjeta.querySelector('div > div[style*="width:"]') as HTMLElement | null
  return relleno?.style.width ?? null
}

beforeEach(() => {
  estado = { pedidos: [], loading: false, error: null }
})

describe('MisPedidosPage', () => {
  it('mientras carga muestra el encabezado; "volver" lleva al menú', () => {
    estado.loading = true

    abrir()

    expect(screen.getByText('Mis pedidos')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Volver al menú' }))
    expect(screen.getByText('pantalla del menú')).toBeInTheDocument()
  })

  it('si falla muestra el error y "Reintentar" recarga', () => {
    estado.error = 'No se pudieron cargar tus pedidos'
    const recargar = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload: recargar })

    abrir()

    expect(screen.getByText('No se pudieron cargar tus pedidos')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(recargar).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('sin pedidos invita a ver el menú', () => {
    abrir()

    expect(screen.getByText('Todavía no hiciste ningún pedido')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver el menú' }))
    expect(screen.getByText('pantalla del menú')).toBeInTheDocument()
  })

  it('lista los pedidos del más reciente al más viejo con estado, hora, resumen y progreso', () => {
    estado.pedidos = [
      pedido('aaaaaa-pend', 'pendiente', '20:00'),
      pedido('bbbbbb-prep', 'en_preparacion', '20:30'),
      pedido('cccccc-list', 'listo', '21:00'),
      pedido('dddddd-entr', 'entregado', '19:00'),
      pedido('eeeeee-anul', 'anulado', '18:00'),
    ]

    abrir()

    expect(screen.getAllByText(/^#[A-Z]{6}$/).map((e) => e.textContent)).toEqual(['#CCCCCC', '#BBBBBB', '#AAAAAA', '#DDDDDD', '#EEEEEE'])
    expect(screen.getByText('Enviado')).toBeInTheDocument()
    expect(screen.getAllByText('En preparación')).toHaveLength(2)
    expect(screen.getByText('Entregado')).toBeInTheDocument()
    expect(screen.getByText('Anulado')).toBeInTheDocument()
    const hora = new Date('2026-10-18T20:00:00').toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    expect(screen.getByText(`Enviado a las ${hora}`)).toBeInTheDocument()
    expect(screen.getAllByText('2× Milanesa · 1× Agua')).toHaveLength(5)
    expect(progreso('aaaaaa-pend')).toBe('25%')
    expect(progreso('bbbbbb-prep')).toBe('60%')
    expect(progreso('cccccc-list')).toBe('100%')
    expect(progreso('dddddd-entr')).toBeNull()
    expect(progreso('eeeeee-anul')).toBeNull()
  })
})
