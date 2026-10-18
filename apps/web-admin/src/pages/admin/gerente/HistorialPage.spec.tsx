import { fireEvent, render, screen, within } from '@testing-library/react'
import { api, type PedidoAdmin } from '../../../services/api'
import { HistorialPage } from './HistorialPage'

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
    pedidos: { list: vi.fn(), ediciones: vi.fn(), editar: vi.fn() },
  },
}))

const listar = vi.mocked(api.pedidos.list)
const ediciones = vi.mocked(api.pedidos.ediciones)
const editar = vi.mocked(api.pedidos.editar)

const haceDias = (dias: number, hora = 12) => {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  d.setHours(hora, 0, 0, 0)
  return d.toISOString()
}

const mod = (accion: string, nombre: string, cantidad?: number) =>
  ({ accion, cantidad, itemIngrediente: { ingrediente: { nombre } } }) as unknown as PedidoAdmin['items'][number]['mods'][number]

function pedido(id: string, extra: Partial<PedidoAdmin> = {}): PedidoAdmin {
  return {
    id,
    sesionId: 'sesion-abcdefgh',
    estado: 'entregado',
    createdAt: haceDias(0, 11),
    updatedAt: haceDias(0, 12),
    mesa: { numero: '4' },
    pago: null,
    items: [
      { id: `${id}-1`, cantidad: 2, cantidadEditada: null, precioUnitario: 1000, notas: null, item: { nombre: 'Milanesa' }, mods: [mod('QUITAR', 'Cebolla'), mod('AGREGAR', 'Queso', 2), mod('AGREGAR', 'Huevo')] },
      { id: `${id}-2`, cantidad: 1, cantidadEditada: null, precioUnitario: 500, notas: null, item: { nombre: 'Agua' }, mods: [] },
    ],
    ...extra,
  }
}

const HOY = pedido('aaaa1111-hoy')
const EDITADO = pedido('bbbb2222-edit', {
  mesa: { numero: '12' },
  updatedAt: haceDias(0, 13),
  items: [
    { id: 'e-1', cantidad: 3, cantidadEditada: 1, precioUnitario: 500, notas: null, item: { nombre: 'Empanada' }, mods: [] },
    { id: 'e-2', cantidad: 1, cantidadEditada: 0, precioUnitario: 800, notas: null, item: { nombre: 'Gaseosa' }, mods: [mod('AGREGAR', 'Limón')] },
  ],
})
const PAGADO = pedido('cccc3333-pago', { mesa: { numero: '7' }, pago: { estado: 'aprobado' } })
const ANULADO = pedido('dddd4444-anul', { estado: 'anulado', mesa: { numero: '9' }, updatedAt: haceDias(1) })
const VIEJO = pedido('eeee5555-viej', { mesa: { numero: '20' }, updatedAt: haceDias(10) })

async function abrir(entregados: PedidoAdmin[] = [HOY, EDITADO, PAGADO, VIEJO], anulados: PedidoAdmin[] = [ANULADO]) {
  listar.mockImplementation((_r: string, estado: string) => Promise.resolve(estado === 'anulado' ? anulados : entregados))
  render(<HistorialPage />)
  await screen.findByText('Mesa 4')
}

const tarjeta = (mesa: string) => screen.getByText(`Mesa ${mesa}`).closest('div[style*="overflow: hidden"]') as HTMLElement
const kpi = (titulo: string) => screen.getByText(titulo).nextElementSibling?.textContent

beforeEach(() => {
  rolActual = 'GERENTE'
  restauranteActual = 'rest-1'
  vi.clearAllMocks()
})

