import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api, type SesionHistorial } from '../../services/api'
import { HistorialPage } from './HistorialPage'

let usuario: { nombre?: string; email?: string } | null = { nombre: 'Ana Pérez', email: 'ana@menyu.com' }
let restauranteActual: string | null = 'rest-1'

vi.mock('@menyu/auth', () => ({ useAuth: () => ({ user: usuario }) }))
vi.mock('@menyu/ui', () => ({ LogoMenYuOscuro: () => <span>MenYU</span> }))
vi.mock('../../store/mozoStore', () => ({ useMozoStore: () => ({ restauranteId: restauranteActual }) }))
vi.mock('../../services/api', () => ({ api: { sesiones: { historial: vi.fn() } } }))

const historial = vi.mocked(api.sesiones.historial)

type Pedido = SesionHistorial['pedidos'][number]

const hoy = new Date()
const iso = (horas: number, minutos = 0, diasAtras = 0) => {
  const d = new Date(hoy)
  d.setDate(d.getDate() - diasAtras)
  d.setHours(horas, minutos, 0, 0)
  return d.toISOString()
}

function pedido(id: string, extra: Partial<Pedido> = {}): Pedido {
  return {
    id,
    estado: 'entregado',
    createdAt: iso(10, 10),
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

const MESA_4: SesionHistorial = {
  sesionId: 'ses-4', mesaNumero: '4', iniciadaEn: iso(10, 0), cerradaEn: iso(11, 0), cantidadPedidos: 1, totalSesion: 3000, pedidos: [pedido('abcd1234')],
}
const MESA_12: SesionHistorial = {
  sesionId: 'ses-12',
  mesaNumero: '12',
  iniciadaEn: iso(9, 0, 3),
  cerradaEn: iso(9, 40, 3),
  cantidadPedidos: 2,
  totalSesion: 1500,
  pedidos: [
    pedido('ed1t0001', {
      tieneEdiciones: true,
      items: [
        { id: 'e-i1', cantidad: 3, cantidadEditada: 1, precioUnitario: 500, itemNombre: 'Empanada', mods: [] },
        { id: 'e-i2', cantidad: 1, cantidadEditada: 0, precioUnitario: 800, itemNombre: 'Gaseosa', mods: [{ accion: 'AGREGAR', ingredienteNombre: 'Limón' }] },
      ],
      ediciones: [
        {
          id: 'ed-1',
          justificacion: 'Se cargó de más',
          creadoEn: iso(9, 20, 3),
          editor: { nombre: 'Gerente', tipo: 'gerente' },
          itemsEliminados: [
            { itemNombre: 'Empanada', cantidadAntes: 3, cantidadDespues: 1, precioUnitario: 500, esAnulacion: false },
            { itemNombre: 'Gaseosa', cantidadAntes: 1, cantidadDespues: 0, precioUnitario: 800, esAnulacion: true },
          ],
        },
      ],
    }),
    pedido('anul0001', { estado: 'anulado' }),
  ],
}

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/mozo/historial']}>
      <Routes>
        <Route path="/mozo/historial" element={<HistorialPage />} />
        <Route path="/mozo" element={<p>panel del mozo</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function abrirCon(sesiones: SesionHistorial[] = [MESA_4, MESA_12]) {
  historial.mockResolvedValue(sesiones)
  abrir()
  await screen.findByText(sesiones[0].mesaNumero)
}

const tarjeta = (numero: string) => screen.getByText(numero, { selector: 'span, div' })
const kpi = (titulo: string) => screen.getByText(titulo).nextElementSibling?.textContent

beforeEach(() => {
  usuario = { nombre: 'Ana Pérez', email: 'ana@menyu.com' }
  restauranteActual = 'rest-1'
  vi.clearAllMocks()
})

describe('HistorialPage (mozo)', () => {
  it('sin restaurante no consulta; el encabezado muestra al mozo y vuelve al panel', () => {
    restauranteActual = null

    abrir()

    expect(historial).not.toHaveBeenCalled()
    expect(screen.getByText('Historial de sesiones')).toBeInTheDocument()
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('AP')).toBeInTheDocument()
    fireEvent.click(document.querySelector('.lucide-chevron-left')!.closest('button')!)
    expect(screen.getByText('panel del mozo')).toBeInTheDocument()
  })

  it('sin nombre usa el email, y sin usuario dice "Mozo"', () => {
    restauranteActual = null
    usuario = { email: 'juan@menyu.com' }
    const { unmount } = abrir()
    expect(screen.getByText('juan@menyu.com')).toBeInTheDocument()
    unmount()

    usuario = null
    abrir()
    // Nombre y rol dicen "Mozo".
    expect(screen.getAllByText('Mozo')).toHaveLength(2)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('lista las sesiones de hoy con duración, pedidos, total, marcas y los indicadores', async () => {
    await abrirCon()

    const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    expect(historial).toHaveBeenCalledWith('rest-1', fecha, fecha)
    expect(screen.getByText('1h')).toBeInTheDocument()
    expect(screen.getByText('40 min')).toBeInTheDocument()
    expect(screen.getByText('1 pedido')).toBeInTheDocument()
    expect(screen.getByText('2 pedidos')).toBeInTheDocument()
    expect(screen.getByText('con anulaciones')).toBeInTheDocument()
    expect(screen.getByText('con ediciones')).toBeInTheDocument()
    expect(kpi('Sesiones')).toBe('2')
    expect(kpi('Editadas')).toBe('1')
    expect(kpi('Anulados')).toBe('1')
  })

  it('cada período pide otro rango; volver a "Hoy" repite el primero', async () => {
    await abrirCon()

    for (const periodo of ['Ayer', 'Última semana', 'Último mes', 'Hoy']) {
      fireEvent.click(screen.getByRole('button', { name: periodo }))
    }

    await vi.waitFor(() => expect(historial).toHaveBeenCalledTimes(5))
    const rangos = historial.mock.calls.map(([, desde, hasta]) => `${desde}|${hasta}`)
    expect(new Set(rangos).size).toBe(4)
    expect(rangos[4]).toBe(rangos[0])
    const [, desdeAyer, hastaAyer] = historial.mock.calls[1]
    expect(desdeAyer).toBe(hastaAyer)
  })

  it('el buscador filtra por mesa; la X lo limpia', async () => {
    await abrirCon()
    const buscador = screen.getByPlaceholderText('Buscar por mesa...')

    fireEvent.focus(buscador)
    fireEvent.change(buscador, { target: { value: '12' } })
    expect(screen.queryByText('1 pedido')).not.toBeInTheDocument()
    fireEvent.click(buscador.parentElement!.querySelector('button')!)
    fireEvent.blur(buscador)
    expect(screen.getByText('1 pedido')).toBeInTheDocument()
  })

  it('mientras carga lo dice; si falla, no hay sesiones', async () => {
    historial.mockRejectedValue(new Error('caído'))

    abrir()

    expect(screen.getByText('Cargando sesiones…')).toBeInTheDocument()
    expect(await screen.findByText('No hay sesiones cerradas en este período.')).toBeInTheDocument()
  })

  describe('detalle', () => {
    it('muestra los pedidos con estado, ítems y modificaciones; se cierra tocando afuera', async () => {
      await abrirCon()

      fireEvent.click(tarjeta('4'))

      expect(screen.getByText('Mesa 4')).toBeInTheDocument()
      expect(screen.getByText('#ABCD')).toBeInTheDocument()
      expect(screen.getByText('2× Milanesa')).toBeInTheDocument()
      expect(screen.getByText('sin Cebolla')).toBeInTheDocument()
      expect(screen.getByText('+ Hielo')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Mesa 4').closest('div[style*="position: fixed"]') as HTMLElement)
      expect(screen.queryByText('Mesa 4')).not.toBeInTheDocument()
    })

    it('un pedido editado muestra lo que quedó, lo quitado y sus ediciones; no ofrece editar', async () => {
      await abrirCon()
      fireEvent.click(tarjeta('12'))

      expect(screen.getByText('Editado')).toBeInTheDocument()
      expect(screen.getAllByText('Anulado').length).toBeGreaterThan(0)
      expect(screen.getByText('1× Empanada')).toBeInTheDocument()
      expect(screen.getByText('2× Empanada')).toBeInTheDocument()
      expect(screen.getByText('1× Gaseosa')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Editar pedido' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Ver ediciones \(1\)/ }))
      expect(screen.getByText('Gerente · gerente')).toBeInTheDocument()
      expect(screen.getByText('"Se cargó de más"')).toBeInTheDocument()
      expect(screen.getByText('Empanada: 3 → 1')).toBeInTheDocument()
      expect(screen.getByText('anulado')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /Ver ediciones \(1\)/ }))
      expect(screen.queryByText('Gerente · gerente')).not.toBeInTheDocument()
    })

    it('una sesión sin pedidos lo dice; la X cierra', async () => {
      await abrirCon([{ ...MESA_4, sesionId: 'ses-7', mesaNumero: '7', pedidos: [], cantidadPedidos: 0 }])

      fireEvent.click(tarjeta('7'))
      expect(screen.getByText('Sin pedidos registrados.')).toBeInTheDocument()
      fireEvent.click(document.querySelector('div[style*="position: fixed"] .lucide-x')!.closest('button')!)
      expect(screen.queryByText('Sin pedidos registrados.')).not.toBeInTheDocument()
    })
  })
})
