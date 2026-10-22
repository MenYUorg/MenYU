import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { Restaurante } from '@menyu/types'
import { api, type MesaConQr, type SesionActiva } from '../../../services/api'
import { TablesPage } from './TablesPage'

let rolActual: 'OWNER' | 'GERENTE' | null = 'OWNER'

vi.mock('../../../store/contextStore', async () => {
  const { create } = await vi.importActual<typeof import('zustand')>('zustand')
  const useContextStore = create(() => ({
    selectedRestauranteId: 'rest-1' as string | null,
    restaurantes: [{ id: 'rest-1', nombre: 'La Parrilla', modoSesion: 'abierto' }] as { id: string; nombre: string; modoSesion: string }[],
  }))
  return { useContextStore, useRolActual: () => rolActual }
})

vi.mock('../../../services/api', () => ({
  api: {
    mesas: { list: vi.fn(), create: vi.fn(), delete: vi.fn(), regenerarQr: vi.fn() },
    sessions: { mesaActiva: vi.fn(), cerrarMesa: vi.fn() },
    restaurantes: { update: vi.fn() },
  },
}))

const { useContextStore } = await import('../../../store/contextStore')
const mesasApi = vi.mocked(api.mesas)
const sesionesApi = vi.mocked(api.sessions)
const actualizarRestaurante = vi.mocked(api.restaurantes.update)

const mesa = (id: string, numero: string, estado = 'libre'): MesaConQr => ({
  id,
  restauranteId: 'rest-1',
  numero,
  qrToken: `qr-${id}`,
  pin: `00${numero}`.slice(-4),
  estado,
  activo: true,
  qrImage: `data:image/png;base64,${id}`,
})

const sesion = (clientes: number, minutos: number, total: number): SesionActiva => ({
  sesionId: 'ses-1',
  creadaEn: new Date(Date.now() - minutos * 60000).toISOString(),
  cantidadClientes: clientes,
  totalAcumulado: total,
  llamadoActivo: null,
  pedidos: [],
})

const LIBRE = mesa('m1', '1')
const OCUPADA = mesa('m2', '2', 'ocupada')
const OTRA_OCUPADA = mesa('m3', '3', 'ocupada')

async function abrir(mesas: MesaConQr[] = [LIBRE, OCUPADA]) {
  mesasApi.list.mockResolvedValue(mesas)
  render(<TablesPage />)
  await screen.findByText(`${mesas.length} mesas · ${mesas.filter((m) => m.estado === 'ocupada').length} ocupadas`)
}

const tile = (numero: string) => screen.getByText(numero, { selector: 'span' }).parentElement!.parentElement as HTMLElement
const fondo = (texto: string | RegExp) => screen.getByText(texto).closest('div[style*="position: fixed"]') as HTMLElement

