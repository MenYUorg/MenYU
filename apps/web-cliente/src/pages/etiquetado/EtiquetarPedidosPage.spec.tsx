import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Comensal, ItemEtiquetado } from '../../hooks/useEtiquetado'
import { EtiquetarPedidosPage } from './EtiquetarPedidosPage'

const etiquetar = vi.fn()
const desetiquetar = vi.fn()
const agregarComensal = vi.fn()
const borrarComensal = vi.fn()
let estado: { items: ItemEtiquetado[]; comensales: Comensal[]; loading: boolean; error: string | null }

vi.mock('../../hooks/useEtiquetado', () => ({
  useEtiquetado: (sesionId: string) => ({ ...estado, sesionId, etiquetar, desetiquetar, agregarComensal, borrarComensal }),
}))
vi.mock('../../store/sessionStore', () => ({
  useSessionStore: (selector: (s: { sesionId: string | null }) => unknown) => selector({ sesionId: 'ses-1' }),
}))
vi.mock('../../store/comensalStore', () => ({
  useComensalStore: (selector: (s: { comensalId: string | null }) => unknown) => selector({ comensalId: 'c-yo' }),
}))

const comensal = (id: string, nombre: string, creadoPor: string | null = null): Comensal => ({
  id, sesionId: 'ses-1', clienteId: null, nombre, esOwner: false, creadoPorComensalId: creadoPor, createdAt: '2026-10-18T20:00:00Z',
})
const YO = comensal('c-yo', 'Coty')
const SOL = comensal('c-sol', 'Sol', 'c-yo')
const LUIS = comensal('c-luis', 'Luis', 'c-otro')

const item = (id: string, nombre: string, cantidad: number, precio: number, etiquetas: Comensal[] = []): ItemEtiquetado => ({
  pedidoItemId: id, nombre, cantidad, precioUnitario: precio, etiquetas,
})

function Destino() {
  const { pathname, search } = useLocation()
  return <p>destino {pathname}{search}</p>
}

function abrir(ruta = '/etiquetar') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/etiquetar" element={<EtiquetarPedidosPage />} />
        <Route path="*" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  )
}

const tarjeta = (nombre: string) => screen.getByText(new RegExp(`^${nombre} ×`)).parentElement!.parentElement as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  estado = {
    items: [
      item('pi-1', 'Milanesa', 2, 1500, [YO]),
      item('pi-2', 'Pizza', 1, 3000, [YO, SOL]),
      item('pi-3', 'Agua', 1, 500),
    ],
    comensales: [YO, SOL, LUIS],
    loading: false,
    error: null,
  }
  etiquetar.mockResolvedValue(undefined)
  desetiquetar.mockResolvedValue(undefined)
})

