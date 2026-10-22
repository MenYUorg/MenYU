import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ItemMenu } from '@menyu/types'
import { api } from '../../../services/api'
import { useMenuStore } from '../../../store/menuStore'
import { restaurarPantalla, simularPantalla } from '../../../test/pantalla'
import { AdminMenuPage } from './AdminMenuPage'

let rolActual: 'OWNER' | 'GERENTE' | null = 'OWNER'

vi.mock('../../../store/contextStore', () => {
  const estado = { selectedRestauranteId: 'rest-1', restaurantes: [], refreshContext: () => Promise.resolve() }
  return { useContextStore: () => estado, useRolActual: () => rolActual }
})

vi.mock('../../../services/api', () => ({
  api: {
    items: {
      list: vi.fn(),
      update: vi.fn(),
      setDescuento: vi.fn(),
      quitarDescuento: vi.fn(),
    },
    categorias: { list: vi.fn() },
    ingredientes: { list: vi.fn() },
    clasificaciones: { list: vi.fn() },
  },
}))

function plato(id: string, nombre: string, extra: Partial<ItemMenu> = {}): ItemMenu {
  return {
    id,
    restauranteId: 'rest-1',
    categoriaId: 'cat-1',
    comandaId: null,
    nombre,
    descripcion: null,
    precioBase: 2000,
    precioDescuento: null,
    porcentajeDescuento: null,
    precioVigente: 2000,
    disponible: true,
    imagenUrl: null,
    ingredientes: [],
    clasificaciones: [],
    ...extra,
  }
}

const MILANESA = plato('milanesa', 'Milanesa Napo', {
  precioDescuento: 1500,
  porcentajeDescuento: 25,
  precioVigente: 1500,
})
const BIFE = plato('bife', 'Bife de Chorizo', { precioBase: 6800, precioVigente: 6800 })
const PROVOLETA = plato('provoleta', 'Provoleta', { precioBase: 2300, precioVigente: 2300 })

// Simula el servidor: devuelve el plato como quedaría con el descuento.
function conDescuento(item: ItemMenu, precio: number): ItemMenu {
  const base = Number(item.precioBase)
  return {
    ...item,
    precioDescuento: precio,
    porcentajeDescuento: Math.round((1 - precio / base) * 100),
    precioVigente: precio,
  }
}

async function renderPagina() {
  render(<AdminMenuPage />)
  await screen.findByText('Bife de Chorizo')
}

const fila = (nombre: string) => within(screen.getByText(nombre).closest('div[style*="flex-direction"]') as HTMLElement)

