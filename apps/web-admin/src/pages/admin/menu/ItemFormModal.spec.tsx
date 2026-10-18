import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ItemMenu } from '@menyu/types'
import { api } from '../../../services/api'
import { ItemFormModal } from './ItemFormModal'

let restauranteActual: string | null = 'rest-1'
vi.mock('../../../store/contextStore', () => ({
  useContextStore: () => ({ selectedRestauranteId: restauranteActual }),
}))

const tienda = {
  categorias: [{ id: 'cat-1', nombre: 'Principales' }, { id: 'cat-2', nombre: 'Postres' }] as { id: string; nombre: string }[],
  clasificaciones: [{ id: 'cl-veg', nombre: 'Vegetariano' }, { id: 'cl-tacc', nombre: 'Sin TACC' }] as { id: string; nombre: string }[],
  ingredientes: [
    { id: 'ing-queso', nombre: 'Queso rallado', esAlergeno: true },
    { id: 'ing-huevo', nombre: 'Huevo frito', esAlergeno: false },
    { id: 'ing-jamon', nombre: 'Jamón', esAlergeno: false },
  ],
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  uploadItemImage: vi.fn(),
  deleteItemImage: vi.fn(),
  createIngrediente: vi.fn(),
}
vi.mock('../../../store/menuStore', () => ({ useMenuStore: () => tienda }))

vi.mock('../../../services/api', () => ({
  api: {
    clasificaciones: { addToItem: vi.fn(), removeFromItem: vi.fn() },
    items: { addIngrediente: vi.fn(), updateIngrediente: vi.fn(), removeIngrediente: vi.fn() },
  },
}))

const clasifApi = vi.mocked(api.clasificaciones)
const itemsApi = vi.mocked(api.items)

const asociacion = (id: string, ingredienteId: string, extra: object = {}) => ({
  id, itemId: 'item-1', ingredienteId, esOriginal: true, esRemovible: true, esAgregable: false, precioExtra: '0', cantidad: 1, cantidadMin: 0, cantidadMax: 1, ...extra,
})

const MILANESA = {
  id: 'item-1',
  restauranteId: 'rest-1',
  categoriaId: 'cat-2',
  nombre: 'Milanesa',
  descripcion: 'Con papas',
  precioBase: 5000,
  precioDescuento: null,
  porcentajeDescuento: null,
  precioVigente: 5000,
  disponible: true,
  imagenUrl: 'https://storage.test/milanesa.png',
  clasificaciones: [{ clasificacionId: 'cl-veg' }],
  ingredientes: [
    asociacion('ii-queso', 'ing-queso', { ingrediente: { nombre: 'Queso rallado' } }),
    asociacion('ii-huevo', 'ing-huevo', { esOriginal: false, esRemovible: false, esAgregable: true, precioExtra: '300', cantidadMax: 2 }),
    asociacion('ii-raro', 'ing-borrado'),
  ],
} as unknown as ItemMenu

const onClose = vi.fn()
function abrir(item: ItemMenu | null = null, canDelete = true) {
  return render(<ItemFormModal open item={item} onClose={onClose} canDelete={canDelete} />)
}

const nombre = () => screen.getByPlaceholderText('Ej: Milanesa napolitana') as HTMLInputElement
const precio = () => screen.getByPlaceholderText('0.00') as HTMLInputElement
const escribir = (el: HTMLElement, valor: string) => fireEvent.change(el, { target: { value: valor } })
const filaIngrediente = (texto: string) => screen.getByText(texto).parentElement as HTMLElement
const guardar = (texto: 'Crear plato' | 'Guardar cambios') => act(async () => { fireEvent.click(screen.getByRole('button', { name: texto })) })

