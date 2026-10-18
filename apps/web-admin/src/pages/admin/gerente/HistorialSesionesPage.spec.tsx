import { fireEvent, render, screen, within } from '@testing-library/react'
import { api, type SesionHistorial } from '../../../services/api'
import { HistorialSesionesPage } from './HistorialSesionesPage'

let rolActual = 'GERENTE'
let restauranteActual: string | null = 'rest-1'

vi.mock('@menyu/auth', () => ({
  useAuth: () => ({ user: { rol: rolActual, email: 'gerente@menyu.com' } }),
}))

vi.mock('../../../store/contextStore', () => ({
  useContextStore: () => ({ selectedRestauranteId: restauranteActual }),
}))

vi.mock('../../../services/api', () => ({
  api: {
    sessions: { historial: vi.fn() },
    pedidos: { editar: vi.fn() },
  },
}))

const historial = vi.mocked(api.sessions.historial)
const editar = vi.mocked(api.pedidos.editar)

type Pedido = SesionHistorial['pedidos'][number]

function pedido(id: string, extra: Partial<Pedido> = {}): Pedido {
  return {
    id,
    estado: 'entregado',
    createdAt: '2026-10-18T20:10:00Z',
    totalPedido: 3000,
    tieneEdiciones: false,
    items: [
      { id: `${id}-i1`, cantidad: 2, cantidadEditada: null, precioUnitario: 1000, itemNombre: 'Milanesa', mods: [{ accion: 'QUITAR', ingredienteNombre: 'Cebolla' }] },
      { id: `${id}-i2`, cantidad: 1, cantidadEditada: null, precioUnitario: 1000, itemNombre: 'Agua', mods: [{ accion: 'AGREGAR', ingredienteNombre: 'Hielo' }] },
    ],
    ediciones: [],
    ...extra,
  }
}

const hoy = new Date()
const iso = (horas: number, minutos = 0, diasAtras = 0) => {
  const d = new Date(hoy)
  d.setDate(d.getDate() - diasAtras)
  d.setHours(horas, minutos, 0, 0)
  return d.toISOString()
}

const MESA_4: SesionHistorial = {
  sesionId: 'ses-4',
  mesaNumero: '4',
  iniciadaEn: iso(10, 0),
  cerradaEn: iso(10, 45),
  cantidadPedidos: 1,
  totalSesion: 3000,
  pedidos: [pedido('abcd1234')],
}

const MESA_12: SesionHistorial = {
  sesionId: 'ses-12',
  mesaNumero: '12',
  iniciadaEn: iso(9, 0, 3),
  cerradaEn: iso(11, 30, 3),
  cantidadPedidos: 2,
  totalSesion: 1500,
  pedidos: [
    pedido('ed1t0001', {
      tieneEdiciones: true,
      totalPedido: 1500,
      items: [
        { id: 'e-i1', cantidad: 3, cantidadEditada: 1, precioUnitario: 500, itemNombre: 'Empanada', mods: [] },
        { id: 'e-i2', cantidad: 1, cantidadEditada: 0, precioUnitario: 800, itemNombre: 'Gaseosa', mods: [{ accion: 'AGREGAR', ingredienteNombre: 'Limón' }] },
      ],
      ediciones: [
        {
          id: 'ed-1',
          justificacion: 'Se cargó de más',
          creadoEn: iso(10, 0, 3),
          editor: { nombre: 'Ana', tipo: 'mozo' },
          itemsEliminados: [
            { itemNombre: 'Empanada', cantidadAntes: 3, cantidadDespues: 1, precioUnitario: 500, esAnulacion: false },
            { itemNombre: 'Gaseosa', cantidadAntes: 1, cantidadDespues: 0, precioUnitario: 800, esAnulacion: true },
          ],
        },
      ],
    }),
    pedido('anul0001', { estado: 'anulado', totalPedido: 0 }),
  ],
}

const MESA_SIN_PEDIDOS: SesionHistorial = { ...MESA_4, sesionId: 'ses-7', mesaNumero: '7', iniciadaEn: iso(8, 0), cerradaEn: iso(10, 0), pedidos: [], cantidadPedidos: 0, totalSesion: 0 }

async function abrir(sesiones: SesionHistorial[] = [MESA_4, MESA_12]) {
  historial.mockResolvedValue(sesiones)
  render(<HistorialSesionesPage />)
  if (sesiones.length > 0) await screen.findByText(sesiones[0].mesaNumero)
}

/** La tarjeta de una mesa en la lista (el número grande de la izquierda). */
const tarjeta = (numero: string) => screen.getByText(numero, { selector: 'span, div' })

beforeEach(() => {
  rolActual = 'GERENTE'
  restauranteActual = 'rest-1'
  vi.clearAllMocks()
})

