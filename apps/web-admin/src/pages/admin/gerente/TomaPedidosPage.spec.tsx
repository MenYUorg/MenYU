import { fireEvent, render, screen, within } from '@testing-library/react'
import { api } from '../../../services/api'
import type { MesaConQr } from '../../../services/api'
import { restaurarPantalla, simularPantalla } from '../../../test/pantalla'
import { TomaPedidosPage } from './TomaPedidosPage'

vi.mock('../../../store/contextStore', () => {
  const estado = { selectedRestauranteId: 'rest-1', restaurantes: [] }
  return { useContextStore: () => estado }
})

vi.mock('../../../services/api', () => ({
  api: {
    mesas: { list: vi.fn() },
    sessions: { mesaActiva: vi.fn(), openStaff: vi.fn() },
    pedidos: { crearStaff: vi.fn() },
  },
}))

// ── Datos de prueba ──────────────────────────────────────────────────────────

// Queso extra a $150 (se cobra a precio normal, aunque el plato tenga descuento).
const queso = {
  id: 'ii-queso',
  ingredienteId: 'ing-queso',
  ingrediente: { id: 'ing-queso', nombre: 'Queso extra', esAlergeno: false },
  esRemovible: false,
  esAgregable: true,
  precioExtra: 150,
  cantidadMin: 0,
  cantidadMax: 3,
}

type PlatoDeLaApi = {
  id: string
  nombre: string
  descripcion: string | null
  precioBase: number
  precioDescuento?: number | null
  porcentajeDescuento?: number | null
  precioVigente?: number
  imagenUrl: string | null
  ingredientes: (typeof queso)[]
}

function plato(parcial: Partial<PlatoDeLaApi>): PlatoDeLaApi {
  return {
    id: 'plato',
    nombre: 'Plato',
    descripcion: null,
    precioBase: 1000,
    precioDescuento: null,
    porcentajeDescuento: null,
    precioVigente: 1000,
    imagenUrl: null,
    ingredientes: [queso],
    ...parcial,
  }
}

// Hamburguesa: $1000 con 20% de descuento ($800). Milanesa: $1000 sin descuento.
const hamburguesa = plato({ id: 'hamb', nombre: 'Hamburguesa', precioDescuento: 800, porcentajeDescuento: 20, precioVigente: 800 })
const milanesa = plato({ id: 'mila', nombre: 'Milanesa' })

const MENU = {
  categorias: [{ id: 'cat-1', nombre: 'Principales', orden: 1, itemsDirectos: [hamburguesa, milanesa] }],
  recomendados: [hamburguesa],
  restaurante: { id: 'rest-1', nombre: 'La Parrilla', nombreSeccionRecomendados: 'RECOMENDADOS' },
}

const MESA_LIBRE: MesaConQr = {
  id: 'mesa-1',
  restauranteId: 'rest-1',
  numero: '5',
  qrToken: 'qr',
  pin: '1234',
  estado: 'libre',
  activo: true,
  qrImage: '',
}

// ── Ayudas ───────────────────────────────────────────────────────────────────

/** Toca la mesa libre (abre la sesión) y espera a que cargue el menú. */
async function abrirMenuDeLaMesa(menu: typeof MENU = MENU) {
  vi.mocked(api.mesas.list).mockResolvedValue([MESA_LIBRE])
  vi.mocked(api.sessions.openStaff).mockResolvedValue({
    sesionId: 'sesion-1',
    mesaId: 'mesa-1',
    restauranteId: 'rest-1',
    codigoSesion: '042',
    numeroMesa: '5',
    esNueva: true,
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(menu) }))

  render(<TomaPedidosPage />)
  fireEvent.click(await screen.findByText('Toca para abrir mesa'))
  await screen.findAllByRole('button', { name: 'Agregar Milanesa' })
}

/** Todas las filas donde aparece el plato (la fila es el padre de su botón +). */
const filasDe = (nombre: string) =>
  screen.getAllByRole('button', { name: `Agregar ${nombre}` }).map((boton) => boton.parentElement as HTMLElement)

/** La última fila del plato: la de su categoría (la de recomendados, si la tiene, va antes). */
const filaDe = (nombre: string) => {
  const filas = filasDe(nombre)
  return filas[filas.length - 1]
}

const abrirPlato = (nombre: string) => fireEvent.click(within(filaDe(nombre)).getByRole('button', { name: `Agregar ${nombre}` }))

const botonAgregarALaComanda = () => screen.getByRole('button', { name: /Agregar a la comanda/ })
const modal = () => botonAgregarALaComanda().parentElement as HTMLElement

/** Sube en 1 la cantidad del extra "Queso extra" en el modal. */
const sumarQueso = () => {
  const filaQueso = within(modal()).getByText(/Queso extra/).parentElement as HTMLElement
  fireEvent.click(within(filaQueso).getAllByRole('button')[1])
}

/** Sube en 1 la cantidad de platos del modal (el número está entre los botones − y +). */
const sumarCantidad = () => {
  const selector = within(modal()).getByText('1').parentElement as HTMLElement
  fireEvent.click(within(selector).getAllByRole('button')[1])
}