beforeEach(() => {
  rolActual = 'OWNER'
  vi.clearAllMocks()
  useContextStore.setState({
    selectedRestauranteId: 'rest-1',
    restaurantes: [{ id: 'rest-1', nombre: 'La Parrilla', modoSesion: 'abierto' } as unknown as Restaurante],
  })
  sesionesApi.mesaActiva.mockResolvedValue(sesion(3, 75, 12500))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TablesPage', () => {
  it('sin restaurante elegido pide elegir uno', () => {
    useContextStore.setState({ selectedRestauranteId: null })

    render(<TablesPage />)

    expect(screen.getByText('Seleccioná un restaurante para ver las mesas')).toBeInTheDocument()
    expect(mesasApi.list).not.toHaveBeenCalled()
  })

  describe('grilla', () => {
    it('muestra las mesas libres y las ocupadas con clientes, tiempo y total de la sesión', async () => {
      await abrir()

      expect(within(tile('1')).getByText('Libre')).toBeInTheDocument()
      expect(within(tile('1')).getByText('Mesa disponible')).toBeInTheDocument()
      expect(within(tile('2')).getByText('Ocupada')).toBeInTheDocument()
      expect(await within(tile('2')).findByText('3 clientes')).toBeInTheDocument()
      expect(within(tile('2')).getByText('1h 15m')).toBeInTheDocument()
      expect(within(tile('2')).getByText('$12.500')).toBeInTheDocument()
      expect(sesionesApi.mesaActiva).toHaveBeenCalledTimes(1)
      expect(sesionesApi.mesaActiva).toHaveBeenCalledWith('m2')
    })

    it('mientras llega la sesión de una mesa ocupada dice "Cargando..."; con un solo cliente y minutos', async () => {
      let entregar: (s: SesionActiva | null) => void = () => {}
      sesionesApi.mesaActiva.mockReturnValueOnce(new Promise((r) => { entregar = r })).mockRejectedValueOnce(new Error('caída'))
      mesasApi.list.mockResolvedValue([OCUPADA, OTRA_OCUPADA])

      render(<TablesPage />)

      expect(await screen.findByText('Cargando mesas...')).toBeInTheDocument()
      await act(async () => { entregar(sesion(1, 5, 900)) })
      expect(within(tile('2')).getByText('1 cliente')).toBeInTheDocument()
      expect(within(tile('2')).getByText('5m')).toBeInTheDocument()
      expect(within(tile('3')).getByText('Cargando...')).toBeInTheDocument()
    })

    it('sin mesas invita a crear la primera', async () => {
      // Con 0 mesas el encabezado "0 mesas · 0 ocupadas" ya se ve mientras carga: hay que esperar la grilla.
      await abrir([])
      expect(await screen.findByText('No hay mesas. Creá la primera.')).toBeInTheDocument()
    })

    it('si la carga falla muestra el error', async () => {
      mesasApi.list.mockRejectedValueOnce(new Error('Sin conexión')).mockRejectedValueOnce('raro')

      const { unmount } = render(<TablesPage />)
      expect(await screen.findByText('Sin conexión')).toBeInTheDocument()
      unmount()

      render(<TablesPage />)
      expect(await screen.findByText('Error al cargar mesas')).toBeInTheDocument()
    })

    it('cada 30 s vuelve a pedir las sesiones de las mesas ocupadas', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await abrir()
      await vi.waitFor(() => expect(sesionesApi.mesaActiva).toHaveBeenCalledTimes(1))

      await act(async () => { await vi.advanceTimersByTimeAsync(30000) })

      expect(sesionesApi.mesaActiva).toHaveBeenCalledTimes(2)
    })

    it('un GERENTE no ve la configuración ni "+ Nueva mesa"', async () => {
      rolActual = 'GERENTE'
      await abrir()

      expect(screen.queryByRole('button', { name: '+ Nueva mesa' })).not.toBeInTheDocument()
      expect(document.querySelector('.lucide-settings')).toBeNull()
    })
  })

  describe('cerrar una mesa ocupada', () => {
    it('pide confirmación y, al confirmar, la deja libre', async () => {
      sesionesApi.cerrarMesa.mockResolvedValue({ ok: true } as never)
      await abrir()

      fireEvent.click(within(tile('2')).getByRole('button', { name: 'Cerrar mesa' }))
      expect(screen.getByText('¿Cerrar mesa 2?')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Sí, cerrar mesa' }))

      expect(await within(tile('2')).findByText('Libre')).toBeInTheDocument()
      expect(sesionesApi.cerrarMesa).toHaveBeenCalledWith('m2')
      expect(screen.queryByText('¿Cerrar mesa 2?')).not.toBeInTheDocument()
      expect(screen.getByText('2 mesas · 0 ocupadas')).toBeInTheDocument()
    })

    it('"Cancelar" o tocar afuera no la cierran', async () => {
      await abrir()

      fireEvent.click(within(tile('2')).getByRole('button', { name: 'Cerrar mesa' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      fireEvent.click(within(tile('2')).getByRole('button', { name: 'Cerrar mesa' }))
      fireEvent.click(fondo('¿Cerrar mesa 2?'))

      expect(screen.queryByText('¿Cerrar mesa 2?')).not.toBeInTheDocument()
      expect(sesionesApi.cerrarMesa).not.toHaveBeenCalled()
    })
  })

  describe('detalle de una mesa', () => {
    it('muestra el PIN y el QR; "Imprimir QR" lo abre en otra pestaña', async () => {
      const abrirVentana = vi.spyOn(window, 'open').mockImplementation(() => null)
      await abrir()

      fireEvent.click(tile('1'))

      expect(screen.getByText('Mesa 1')).toBeInTheDocument()
      expect(screen.getByText('001')).toBeInTheDocument()
      expect(screen.getByAltText('QR mesa 1')).toHaveAttribute('src', LIBRE.qrImage)
      fireEvent.click(screen.getByRole('button', { name: /Imprimir QR/ }))
      expect(abrirVentana).toHaveBeenCalledWith(LIBRE.qrImage, '_blank')
      abrirVentana.mockRestore()
    })

    it('regenera el QR y muestra el nuevo; si falla muestra el error', async () => {
      mesasApi.regenerarQr.mockResolvedValueOnce({ ...LIBRE, qrImage: 'data:nuevo' }).mockRejectedValueOnce('raro')
      await abrir()
      fireEvent.click(tile('1'))

      fireEvent.click(screen.getByRole('button', { name: 'Regenerar QR' }))
      await vi.waitFor(() => expect(screen.getByAltText('QR mesa 1')).toHaveAttribute('src', 'data:nuevo'))
      expect(mesasApi.regenerarQr).toHaveBeenCalledWith('m1')

      fireEvent.click(screen.getByRole('button', { name: 'Regenerar QR' }))
      expect(await screen.findByText('Error al regenerar QR')).toBeInTheDocument()
    })

    it('con la mesa ocupada no deja regenerar ni eliminar', async () => {
      await abrir()

      fireEvent.click(screen.getByText('2', { selector: 'span' }))

      expect(screen.getByText('No se puede regenerar ni eliminar con mesa ocupada')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Regenerar QR' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Eliminar mesa' })).toBeDisabled()
    })

    it('eliminar pide confirmación, la saca de la grilla y cierra el detalle', async () => {
      mesasApi.delete.mockResolvedValue(undefined as never)
      await abrir()
      fireEvent.click(tile('1'))

      fireEvent.click(screen.getByRole('button', { name: 'Eliminar mesa' }))
      expect(screen.getByText('¿Eliminar mesa 1?')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }))

      await vi.waitFor(() => expect(screen.queryByText('Mesa 1')).not.toBeInTheDocument())
      expect(mesasApi.delete).toHaveBeenCalledWith('m1')
      expect(screen.getByText('1 mesas · 1 ocupadas')).toBeInTheDocument()
    })

    it('si eliminar falla muestra el error; "Cancelar" en la confirmación no elimina', async () => {
      mesasApi.delete.mockRejectedValue(new Error('Tiene pedidos'))
      await abrir()
      fireEvent.click(tile('1'))

      fireEvent.click(screen.getByRole('button', { name: 'Eliminar mesa' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByText('¿Eliminar mesa 1?')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Eliminar mesa' }))
      fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }))
      expect(await screen.findByText('Tiene pedidos')).toBeInTheDocument()
    })

    it('un GERENTE no puede eliminar; el detalle se cierra con la X o tocando afuera', async () => {
      rolActual = 'GERENTE'
      await abrir()
      fireEvent.click(tile('1'))

      expect(screen.queryByRole('button', { name: 'Eliminar mesa' })).not.toBeInTheDocument()
      fireEvent.click(fondo('Mesa 1'))
      expect(screen.queryByText('Mesa 1')).not.toBeInTheDocument()

      fireEvent.click(tile('1'))
      fireEvent.click(screen.getByText('Mesa 1').parentElement!.querySelector('button')!)
      expect(screen.queryByText('Mesa 1')).not.toBeInTheDocument()
    })
  })

  describe('nueva mesa', () => {
    it('sin número no deja crear; con número la crea y la suma a la grilla', async () => {
      mesasApi.create.mockResolvedValue(mesa('m9', '9'))
      await abrir()

      fireEvent.click(screen.getByRole('button', { name: '+ Nueva mesa' }))
      expect(screen.getByRole('button', { name: 'Crear mesa' })).toBeDisabled()
      fireEvent.change(screen.getByPlaceholderText('Ej: 1'), { target: { value: '9' } })
      fireEvent.click(screen.getByRole('button', { name: 'Crear mesa' }))

      expect(await screen.findByText('9', { selector: 'span' })).toBeInTheDocument()
      expect(mesasApi.create).toHaveBeenCalledWith({ restauranteId: 'rest-1', numero: '9' })
      expect(screen.queryByText('Nueva mesa')).not.toBeInTheDocument()
    })

    it('si el servidor rechaza muestra el error; se cierra con "Cancelar" o tocando afuera', async () => {
      mesasApi.create.mockRejectedValueOnce(new Error('Ya existe la mesa 1')).mockRejectedValueOnce('raro')
      await abrir()
      fireEvent.click(screen.getByRole('button', { name: '+ Nueva mesa' }))

      fireEvent.change(screen.getByPlaceholderText('Ej: 1'), { target: { value: '1' } })
      fireEvent.click(screen.getByRole('button', { name: 'Crear mesa' }))
      expect(await screen.findByText('Ya existe la mesa 1')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Crear mesa' }))
      expect(await screen.findByText('Error al crear mesa')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByText('Nueva mesa')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '+ Nueva mesa' }))
      fireEvent.click(fondo('Nueva mesa'))
      expect(screen.queryByText('Nueva mesa')).not.toBeInTheDocument()
    })
  })

  describe('configuración del modo de acceso (OWNER)', () => {
    const abrirConfig = () => fireEvent.click(document.querySelector('.lucide-settings')!.closest('button')!)

    it('cambia a seguro, lo guarda en el restaurante y avisa "Guardado" por 2 s', async () => {
      actualizarRestaurante.mockResolvedValue({} as never)
      await abrir()
      vi.useFakeTimers({ shouldAdvanceTime: true })

      abrirConfig()
      expect(screen.getByText('Configuración del restaurante')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Abierto'))
      expect(actualizarRestaurante).not.toHaveBeenCalled()

      await act(async () => { fireEvent.click(screen.getByText('Seguro')) })
      expect(actualizarRestaurante).toHaveBeenCalledWith('rest-1', { modoSesion: 'seguro' })
      expect(screen.getByText('Guardado')).toBeInTheDocument()
      expect(useContextStore.getState().restaurantes[0].modoSesion).toBe('seguro')

      await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
      expect(screen.queryByText('Guardado')).not.toBeInTheDocument()
    })

    it('si guardar falla vuelve al modo anterior; se cierra con la X', async () => {
      actualizarRestaurante.mockRejectedValue(new Error('caído'))
      await abrir()

      abrirConfig()
      await act(async () => { fireEvent.click(screen.getByText('Seguro')) })

      expect(screen.queryByText('Guardado')).not.toBeInTheDocument()
      expect(useContextStore.getState().restaurantes[0].modoSesion).toBe('abierto')
      fireEvent.mouseEnter(screen.getByText('Seguro'))
      fireEvent.mouseLeave(screen.getByText('Seguro'))
      fireEvent.click(screen.getByText('Configuración del restaurante').parentElement!.parentElement!.querySelector('button')!)
      expect(screen.queryByText('Configuración del restaurante')).not.toBeInTheDocument()
    })
  })
})