describe('HistorialPage', () => {
  it('sin restaurante elegido no consulta nada', () => {
    restauranteActual = null

    render(<HistorialPage />)

    expect(listar).not.toHaveBeenCalled()
  })

  it('si la consulta falla muestra que no hay pedidos', async () => {
    listar.mockRejectedValue(new Error('caído'))

    render(<HistorialPage />)

    expect(screen.getByText('Cargando pedidos…')).toBeInTheDocument()
    expect(await screen.findByText('No hay pedidos entregados en este período.')).toBeInTheDocument()
  })

  describe('lista', () => {
    it('pide los entregados y los anulados; hoy muestra los de hoy, del más reciente al más viejo, con los indicadores', async () => {
      await abrir()

      expect(listar).toHaveBeenCalledWith('rest-1', 'entregado')
      expect(listar).toHaveBeenCalledWith('rest-1', 'anulado')
      const mesas = screen.getAllByText(/^Mesa \d+$/).map((e) => e.textContent)
      expect(mesas).toEqual(['Mesa 12', 'Mesa 4', 'Mesa 7'])
      expect(kpi('Entregados')).toBe('3')
      expect(kpi('Editados')).toBe('1')
      expect(kpi('Anulados')).toBe('0')
    })

    it('cada tarjeta muestra id, sesión, estado, ítems con modificaciones y total', async () => {
      await abrir()

      const card = tarjeta('4')
      expect(within(card).getByText('#AAAA1111')).toBeInTheDocument()
      expect(within(card).getByText('· sesión #SESION-A')).toBeInTheDocument()
      expect(within(card).getByText('Entregado')).toBeInTheDocument()
      expect(within(card).getByText('2× Milanesa')).toBeInTheDocument()
      expect(within(card).getByText('sin Cebolla')).toBeInTheDocument()
      expect(within(card).getByText('+2 Queso')).toBeInTheDocument()
      expect(within(card).getByText('+1 Huevo')).toBeInTheDocument()
      expect(within(card).getByText('$2500.00')).toBeInTheDocument()
    })

    it('un pedido editado muestra lo que quedó y lo quitado; uno pagado no se edita', async () => {
      await abrir()

      const card = tarjeta('12')
      expect(within(card).getByText('Entregado · Editado')).toBeInTheDocument()
      expect(within(card).getByText('1× Empanada')).toBeInTheDocument()
      expect(within(card).getByText('2× Empanada')).toBeInTheDocument()
      expect(within(card).getByText('1× Gaseosa')).toBeInTheDocument()
      expect(within(card).queryByText('+1 Limón')).not.toBeInTheDocument()
      expect(within(tarjeta('7')).getByText('Ya pagado')).toBeInTheDocument()
    })

    it.each([
      ['Ayer', ['Mesa 9'], '1'],
      ['Última semana', ['Mesa 12', 'Mesa 4', 'Mesa 7', 'Mesa 9'], '1'],
      ['Último mes', ['Mesa 12', 'Mesa 4', 'Mesa 7', 'Mesa 9', 'Mesa 20'], '1'],
    ])('"%s" filtra por la fecha del pedido', async (periodo, esperadas, anulados) => {
      await abrir()

      fireEvent.click(screen.getByRole('button', { name: periodo }))

      expect(screen.getAllByText(/^Mesa \d+$/).map((e) => e.textContent)).toEqual(esperadas)
      expect(kpi('Anulados')).toBe(anulados)
    })

    it('un anulado se ve como "Anulado"', async () => {
      await abrir()
      fireEvent.click(screen.getByRole('button', { name: 'Ayer' }))

      expect(within(tarjeta('9')).getByText('Anulado')).toBeInTheDocument()
    })

    it('busca por mesa y por id de pedido; la X limpia cada búsqueda', async () => {
      await abrir()

      fireEvent.change(screen.getByPlaceholderText('Buscar por mesa...'), { target: { value: '12' } })
      expect(screen.getAllByText(/^Mesa \d+$/)).toHaveLength(1)
      fireEvent.click(screen.getByPlaceholderText('Buscar por mesa...').parentElement!.querySelector('button')!)
      expect(screen.getAllByText(/^Mesa \d+$/)).toHaveLength(3)

      fireEvent.change(screen.getByPlaceholderText('Buscar por ID de pedido...'), { target: { value: 'CCCC' } })
      expect(screen.getAllByText(/^Mesa \d+$/).map((e) => e.textContent)).toEqual(['Mesa 7'])
      fireEvent.click(screen.getByPlaceholderText('Buscar por ID de pedido...').parentElement!.querySelector('button')!)
      expect(screen.getAllByText(/^Mesa \d+$/)).toHaveLength(3)

      fireEvent.change(screen.getByPlaceholderText('Buscar por mesa...'), { target: { value: '99' } })
      expect(screen.getByText('No hay pedidos entregados en este período.')).toBeInTheDocument()
    })
  })

  describe('ediciones de un pedido', () => {
    it('"Ver ediciones" las pide una vez y las muestra con editor, motivo y diferencias', async () => {
      let entregar: (valor: Awaited<ReturnType<typeof api.pedidos.ediciones>>) => void = () => {}
      ediciones.mockReturnValue(new Promise((r) => { entregar = r }))
      await abrir()
      const card = tarjeta('12')

      fireEvent.click(within(card).getByRole('button', { name: /Ver ediciones/ }))
      expect(within(card).getByRole('button', { name: /Cargando…/ })).toBeInTheDocument()
      entregar([
        {
          id: 'ed-1',
          justificacion: 'Se cargó de más',
          creadoEn: haceDias(0, 13),
          editor: { nombre: 'Ana', tipo: 'mozo' },
          itemsEliminados: [
            { id: 'x1', itemNombre: 'Empanada', cantidadAntes: 3, cantidadDespues: 1, precioUnitario: 500 },
            { id: 'x2', itemNombre: 'Gaseosa', cantidadAntes: 1, cantidadDespues: 0, precioUnitario: 800 },
          ],
        },
      ])

      expect(await within(card).findByText('Ana')).toBeInTheDocument()
      expect(within(card).getByText('"Se cargó de más"')).toBeInTheDocument()
      expect(within(card).getByText('Empanada: 3 → 1')).toBeInTheDocument()
      expect(within(card).getByText('anulado')).toBeInTheDocument()
      expect(within(card).getByText('−$1000.00')).toBeInTheDocument()

      fireEvent.click(within(card).getByRole('button', { name: /Ver ediciones/ }))
      expect(within(card).queryByText('Ana')).not.toBeInTheDocument()
      fireEvent.click(within(card).getByRole('button', { name: /Ver ediciones/ }))
      expect(within(card).getByText('Ana')).toBeInTheDocument()
      expect(ediciones).toHaveBeenCalledTimes(1)
    })

    it('sin ediciones, o si la consulta falla, dice que no hay', async () => {
      ediciones.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('caído'))
      await abrir()

      fireEvent.click(within(tarjeta('4')).getByRole('button', { name: /Ver ediciones/ }))
      expect(await within(tarjeta('4')).findByText('Sin ediciones registradas.')).toBeInTheDocument()
      fireEvent.click(within(tarjeta('7')).getByRole('button', { name: /Ver ediciones/ }))
      expect(await within(tarjeta('7')).findByText('Sin ediciones registradas.')).toBeInTheDocument()
    })
  })

  describe('editar (GERENTE)', () => {
    async function abrirEdicion(mesa = '12') {
      await abrir()
      fireEvent.click(within(tarjeta(mesa)).getByRole('button', { name: 'Editar pedido' }))
      return screen.getByText(/^Editar pedido #/).closest('div[style*="position: fixed"]') as HTMLElement
    }

    it('un OWNER no ve los botones de edición', async () => {
      rolActual = 'OWNER'
      await abrir()

      expect(screen.queryByRole('button', { name: 'Editar pedido' })).not.toBeInTheDocument()
      expect(screen.queryByText('Ya pagado')).not.toBeInTheDocument()
    })

    it('arranca con las cantidades actuales; los botones respetan 0 y la cantidad actual', async () => {
      const modal = await abrirEdicion()

      expect(within(modal).getByText('Editar pedido #BBBB2222')).toBeInTheDocument()
      expect(within(modal).getByText('Ítem anulado')).toBeInTheDocument()
      const [menos1, menos2] = within(modal).getAllByRole('button', { name: '−' })
      const [mas1] = within(modal).getAllByRole('button', { name: '+' })
      expect(mas1).toBeDisabled()
      expect(menos2).toBeDisabled()
      expect(within(modal).getByRole('button', { name: 'Guardar edición' })).toBeDisabled()

      fireEvent.click(menos1)
      expect(within(modal).getByText('Esto anulará el pedido completo.')).toBeInTheDocument()
      fireEvent.click(within(modal).getAllByRole('button', { name: '+' })[0])
      expect(within(modal).queryByText('Esto anulará el pedido completo.')).not.toBeInTheDocument()
    })

    it('guarda con justificación, cierra el modal y recarga', async () => {
      editar.mockResolvedValue({} as never)
      const modal = await abrirEdicion()

      fireEvent.click(within(modal).getAllByRole('button', { name: '−' })[0])
      fireEvent.change(within(modal).getByPlaceholderText('Describí el motivo de la edición…'), { target: { value: '  No lo quiso  ' } })
      expect(within(modal).getByText('3/50 palabras')).toBeInTheDocument()
      fireEvent.click(within(modal).getByRole('button', { name: 'Guardar edición' }))

      await vi.waitFor(() => expect(listar).toHaveBeenCalledTimes(4))
      expect(editar).toHaveBeenCalledWith('bbbb2222-edit', { justificacion: 'No lo quiso', ediciones: [{ pedidoItemId: 'e-1', cantidadNueva: 0 }] })
      expect(screen.queryByText(/^Editar pedido #/)).not.toBeInTheDocument()
    })

    it('con más de 50 palabras no deja guardar; un error del servidor se muestra', async () => {
      editar.mockRejectedValueOnce(new Error('Ya tiene un cobro')).mockRejectedValueOnce('raro')
      const modal = await abrirEdicion()
      const motivo = within(modal).getByPlaceholderText('Describí el motivo de la edición…')

      fireEvent.click(within(modal).getAllByRole('button', { name: '−' })[0])
      fireEvent.change(motivo, { target: { value: Array(51).fill('x').join(' ') } })
      expect(within(modal).getByRole('button', { name: 'Guardar edición' })).toBeDisabled()

      fireEvent.change(motivo, { target: { value: 'Motivo' } })
      fireEvent.click(within(modal).getByRole('button', { name: 'Guardar edición' }))
      expect(await within(modal).findByText('Ya tiene un cobro')).toBeInTheDocument()
      fireEvent.click(within(modal).getByRole('button', { name: 'Guardar edición' }))
      expect(await within(modal).findByText('Error al editar pedido')).toBeInTheDocument()
    })

    it('se cierra con "Cancelar" y tocando afuera', async () => {
      const modal = await abrirEdicion()

      fireEvent.click(within(modal).getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByText(/^Editar pedido #/)).not.toBeInTheDocument()

      fireEvent.click(within(tarjeta('12')).getByRole('button', { name: 'Editar pedido' }))
      fireEvent.click(screen.getByText(/^Editar pedido #/).closest('div[style*="position: fixed"]') as HTMLElement)
      expect(screen.queryByText(/^Editar pedido #/)).not.toBeInTheDocument()
    })
  })
})