describe('AdminMenuPage — descuentos', () => {
  beforeEach(() => {
    rolActual = 'OWNER'
    vi.resetAllMocks()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    useMenuStore.setState({ items: [], categorias: [], ingredientes: [], clasificaciones: [], loading: false, error: null })
    vi.mocked(api.items.list).mockResolvedValue([MILANESA, BIFE, PROVOLETA])
    vi.mocked(api.categorias.list).mockResolvedValue([{ id: 'cat-1', restauranteId: 'rest-1', nombre: 'Principales', orden: 1 }])
    vi.mocked(api.ingredientes.list).mockResolvedValue([])
    vi.mocked(api.clasificaciones.list).mockResolvedValue([])
  })

  afterEach(() => {
    restaurarPantalla()
    vi.unstubAllGlobals()
  })

  describe('quién ve el botón', () => {
    it.each(['OWNER', 'GERENTE'] as const)('el %s lo ve en cada plato', async (rol) => {
      rolActual = rol

      await renderPagina()

      expect(screen.getByRole('button', { name: 'Descuento de Milanesa Napo' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Descuento de Bife de Chorizo' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Descuento de Provoleta' })).toBeInTheDocument()
    })

    // Una cuenta ROOT no tiene rol en ningún restaurante: el backend le da 403 en el menú y /admin/* la devuelve a /root.
    it('sin rol en el restaurante no lo ve', async () => {
      rolActual = null

      await renderPagina()

      expect(screen.queryByRole('button', { name: /Descuento de/ })).not.toBeInTheDocument()
    })
  })

  describe('cómo se ve cada plato', () => {
    it('el que está en descuento muestra el precio tachado, el vigente y el porcentaje; el otro, solo su precio', async () => {
      await renderPagina()

      const enDescuento = fila('Milanesa Napo')
      expect(enDescuento.getByText('$2.000')).toHaveStyle({ textDecoration: 'line-through' })
      expect(enDescuento.getByText('$1.500')).toBeInTheDocument()
      expect(enDescuento.getByText('-25%')).toBeInTheDocument()

      const normal = fila('Bife de Chorizo')
      expect(normal.getByText('$6.800')).toBeInTheDocument()
      expect(normal.queryByText(/^-\d+%$/)).not.toBeInTheDocument()
    })
  })

  describe('poner un descuento', () => {
    it('abre el modal del plato, calcula y guarda; la lista se actualiza sin recargar', async () => {
      const user = userEvent.setup()
      vi.mocked(api.items.setDescuento).mockImplementation(async (_id, data) =>
        conDescuento(BIFE, data.porcentaje ? 6800 - (6800 * data.porcentaje) / 100 : (data.precioDescuento as number)),
      )
      await renderPagina()

      await user.click(screen.getByRole('button', { name: 'Descuento de Bife de Chorizo' }))
      const modal = within(screen.getByRole('dialog', { name: 'Descuento — Bife de Chorizo' }))
      await user.type(modal.getByLabelText('Porcentaje de descuento (%)'), '25')
      expect(modal.getByLabelText('Precio con descuento ($)')).toHaveValue('5100')
      await user.click(modal.getByRole('button', { name: 'Guardar descuento' }))

      expect(api.items.setDescuento).toHaveBeenCalledWith('bife', { porcentaje: 25 })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      const bife = fila('Bife de Chorizo')
      expect(await bife.findByText('-25%')).toBeInTheDocument()
      expect(bife.getByText('$5.100')).toBeInTheDocument()
      expect(bife.getByText('$6.800')).toHaveStyle({ textDecoration: 'line-through' })
    })

    it('por precio manda el precio con descuento', async () => {
      const user = userEvent.setup()
      vi.mocked(api.items.setDescuento).mockResolvedValue(conDescuento(PROVOLETA, 1840))
      await renderPagina()

      await user.click(screen.getByRole('button', { name: 'Descuento de Provoleta' }))
      await user.type(screen.getByLabelText('Precio con descuento ($)'), '1840')
      await user.click(screen.getByRole('button', { name: 'Guardar descuento' }))

      expect(api.items.setDescuento).toHaveBeenCalledWith('provoleta', { precioDescuento: 1840 })
      expect(await fila('Provoleta').findByText('-20%')).toBeInTheDocument()
    })

    it('si el servidor lo rechaza, el modal muestra el motivo y el plato no cambia', async () => {
      const user = userEvent.setup()
      vi.mocked(api.items.setDescuento).mockRejectedValue(new Error('No tenés acceso a este restaurante'))
      await renderPagina()

      await user.click(screen.getByRole('button', { name: 'Descuento de Bife de Chorizo' }))
      await user.type(screen.getByLabelText('Porcentaje de descuento (%)'), '25')
      await user.click(screen.getByRole('button', { name: 'Guardar descuento' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('No tenés acceso a este restaurante')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(fila('Bife de Chorizo').queryByText(/^-\d+%$/)).not.toBeInTheDocument()
    })

    it('la lista no se reemplaza por "Cargando…" mientras se guarda', async () => {
      const user = userEvent.setup()
      let terminar: (i: ItemMenu) => void = () => undefined
      vi.mocked(api.items.setDescuento).mockReturnValue(new Promise<ItemMenu>((resolver) => (terminar = resolver)))
      await renderPagina()
      await user.click(screen.getByRole('button', { name: 'Descuento de Bife de Chorizo' }))
      await user.type(screen.getByLabelText('Porcentaje de descuento (%)'), '25')

      await user.click(screen.getByRole('button', { name: 'Guardar descuento' }))

      expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
      expect(screen.getByText('Bife de Chorizo')).toBeInTheDocument()
      terminar(conDescuento(BIFE, 5100))
    })
  })

  describe('cambiar o quitar un descuento', () => {
    it('el modal de un plato en descuento parte del descuento actual y permite quitarlo', async () => {
      const user = userEvent.setup()
      vi.mocked(api.items.quitarDescuento).mockResolvedValue(plato('milanesa', 'Milanesa Napo'))
      await renderPagina()

      await user.click(screen.getByRole('button', { name: 'Descuento de Milanesa Napo' }))
      expect(screen.getByLabelText('Precio con descuento ($)')).toHaveValue('1500')
      expect(screen.getByLabelText('Porcentaje de descuento (%)')).toHaveValue('25')
      await user.click(screen.getByRole('button', { name: 'Quitar descuento' }))

      expect(api.items.quitarDescuento).toHaveBeenCalledWith('milanesa')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      const milanesa = fila('Milanesa Napo')
      await vi.waitFor(() => expect(milanesa.queryByText('-25%')).not.toBeInTheDocument())
      expect(milanesa.getByText('$2.000')).not.toHaveStyle({ textDecoration: 'line-through' })
    })

    it('cambiarlo manda el precio nuevo', async () => {
      const user = userEvent.setup()
      vi.mocked(api.items.setDescuento).mockResolvedValue(conDescuento(MILANESA, 1400))
      await renderPagina()

      await user.click(screen.getByRole('button', { name: 'Descuento de Milanesa Napo' }))
      await user.clear(screen.getByLabelText('Precio con descuento ($)'))
      await user.type(screen.getByLabelText('Precio con descuento ($)'), '1400')
      await user.click(screen.getByRole('button', { name: 'Actualizar descuento' }))

      expect(api.items.setDescuento).toHaveBeenCalledWith('milanesa', { precioDescuento: 1400 })
      expect(await fila('Milanesa Napo').findByText('-30%')).toBeInTheDocument()
    })
  })

  describe('editar el precio base de un plato con descuento', () => {
    async function abrirEdicion(nombre: string) {
      const user = userEvent.setup()
      await user.click(within(screen.getByText(nombre).closest('div[style*="flex-direction"]') as HTMLElement).getByRole('button', { name: 'Editar' }))
      return user
    }

    it('el formulario avisa que hay un descuento activo y en qué porcentaje queda con el precio nuevo', async () => {
      await renderPagina()
      const user = await abrirEdicion('Milanesa Napo')

      expect(screen.getByText(/Este plato tiene un descuento activo/)).toHaveTextContent('$1.500')
      const campoPrecio = screen.getByDisplayValue('2000')
      await user.clear(campoPrecio)
      await user.type(campoPrecio, '3000')

      expect(screen.getByText(/pasa a ser de/)).toHaveTextContent('-50%')
    })

    it('no deja guardar un precio base menor o igual al precio con descuento y no llama al servidor', async () => {
      await renderPagina()
      const user = await abrirEdicion('Milanesa Napo')
      const campoPrecio = screen.getByDisplayValue('2000')

      await user.clear(campoPrecio)
      await user.type(campoPrecio, '1500')
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      expect(api.items.update).not.toHaveBeenCalled()
      expect(screen.getAllByText(/tiene que ser mayor al precio con descuento \(\$1\.500\)/).length).toBeGreaterThan(0)
    })

    it('un precio base mayor sí se guarda', async () => {
      vi.mocked(api.items.update).mockResolvedValue({ ...MILANESA, precioBase: 2400 })
      await renderPagina()
      const user = await abrirEdicion('Milanesa Napo')
      const campoPrecio = screen.getByDisplayValue('2000')

      await user.clear(campoPrecio)
      await user.type(campoPrecio, '2400')
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      expect(api.items.update).toHaveBeenCalledWith('milanesa', expect.objectContaining({ precioBase: 2400 }))
    })

    it('un plato sin descuento no muestra ningún aviso y acepta cualquier precio', async () => {
      vi.mocked(api.items.update).mockResolvedValue({ ...BIFE, precioBase: 1 })
      await renderPagina()
      const user = await abrirEdicion('Bife de Chorizo')

      expect(screen.queryByText(/descuento activo/)).not.toBeInTheDocument()
      const campoPrecio = screen.getByDisplayValue('6800')
      await user.clear(campoPrecio)
      await user.type(campoPrecio, '1')
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      expect(api.items.update).toHaveBeenCalledWith('bife', expect.objectContaining({ precioBase: 1 }))
    })
  })

  describe('en el celular (360 px)', () => {
    it('la lista y la fila se ven completas: botones tocables y sin controles escondidos', async () => {
      simularPantalla(360)

      await renderPagina()

      expect(screen.getByRole('button', { name: 'Descuento de Milanesa Napo' })).toHaveStyle({ minHeight: '44px' })
      expect(screen.getByRole('button', { name: '⚙ Gestionar catálogo' })).toHaveStyle({ minHeight: '44px' })
      expect(screen.getByRole('button', { name: '+ Agregar plato' })).toHaveStyle({ minHeight: '44px' })
    })
  })
})