describe('EtiquetarPedidosPage', () => {
  it('mientras carga muestra el encabezado y un indicador; "volver" lleva al menú', () => {
    estado.loading = true

    abrir()

    expect(screen.getByText('Etiquetar pedidos')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Volver al menú' }))
    expect(screen.getByText('destino /menu')).toBeInTheDocument()
  })

  it('si falla la carga muestra el error y "Reintentar" recarga la página', () => {
    estado.error = 'No se pudieron cargar los pedidos'
    const recargar = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload: recargar })

    abrir()

    expect(screen.getByText('No se pudieron cargar los pedidos')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(recargar).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('sin pedidos invita a ver el menú', () => {
    estado.items = []

    abrir()

    expect(screen.getByText('Todavía no hay pedidos para etiquetar')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver el menú' }))
    expect(screen.getByText('destino /menu')).toBeInTheDocument()
  })

  describe('lista', () => {
    it('muestra cada plato con su total, un chip por comensal y el estado de la división', () => {
      abrir()

      expect(screen.getByText('Etiquetá qué pediste vos para calcular tu parte de la cuenta.')).toBeInTheDocument()
      expect(within(tarjeta('Milanesa')).getByText('$3000.00')).toBeInTheDocument()
      expect(within(tarjeta('Pizza')).getByText('Se divide en partes iguales entre los 2 etiquetados')).toBeInTheDocument()
      expect(within(tarjeta('Agua')).getByText('Sin etiquetar todavía')).toBeInTheDocument()
      expect(within(tarjeta('Agua')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Coty', 'Sol', 'Luis'])
      expect(screen.queryByRole('button', { name: /Armar mensaje/ })).not.toBeInTheDocument()
    })

    it('tocar un chip etiqueta, o desetiqueta si ya estaba; mientras tanto se deshabilita', async () => {
      let terminar: () => void = () => {}
      etiquetar.mockReturnValueOnce(new Promise<void>((r) => { terminar = r }))
      abrir()

      fireEvent.click(within(tarjeta('Agua')).getByRole('button', { name: 'Sol' }))
      expect(etiquetar).toHaveBeenCalledWith('pi-3', 'c-sol')
      const enCurso = within(tarjeta('Agua')).getByRole('button', { name: '…' })
      expect(enCurso).toBeDisabled()
      fireEvent.click(enCurso)
      expect(etiquetar).toHaveBeenCalledTimes(1)
      await act(async () => { terminar() })
      expect(within(tarjeta('Agua')).getByRole('button', { name: 'Sol' })).toBeEnabled()

      fireEvent.click(within(tarjeta('Milanesa')).getByRole('button', { name: 'Coty' }))
      await vi.waitFor(() => expect(desetiquetar).toHaveBeenCalledWith('pi-1', 'c-yo'))
    })
  })

  describe('comensales', () => {
    it('solo se pueden borrar los que creé yo, con confirmación', async () => {
      borrarComensal.mockResolvedValue(undefined)
      abrir()

      expect(screen.queryByRole('button', { name: 'Borrar a Luis' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Borrar a Coty' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Borrar a Sol' }))
      expect(screen.getByText('¿Borrar Sol?')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByText('¿Borrar Sol?')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Borrar a Sol' }))
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar borrado de Sol' }))
      await vi.waitFor(() => expect(borrarComensal).toHaveBeenCalledWith('c-sol'))
      await vi.waitFor(() => expect(screen.queryByText('¿Borrar Sol?')).not.toBeInTheDocument())
    })

    it('si borrar falla muestra el error y deja la confirmación', async () => {
      borrarComensal.mockRejectedValueOnce(new Error('Tiene platos etiquetados')).mockRejectedValueOnce('raro')
      abrir()

      fireEvent.click(screen.getByRole('button', { name: 'Borrar a Sol' }))
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar borrado de Sol' }))
      expect(await screen.findByText('Tiene platos etiquetados')).toBeInTheDocument()
      expect(screen.getByText('¿Borrar Sol?')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Confirmar borrado de Sol' }))
      expect(await screen.findByText('Error al borrar el comensal')).toBeInTheDocument()
    })

    it('mientras borra no deja confirmar de nuevo', async () => {
      let terminar: () => void = () => {}
      borrarComensal.mockReturnValueOnce(new Promise<void>((r) => { terminar = r }))
      abrir()

      fireEvent.click(screen.getByRole('button', { name: 'Borrar a Sol' }))
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar borrado de Sol' }))
      expect(screen.getByRole('button', { name: 'Confirmar borrado de Sol' })).toBeDisabled()
      await act(async () => { terminar() })
      expect(borrarComensal).toHaveBeenCalledTimes(1)
    })

    it('agrega un comensal con el botón o con Enter; vacío no se puede', async () => {
      agregarComensal.mockResolvedValue(undefined)
      abrir()

      fireEvent.click(screen.getByRole('button', { name: '+ Agregar' }))
      expect(screen.getByRole('button', { name: 'Agregar' })).toBeDisabled()
      fireEvent.keyDown(screen.getByPlaceholderText('Nombre'), { key: 'Enter' })
      expect(agregarComensal).not.toHaveBeenCalled()

      fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: '  Mica  ' } })
      fireEvent.keyDown(screen.getByPlaceholderText('Nombre'), { key: 'a' })
      fireEvent.keyDown(screen.getByPlaceholderText('Nombre'), { key: 'Enter' })
      await vi.waitFor(() => expect(agregarComensal).toHaveBeenCalledWith('Mica'))
      await vi.waitFor(() => expect(screen.queryByPlaceholderText('Nombre')).not.toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: '+ Agregar' }))
      fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Juan' } })
      fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
      await vi.waitFor(() => expect(agregarComensal).toHaveBeenCalledWith('Juan'))
    })

    it('si agregar falla muestra el error; "Cancelar" lo borra y cierra el campo', async () => {
      agregarComensal.mockRejectedValueOnce(new Error('Ya existe Mica')).mockRejectedValueOnce('raro')
      abrir()
      fireEvent.click(screen.getByRole('button', { name: '+ Agregar' }))
      fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Mica' } })

      fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
      expect(await screen.findByText('Ya existe Mica')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
      expect(await screen.findByText('Error al agregar el comensal')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByText('Error al agregar el comensal')).not.toBeInTheDocument()
      expect(screen.queryByPlaceholderText('Nombre')).not.toBeInTheDocument()
    })

    it('mientras agrega no deja agregar otra vez', async () => {
      let terminar: () => void = () => {}
      agregarComensal.mockReturnValueOnce(new Promise<void>((r) => { terminar = r }))
      abrir()
      fireEvent.click(screen.getByRole('button', { name: '+ Agregar' }))
      fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Mica' } })

      fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
      fireEvent.keyDown(screen.getByPlaceholderText('Nombre'), { key: 'Enter' })
      expect(agregarComensal).toHaveBeenCalledTimes(1)
      await act(async () => { terminar() })
    })
  })

  describe('para armar el mensaje (?destino=mensaje)', () => {
    it('cuenta los platos sin etiquetar y sigue al mensaje por consumo', () => {
      abrir('/etiquetar?destino=mensaje')

      expect(screen.getByText(/Etiquetá quién pidió cada plato para armar el mensaje/)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Armar mensaje · 1 sin etiquetar' }))
      expect(screen.getByText('destino /dividir/mensaje?modo=por_consumo')).toBeInTheDocument()
    })

    it('con todo etiquetado dice "Armar mensaje"; sin nada etiquetado lo avisa', () => {
      estado.items = [item('pi-1', 'Milanesa', 1, 1500, [YO])]
      const { unmount } = abrir('/etiquetar?destino=mensaje')
      expect(screen.getByRole('button', { name: 'Armar mensaje' })).toBeInTheDocument()
      unmount()

      estado.items = [item('pi-1', 'Milanesa', 1, 1500)]
      abrir('/etiquetar?destino=mensaje')
      expect(screen.getByText('Todavía no etiquetaste ningún plato.')).toBeInTheDocument()
    })
  })
})