describe('TomaPedidosPage (gerente)', () => {
  beforeEach(() => {
    vi.mocked(api.mesas.list).mockReset()
    vi.mocked(api.sessions.openStaff).mockReset()
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  describe('filas del menú', () => {
    it('un plato en descuento muestra el círculo con el porcentaje y el precio original tachado', async () => {
      await abrirMenuDeLaMesa()

      // Aparece en recomendados y en su categoría: las dos filas muestran el descuento.
      const filas = filasDe('Hamburguesa')
      expect(filas).toHaveLength(2)
      for (const fila of filas) {
        expect(within(fila).getByRole('img', { name: '20% de descuento' })).toHaveTextContent('-20%')
        expect(fila.querySelector('s')).toHaveTextContent('$1000.00')
        expect(within(fila).getByText('$800.00')).toBeInTheDocument()
      }
    })

    it('un plato sin descuento se ve como antes: solo el precio, sin círculo ni tachado', async () => {
      await abrirMenuDeLaMesa()
      const fila = filaDe('Milanesa')

      expect(within(fila).getByText('$1000.00')).toBeInTheDocument()
      expect(within(fila).queryByRole('img', { name: /de descuento/ })).not.toBeInTheDocument()
      expect(fila.querySelector('s')).toBeNull()
    })

    it('con una API sin descuentos (respuesta vieja) los platos se ven a su precio base', async () => {
      const sinCamposDeDescuento = (item: PlatoDeLaApi): PlatoDeLaApi => {
        const vieja = { ...item }
        delete vieja.precioDescuento
        delete vieja.porcentajeDescuento
        delete vieja.precioVigente
        return vieja
      }
      await abrirMenuDeLaMesa({
        ...MENU,
        categorias: [{ ...MENU.categorias[0], itemsDirectos: MENU.categorias[0].itemsDirectos.map(sinCamposDeDescuento) }],
        recomendados: [],
      })

      const fila = filaDe('Hamburguesa')
      expect(within(fila).getByText('$1000.00')).toBeInTheDocument()
      expect(fila.querySelector('s')).toBeNull()

      abrirPlato('Hamburguesa')
      expect(botonAgregarALaComanda()).toHaveTextContent('$1000.00')
    })
  })

  describe('modal del plato', () => {
    it('un plato en descuento muestra el círculo y los dos precios junto al nombre', async () => {
      await abrirMenuDeLaMesa()

      abrirPlato('Hamburguesa')

      const ventana = within(modal())
      expect(ventana.getByRole('heading', { name: 'Hamburguesa' })).toBeInTheDocument()
      expect(ventana.getByRole('img', { name: '20% de descuento' })).toBeInTheDocument()
      expect(modal().querySelector('s')).toHaveTextContent('$1000.00')
      expect(modal()).toHaveTextContent('Antes $1000.00, ahora $800.00')
    })

    it('un plato sin descuento no muestra círculo ni precio tachado', async () => {
      await abrirMenuDeLaMesa()

      abrirPlato('Milanesa')

      expect(within(modal()).queryByRole('img', { name: /de descuento/ })).not.toBeInTheDocument()
      expect(modal().querySelector('s')).toBeNull()
    })

    it('el botón parte del precio con descuento', async () => {
      await abrirMenuDeLaMesa()

      abrirPlato('Hamburguesa')

      expect(botonAgregarALaComanda()).toHaveTextContent('Agregar a la comanda — $800.00')
    })

    it('los extras se suman a precio normal, sin descuento', async () => {
      await abrirMenuDeLaMesa()
      abrirPlato('Hamburguesa')

      sumarQueso()

      expect(botonAgregarALaComanda()).toHaveTextContent('$950.00') // 800 + 150
    })

    it('la cantidad multiplica el precio con descuento más los extras', async () => {
      await abrirMenuDeLaMesa()
      abrirPlato('Hamburguesa')

      sumarCantidad() // 2 platos, antes de tocar los extras para que el "1" sea único
      sumarQueso()

      expect(botonAgregarALaComanda()).toHaveTextContent('$1900.00') // (800 + 150) × 2
    })

    it('un plato sin descuento parte del precio base y suma los extras', async () => {
      await abrirMenuDeLaMesa()
      abrirPlato('Milanesa')
      expect(botonAgregarALaComanda()).toHaveTextContent('$1000.00')

      sumarQueso()

      expect(botonAgregarALaComanda()).toHaveTextContent('$1150.00')
    })
  })

  describe('lugar del modal según la pantalla', () => {
    afterEach(() => {
      restaurarPantalla()
    })

    const fondoDelModal = () => modal().parentElement as HTMLElement

    it('en celular ocupa toda la pantalla: el menú lateral es un drawer y no deja lugar', async () => {
      simularPantalla(360)
      await abrirMenuDeLaMesa()

      abrirPlato('Hamburguesa')

      expect(fondoDelModal().style.left).toBe('0px')
    })

    it('en escritorio deja lugar al menú lateral', async () => {
      simularPantalla(1280)
      await abrirMenuDeLaMesa()

      abrirPlato('Hamburguesa')

      expect(fondoDelModal().style.left).toBe('220px')
    })
  })

  describe('comanda', () => {
    it('la línea y el total usan el precio con descuento más los extras', async () => {
      await abrirMenuDeLaMesa()
      abrirPlato('Hamburguesa')
      sumarQueso()

      fireEvent.click(botonAgregarALaComanda())

      expect(await screen.findByText('Comanda · Mesa 5')).toBeInTheDocument()
      expect(screen.getAllByText('$950.00')).toHaveLength(2) // la línea de la hamburguesa y el total
      expect(screen.getByText('Hamburguesa')).toBeInTheDocument()
    })
  })
})