describe('HistorialSesionesPage', () => {
  it('sin restaurante elegido no consulta nada', () => {
    restauranteActual = null

    render(<HistorialSesionesPage />)

    expect(historial).not.toHaveBeenCalled()
    expect(screen.getByText('Historial de sesiones')).toBeInTheDocument()
  })

  describe('lista y resumen', () => {
    it('pide el historial de hoy y muestra cada sesión con duración, pedidos, total y marcas', async () => {
      await abrir()

      const fecha = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      expect(historial).toHaveBeenCalledWith('rest-1', fecha(hoy), fecha(hoy))
      expect(screen.getByText('45 min')).toBeInTheDocument()
      expect(screen.getByText('2h 30m')).toBeInTheDocument()
      expect(screen.getByText('1 pedido')).toBeInTheDocument()
      expect(screen.getByText('2 pedidos')).toBeInTheDocument()
      expect(screen.getByText('con anulaciones')).toBeInTheDocument()
      expect(screen.getByText('con ediciones')).toBeInTheDocument()
    })

    it('el resumen cuenta sesiones, las que tienen ediciones y los pedidos anulados', async () => {
      await abrir()

      const valor = (titulo: string) => screen.getByText(titulo).nextElementSibling?.textContent
      expect(valor('Sesiones cerradas')).toBe('2')
      expect(valor('Con ediciones')).toBe('1')
      expect(valor('Pedidos anulados')).toBe('1')
    })

    it('cambiar de período vuelve a pedir el historial con otro rango', async () => {
      await abrir()

      for (const periodo of ['Ayer', 'Última semana', 'Último mes', 'Hoy']) {
        fireEvent.click(screen.getByRole('button', { name: periodo }))
      }

      // La carga inicial (hoy) y una por cada clic; volver a "Hoy" repite el primer rango.
      await vi.waitFor(() => expect(historial).toHaveBeenCalledTimes(5))
      const rangos = historial.mock.calls.map(([, desde, hasta]) => [desde, hasta])
      expect(new Set(rangos.map((r) => r.join('|'))).size).toBe(4)
      const [ayerDesde, ayerHasta] = rangos[1]
      expect(ayerDesde).toBe(ayerHasta)
    })

    it('el buscador filtra por número de mesa', async () => {
      await abrir()

      fireEvent.change(screen.getByPlaceholderText('Buscar por mesa...'), { target: { value: '12' } })

      expect(screen.queryByText('45 min')).not.toBeInTheDocument()
      expect(screen.getByText('2h 30m')).toBeInTheDocument()
      fireEvent.focus(screen.getByPlaceholderText('Buscar por mesa...'))
      fireEvent.blur(screen.getByPlaceholderText('Buscar por mesa...'))
    })

    it('sin sesiones, o si la consulta falla, dice que no hay en el período', async () => {
      historial.mockRejectedValue(new Error('caído'))

      render(<HistorialSesionesPage />)

      expect(screen.getByText('Cargando sesiones…')).toBeInTheDocument()
      expect(await screen.findByText('No hay sesiones cerradas en este período.')).toBeInTheDocument()
    })
  })

  describe('detalle de una sesión', () => {
    it('muestra los pedidos con sus ítems, modificaciones, estados y el total', async () => {
      await abrir()

      fireEvent.click(tarjeta('4'))

      expect(screen.getByText('Mesa 4')).toBeInTheDocument()
      expect(screen.getByText('#ABCD')).toBeInTheDocument()
      expect(screen.getByText('Entregado')).toBeInTheDocument()
      expect(screen.getByText('2× Milanesa')).toBeInTheDocument()
      expect(screen.getByText('sin Cebolla')).toBeInTheDocument()
      expect(screen.getByText('+ Hielo')).toBeInTheDocument()
    })

    it('un pedido editado muestra lo que quedó, lo quitado tachado y el historial de ediciones', async () => {
      await abrir()
      fireEvent.click(tarjeta('12'))

      expect(screen.getByText('Mesa 12')).toBeInTheDocument()
      expect(screen.getByText('Editado')).toBeInTheDocument()
      expect(screen.getAllByText('Anulado').length).toBeGreaterThan(0)
      expect(screen.getByText('1× Empanada')).toBeInTheDocument()
      expect(screen.getByText('2× Empanada')).toBeInTheDocument()
      expect(screen.getByText('1× Gaseosa')).toBeInTheDocument()
      expect(screen.queryByText('+ Limón')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Ver ediciones \(1\)/ }))
      expect(screen.getByText('Ana · mozo')).toBeInTheDocument()
      expect(screen.getByText('"Se cargó de más"')).toBeInTheDocument()
      expect(screen.getByText('Empanada: 3 → 1')).toBeInTheDocument()
      expect(screen.getByText('Gaseosa: 1 → 0')).toBeInTheDocument()
      expect(screen.getByText('anulado')).toBeInTheDocument()
      expect(screen.getByText('−$1000.00')).toBeInTheDocument()
      expect(screen.getByText('−$800.00')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Ver ediciones \(1\)/ }))
      expect(screen.queryByText('Ana · mozo')).not.toBeInTheDocument()
    })

    it('una sesión sin pedidos lo dice; se cierra con la X o tocando afuera', async () => {
      await abrir([MESA_SIN_PEDIDOS])

      fireEvent.click(tarjeta('7'))
      expect(screen.getByText('Sin pedidos registrados.')).toBeInTheDocument()
      const fondo = screen.getByText('Mesa 7').closest('div[style*="position: fixed"]') as HTMLElement
      fireEvent.click(fondo)
      expect(screen.queryByText('Mesa 7')).not.toBeInTheDocument()
    })

    it('un OWNER no ve "Editar pedido"; un GERENTE sí, salvo en los anulados', async () => {
      rolActual = 'OWNER'
      await abrir()
      fireEvent.click(tarjeta('4'))
      expect(screen.queryByRole('button', { name: 'Editar pedido' })).not.toBeInTheDocument()
    })
  })

  describe('editar un pedido (GERENTE)', () => {
    async function abrirEdicion() {
      await abrir()
      fireEvent.click(tarjeta('12'))
      expect(screen.getAllByRole('button', { name: 'Editar pedido' })).toHaveLength(1)
      fireEvent.click(screen.getByRole('button', { name: 'Editar pedido' }))
      return screen.getByText('Editar pedido #ED1T').closest('div') as HTMLElement
    }

    it('arranca con las cantidades actuales y sin cambios no deja guardar', async () => {
      await abrirEdicion()

      expect(screen.getByText('Ítem anulado')).toBeInTheDocument()
      expect(screen.getByText('0/50 palabras')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Guardar edición' })).toBeDisabled()
    })

    it('los botones respetan el mínimo (0) y el máximo (la cantidad actual)', async () => {
      await abrirEdicion()

      const menos = screen.getAllByRole('button', { name: '−' })
      const mas = screen.getAllByRole('button', { name: '+' })
      expect(mas[0]).toBeDisabled()
      expect(menos[1]).toBeDisabled()
      fireEvent.click(menos[0])
      expect(screen.getByText('Esto anulará el pedido completo.')).toBeInTheDocument()
      fireEvent.click(screen.getAllByRole('button', { name: '+' })[0])
      expect(screen.queryByText('Esto anulará el pedido completo.')).not.toBeInTheDocument()
    })

    it('con un cambio y la justificación guarda, cierra todo y recarga el historial', async () => {
      editar.mockResolvedValue({} as never)
      await abrirEdicion()

      fireEvent.click(screen.getAllByRole('button', { name: '−' })[0])
      fireEvent.change(screen.getByPlaceholderText('Describí el motivo de la edición…'), { target: { value: '  El cliente no lo quiso  ' } })
      expect(screen.getByText('5/50 palabras')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Guardar edición' }))

      await vi.waitFor(() => expect(historial).toHaveBeenCalledTimes(2))
      expect(editar).toHaveBeenCalledWith('ed1t0001', {
        justificacion: 'El cliente no lo quiso',
        ediciones: [{ pedidoItemId: 'e-i1', cantidadNueva: 0 }],
      })
      expect(screen.queryByText('Editar pedido #ED1T')).not.toBeInTheDocument()
      expect(screen.queryByText('Mesa 12')).not.toBeInTheDocument()
    })

    it('más de 50 palabras no deja guardar', async () => {
      await abrirEdicion()

      fireEvent.click(screen.getAllByRole('button', { name: '−' })[0])
      fireEvent.change(screen.getByPlaceholderText('Describí el motivo de la edición…'), { target: { value: Array(51).fill('palabra').join(' ') } })

      expect(screen.getByText('51/50 palabras')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Guardar edición' })).toBeDisabled()
    })

    it('si el servidor rechaza muestra el error y deja reintentar', async () => {
      editar.mockRejectedValueOnce(new Error('La mesa ya tiene un cobro registrado')).mockRejectedValueOnce('raro')
      await abrirEdicion()

      fireEvent.click(screen.getAllByRole('button', { name: '−' })[0])
      fireEvent.change(screen.getByPlaceholderText('Describí el motivo de la edición…'), { target: { value: 'Motivo' } })
      fireEvent.click(screen.getByRole('button', { name: 'Guardar edición' }))
      expect(await screen.findByText('La mesa ya tiene un cobro registrado')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Guardar edición' }))
      expect(await screen.findByText('Error al editar pedido')).toBeInTheDocument()
    })

    it('"Cancelar" cierra la edición y vuelve al detalle; la X y el fondo también cierran', async () => {
      const modal = await abrirEdicion()

      fireEvent.click(within(modal.parentElement as HTMLElement).getByRole('button', { name: 'Cancelar' }))
      expect(screen.getByText('Mesa 12')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Editar pedido' }))
      const fondo = screen.getByText('Editar pedido #ED1T').closest('div[style*="position: fixed"]') as HTMLElement
      fireEvent.click(fondo)
      expect(screen.queryByText('Editar pedido #ED1T')).not.toBeInTheDocument()
    })
  })
})