beforeEach(() => {
  vi.clearAllMocks()
  restauranteActual = 'rest-1'
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview') }))
  tienda.createItem.mockResolvedValue({ id: 'nuevo-1' })
  tienda.updateItem.mockResolvedValue({})
  tienda.uploadItemImage.mockResolvedValue({})
  itemsApi.addIngrediente.mockResolvedValue({ ...MILANESA, ingredientes: [asociacion('ii-jamon', 'ing-jamon', { esRemovible: false })] } as never)
  itemsApi.updateIngrediente.mockResolvedValue({} as never)
  itemsApi.removeIngrediente.mockResolvedValue(undefined as never)
  clasifApi.addToItem.mockResolvedValue(undefined as never)
  clasifApi.removeFromItem.mockResolvedValue(undefined as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ItemFormModal', () => {
  it('cerrado no muestra nada', () => {
    const { container } = render(<ItemFormModal open={false} item={null} onClose={onClose} canDelete />)

    expect(container).toBeEmptyDOMElement()
  })

  it('se cierra con la X o tocando afuera, no tocando adentro', () => {
    abrir()

    fireEvent.click(screen.getByText('Nuevo plato'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Nuevo plato').parentElement!.querySelector('button')!)
    fireEvent.click(screen.getByText('Nuevo plato').closest('div[style*="position: fixed"]') as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  describe('nuevo plato', () => {
    it('arranca vacío con la primera categoría; sin categorías lo avisa', () => {
      const { unmount } = abrir()
      expect(nombre().value).toBe('')
      expect(screen.getByRole('combobox')).toHaveValue('cat-1')
      expect(screen.getByText('Sin ingredientes asignados.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Eliminar plato/ })).not.toBeInTheDocument()
      unmount()

      const antes = tienda.categorias
      tienda.categorias = []
      abrir()
      expect(screen.getByText('No hay categorías. Creá una desde Gestionar catálogo.')).toBeInTheDocument()
      tienda.categorias = antes
    })

    it.each([
      ['sin nombre', '  ', '100', 'El nombre del plato es obligatorio'],
      ['sin precio', 'Pizza', '', 'Ingresá un precio válido'],
      ['con precio negativo', 'Pizza', '-1', 'Ingresá un precio válido'],
    ])('%s no lo crea', async (_, n, p, error) => {
      abrir()

      escribir(nombre(), n)
      escribir(precio(), p)
      await guardar('Crear plato')

      expect(screen.getByText(error)).toBeInTheDocument()
      expect(tienda.createItem).not.toHaveBeenCalled()
    })

    it('sin categoría elegida no lo crea', async () => {
      const antes = tienda.categorias
      tienda.categorias = []
      abrir()

      escribir(nombre(), 'Pizza')
      escribir(precio(), '100')
      await guardar('Crear plato')

      expect(screen.getByText('La categoría es obligatoria.')).toBeInTheDocument()
      tienda.categorias = antes
    })

    it('sin restaurante elegido no hace nada', async () => {
      restauranteActual = null
      abrir()

      escribir(nombre(), 'Pizza')
      escribir(precio(), '100')
      await guardar('Crear plato')

      expect(tienda.createItem).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })

    it('lo crea con imagen, dietas e ingredientes y se cierra', async () => {
      abrir()

      escribir(nombre(), '  Pizza  ')
      escribir(screen.getByPlaceholderText('Breve descripción del plato...'), '  Muzza  ')
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cat-2' } })
      escribir(precio(), '4200.5')
      const archivo = new File(['x'], 'pizza.png', { type: 'image/png' })
      await act(async () => { fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [archivo] } }) })
      expect(screen.getByAltText('preview')).toHaveAttribute('src', 'blob:preview')
      fireEvent.click(screen.getByRole('button', { name: 'Sin TACC' }))

      fireEvent.click(screen.getByRole('button', { name: '+ Agregar ingrediente' }))
      escribir(screen.getByPlaceholderText('Buscar ingrediente...'), 'que')
      await act(async () => { fireEvent.click(screen.getByText('Queso rallado')) })
      fireEvent.click(within(filaIngrediente('Queso rallado')).getByRole('button', { name: 'Removible' }))
      fireEvent.click(screen.getByRole('button', { name: '+ Agregar ingrediente' }))
      escribir(screen.getByPlaceholderText('Buscar ingrediente...'), 'huevo')
      await act(async () => { fireEvent.click(screen.getByText('Huevo frito')) })
      const huevo = filaIngrediente('Huevo frito')
      fireEvent.click(within(huevo).getByRole('button', { name: 'Agregable' }))
      const [extra, maximo] = within(filaIngrediente('Huevo frito')).getAllByRole('spinbutton')
      escribir(extra, '350')
      escribir(maximo, '3')

      await guardar('Crear plato')

      expect(tienda.createItem).toHaveBeenCalledWith({
        restauranteId: 'rest-1', nombre: 'Pizza', descripcion: 'Muzza', categoriaId: 'cat-2', precioBase: 4200.5, disponible: true,
      })
      expect(tienda.uploadItemImage).toHaveBeenCalledWith('nuevo-1', archivo)
      expect(clasifApi.addToItem).toHaveBeenCalledWith('nuevo-1', 'cl-tacc')
      expect(itemsApi.addIngrediente).toHaveBeenCalledWith('nuevo-1', expect.objectContaining({ ingredienteId: 'ing-queso', esOriginal: true, esRemovible: true, esAgregable: false }))
      expect(itemsApi.addIngrediente).toHaveBeenCalledWith('nuevo-1', expect.objectContaining({ ingredienteId: 'ing-huevo', esOriginal: false, esAgregable: true, precioExtra: 350, cantidadMax: 3 }))
      expect(onClose).toHaveBeenCalled()
    })

    it('un ingrediente sin marcar como removible ni agregable no deja crear', async () => {
      abrir()
      escribir(nombre(), 'Pizza')
      escribir(precio(), '100')
      fireEvent.click(screen.getByRole('button', { name: '+ Agregar ingrediente' }))
      await act(async () => { fireEvent.click(screen.getByText('Jamón')) })

      await guardar('Crear plato')

      expect(screen.getByText('Todos los ingredientes deben ser removibles o agregables.')).toBeInTheDocument()
    })

    it('la imagen pendiente se puede quitar; un ingrediente agregado se puede sacar', async () => {
      abrir()
      await act(async () => { fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], 'a.png')] } }) })
      fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }))
      fireEvent.click(screen.getByRole('button', { name: 'Quitar' }))
      expect(screen.getByText('Subir imagen (opcional)')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Subir imagen (opcional)'))
      await act(async () => { fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [] } }) })

      fireEvent.click(screen.getByRole('button', { name: '+ Agregar ingrediente' }))
      await act(async () => { fireEvent.click(screen.getByText('Jamón')) })
      await act(async () => { fireEvent.click(filaIngrediente('Jamón').querySelector('.lucide-trash-2')!.closest('button')!) })
      expect(screen.queryByText('Jamón')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Sin TACC' }))
      fireEvent.click(screen.getByRole('button', { name: 'Sin TACC' }))
      expect(clasifApi.addToItem).not.toHaveBeenCalled()
    })

    it('si crear falla muestra el error del servidor (o el genérico)', async () => {
      tienda.createItem.mockRejectedValueOnce(new Error('Ya existe un ítem con ese nombre')).mockRejectedValueOnce('raro')
      abrir()
      escribir(nombre(), 'Pizza')
      escribir(precio(), '100')

      await guardar('Crear plato')
      expect(screen.getByText('Ya existe un ítem con ese nombre')).toBeInTheDocument()
      await guardar('Crear plato')
      expect(screen.getByText('Error al guardar')).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('buscar y crear ingredientes', () => {
    it('busca por inicio de palabra y marca los alérgenos; Escape y clic afuera cierran', async () => {
      abrir()
      fireEvent.click(screen.getByRole('button', { name: '+ Agregar ingrediente' }))

      // Vacío lista los primeros ingredientes del restaurante.
      expect(screen.getByText('Jamón')).toBeInTheDocument()
      escribir(screen.getByPlaceholderText('Buscar ingrediente...'), 'frito')
      expect(screen.getByText('Huevo frito')).toBeInTheDocument()
      expect(screen.queryByText('Jamón')).not.toBeInTheDocument()
      escribir(screen.getByPlaceholderText('Buscar ingrediente...'), 'rallado')
      expect(screen.getByText('ALÉRGENO')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '×' }))
      expect(screen.getByPlaceholderText('Buscar ingrediente...')).toHaveValue('')

      fireEvent.keyDown(screen.getByPlaceholderText('Buscar ingrediente...'), { key: 'a' })
      fireEvent.keyDown(screen.getByPlaceholderText('Buscar ingrediente...'), { key: 'Escape' })
      expect(screen.queryByPlaceholderText('Buscar ingrediente...')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '+ Agregar ingrediente' }))
      fireEvent.mouseDown(screen.getByPlaceholderText('Buscar ingrediente...'))
      expect(screen.getByPlaceholderText('Buscar ingrediente...')).toBeInTheDocument()
      fireEvent.mouseDown(document.body)
      expect(screen.queryByPlaceholderText('Buscar ingrediente...')).not.toBeInTheDocument()
    })

    it('si no existe ofrece crearlo y agregarlo; con el nombre exacto no', async () => {
      tienda.createIngrediente.mockResolvedValue({ id: 'ing-nuevo', nombre: 'Rúcula' })
      abrir()
      fireEvent.click(screen.getByRole('button', { name: '+ Agregar ingrediente' }))

      escribir(screen.getByPlaceholderText('Buscar ingrediente...'), 'jamón')
      expect(screen.queryByText(/Crear y agregar/)).not.toBeInTheDocument()
      escribir(screen.getByPlaceholderText('Buscar ingrediente...'), 'zzz')
      expect(screen.queryByText('Sin coincidencias')).not.toBeInTheDocument()

      escribir(screen.getByPlaceholderText('Buscar ingrediente...'), ' Rúcula ')
      await act(async () => { fireEvent.click(screen.getByText('+ Crear y agregar «Rúcula»')) })

      expect(tienda.createIngrediente).toHaveBeenCalledWith({ nombre: 'Rúcula', restauranteId: 'rest-1' })
      expect(screen.getByText('Rúcula')).toBeInTheDocument()
    })

    it('si crear el ingrediente falla no agrega nada', async () => {
      tienda.createIngrediente.mockRejectedValue(new Error('caído'))
      abrir()
      fireEvent.click(screen.getByRole('button', { name: '+ Agregar ingrediente' }))
      escribir(screen.getByPlaceholderText('Buscar ingrediente...'), 'Rúcula')

      await act(async () => { fireEvent.click(screen.getByText('+ Crear y agregar «Rúcula»')) })

      expect(tienda.createIngrediente).toHaveBeenCalled()
      expect(itemsApi.addIngrediente).not.toHaveBeenCalled()
      expect(screen.getByPlaceholderText('Buscar ingrediente...')).toHaveValue('Rúcula')
    })
  })

  describe('editar un plato', () => {
    it('carga los datos, la imagen, las dietas y los ingredientes', () => {
      abrir(MILANESA)

      expect(screen.getByText('Editar plato')).toBeInTheDocument()
      expect(nombre().value).toBe('Milanesa')
      expect(screen.getByPlaceholderText('Breve descripción del plato...')).toHaveValue('Con papas')
      expect(screen.getByRole('combobox')).toHaveValue('cat-2')
      expect(precio().value).toBe('5000')
      expect(screen.getByAltText('preview')).toHaveAttribute('src', 'https://storage.test/milanesa.png')
      expect(screen.getByText('Queso rallado')).toBeInTheDocument()
      expect(screen.getByText('Huevo frito')).toBeInTheDocument()
      expect(screen.getByText('—')).toBeInTheDocument()
      expect(within(filaIngrediente('Huevo frito')).getAllByRole('spinbutton').map((i) => (i as HTMLInputElement).value)).toEqual(['300', '2'])
    })

    it('guarda los cambios del formulario', async () => {
      abrir(MILANESA)

      escribir(nombre(), 'Milanesa napo')
      escribir(screen.getByPlaceholderText('Breve descripción del plato...'), '  ')
      escribir(precio(), '5500')
      await guardar('Guardar cambios')

      expect(tienda.updateItem).toHaveBeenCalledWith('item-1', { nombre: 'Milanesa napo', descripcion: undefined, categoriaId: 'cat-2', precioBase: 5500 })
      expect(onClose).toHaveBeenCalled()
    })

    it('con un descuento activo no deja bajar el precio base por debajo del precio con descuento', async () => {
      abrir({ ...MILANESA, precioDescuento: 4000, porcentajeDescuento: 20 } as ItemMenu)

      escribir(precio(), '3000')
      await guardar('Guardar cambios')

      expect(screen.getAllByText(/tiene que ser mayor al precio con descuento/).length).toBeGreaterThan(0)
      expect(tienda.updateItem).not.toHaveBeenCalled()
    })

    it('las dietas y los ingredientes se guardan en el momento', async () => {
      abrir(MILANESA)

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Vegetariano' })) })
      expect(clasifApi.removeFromItem).toHaveBeenCalledWith('item-1', 'cl-veg')
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sin TACC' })) })
      expect(clasifApi.addToItem).toHaveBeenCalledWith('item-1', 'cl-tacc')

      await act(async () => { fireEvent.click(within(filaIngrediente('Queso rallado')).getByRole('button', { name: 'Agregable' })) })
      expect(itemsApi.updateIngrediente).toHaveBeenCalledWith('item-1', 'ii-queso', { esRemovible: false, esAgregable: true })
      await act(async () => { fireEvent.click(within(filaIngrediente('Huevo frito')).getByRole('button', { name: 'Removible' })) })
      expect(itemsApi.updateIngrediente).toHaveBeenCalledWith('item-1', 'ii-huevo', { esOriginal: true, esRemovible: true, esAgregable: false, precioExtra: 0 })

      const [extra, maximo] = within(filaIngrediente('Queso rallado')).getAllByRole('spinbutton')
      await act(async () => { escribir(extra, 'abc') })
      expect(itemsApi.updateIngrediente).toHaveBeenCalledWith('item-1', 'ii-queso', { precioExtra: 0 })
      await act(async () => { escribir(maximo, '') })
      expect(itemsApi.updateIngrediente).toHaveBeenCalledWith('item-1', 'ii-queso', { cantidadMax: 1 })

      await act(async () => { fireEvent.click(filaIngrediente('Huevo frito').querySelector('.lucide-trash-2')!.closest('button')!) })
      expect(itemsApi.removeIngrediente).toHaveBeenCalledWith('item-1', 'ii-huevo')
      expect(screen.queryByText('Huevo frito')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '+ Agregar ingrediente' }))
      await act(async () => { fireEvent.click(screen.getByText('Jamón')) })
      expect(itemsApi.addIngrediente).toHaveBeenCalledWith('item-1', expect.objectContaining({ ingredienteId: 'ing-jamon' }))
      expect(screen.getByText('Jamón')).toBeInTheDocument()
    })

    it('si una dieta no se puede guardar vuelve atrás; si agregar un ingrediente falla no cambia', async () => {
      clasifApi.addToItem.mockRejectedValue(new Error('caído'))
      clasifApi.removeFromItem.mockRejectedValue(new Error('caído'))
      itemsApi.addIngrediente.mockRejectedValue(new Error('caído'))
      abrir(MILANESA)

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sin TACC' })) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Vegetariano' })) })
      fireEvent.click(screen.getByRole('button', { name: '+ Agregar ingrediente' }))
      await act(async () => { fireEvent.click(screen.getByText('Jamón')) })

      expect(screen.queryByText('Jamón')).not.toBeInTheDocument()
      // Las dos dietas quedan como estaban: se ve igual que al abrir.
      expect(clasifApi.addToItem).toHaveBeenCalledTimes(1)
      expect(clasifApi.removeFromItem).toHaveBeenCalledTimes(1)
    })

    it('crea un ingrediente nuevo y lo asocia al plato', async () => {
      tienda.createIngrediente.mockResolvedValue({ id: 'ing-jamon', nombre: 'Jamón' })
      abrir(MILANESA)
      fireEvent.click(screen.getByRole('button', { name: '+ Agregar ingrediente' }))
      escribir(screen.getByPlaceholderText('Buscar ingrediente...'), 'Rúcula')

      await act(async () => { fireEvent.click(screen.getByText('+ Crear y agregar «Rúcula»')) })

      expect(itemsApi.addIngrediente).toHaveBeenCalledWith('item-1', expect.objectContaining({ ingredienteId: 'ing-jamon' }))
      expect(screen.getByText('Jamón')).toBeInTheDocument()
    })

    it('cambiar la imagen la sube; si falla vuelve a la anterior', async () => {
      tienda.uploadItemImage.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('muy grande'))
      abrir(MILANESA)
      const subir = (nombreArchivo: string) => act(async () => {
        fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], nombreArchivo)] } })
      })

      await subir('a.png')
      expect(tienda.uploadItemImage).toHaveBeenCalledWith('item-1', expect.any(File))
      expect(screen.getByAltText('preview')).toHaveAttribute('src', 'blob:preview')
      await subir('b.png')
      expect(screen.getByAltText('preview')).toHaveAttribute('src', 'https://storage.test/milanesa.png')
    })

    it('quitar la imagen pide confirmación; si falla avisa', async () => {
      const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true)
      tienda.deleteItemImage.mockRejectedValueOnce(new Error('caído')).mockResolvedValueOnce({})
      abrir(MILANESA)

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Quitar' })) })
      expect(tienda.deleteItemImage).not.toHaveBeenCalled()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Quitar' })) })
      expect(screen.getByText('Error al quitar la imagen')).toBeInTheDocument()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Quitar' })) })
      expect(screen.getByText('Subir imagen (opcional)')).toBeInTheDocument()
      expect(confirmar).toHaveBeenCalledWith('¿Quitar la imagen de este plato?')
    })

    it('eliminar pide confirmación; al confirmar lo borra y cierra; si falla muestra el error', async () => {
      vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true)
      tienda.deleteItem.mockRejectedValueOnce(new Error('Aparece en pedidos')).mockRejectedValueOnce('raro').mockResolvedValueOnce({})
      abrir(MILANESA)
      const eliminar = () => act(async () => { fireEvent.click(screen.getByRole('button', { name: /Eliminar plato/ })) })

      await eliminar()
      expect(tienda.deleteItem).not.toHaveBeenCalled()
      await eliminar()
      expect(screen.getByText('Aparece en pedidos')).toBeInTheDocument()
      await eliminar()
      expect(screen.getByText('Error al eliminar')).toBeInTheDocument()
      await eliminar()
      expect(tienda.deleteItem).toHaveBeenCalledWith('item-1')
      expect(onClose).toHaveBeenCalled()
    })

    it('sin permiso de borrar no ofrece eliminar', () => {
      abrir(MILANESA, false)

      expect(screen.queryByRole('button', { name: /Eliminar plato/ })).not.toBeInTheDocument()
    })
  })
})
