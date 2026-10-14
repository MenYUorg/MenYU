import type { DiscoveryRestauranteDetalle } from '@menyu/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../services/api'
import { reiniciarDiscoveryStore, useDiscoveryStore } from '../../store/discoveryStore'
import { crearOferta, crearRestaurante } from '../../test/fixtures'
import { RestaurantePage } from './RestaurantePage'

vi.mock('../../services/api', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../services/api')>()),
  api: { discovery: { restaurante: vi.fn() } },
}))

const pedirRestaurante = vi.mocked(api.discovery.restaurante)

const PARRILLA: DiscoveryRestauranteDetalle = {
  restaurante: crearRestaurante({ id: 'parrilla', nombre: 'La Parrilla del Puerto', cantidadOfertas: 2 }),
  ofertas: [
    crearOferta({ id: 'o1', nombre: 'Milanesa napolitana', restaurante: { id: 'parrilla', nombre: 'La Parrilla del Puerto' } }),
    crearOferta({ id: 'o2', nombre: 'Bife de chorizo con guarnición', restaurante: { id: 'parrilla', nombre: 'La Parrilla del Puerto' } }),
  ],
}

const SIN_OFERTAS: DiscoveryRestauranteDetalle = {
  restaurante: crearRestaurante({ id: 'vito', nombre: 'Pizzería Don Vito', direccion: null }),
  ofertas: [],
}

/** Botón para pasar de un restaurante a otro sin salir de la pantalla (como al tocar el logo o una tarjeta). */
function IrA({ id }: { id: string }) {
  const navigate = useNavigate()
  return <button onClick={() => navigate(`/restaurante/${id}`)}>Ir a {id}</button>
}

function renderPagina(id = 'parrilla') {
  return render(
    <MemoryRouter initialEntries={[`/restaurante/${id}`]}>
      <IrA id="vito" />
      <Routes>
        <Route path="/" element={<p>inicio</p>} />
        <Route path="/restaurante/:restauranteId" element={<RestaurantePage />} />
        <Route path="/restaurante/:restauranteId/mesa" element={<p>ingreso a la mesa</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RestaurantePage', () => {
  beforeEach(() => {
    reiniciarDiscoveryStore()
    pedirRestaurante.mockReset().mockResolvedValue(PARRILLA)
  })

  describe('con el restaurante cargado', () => {
    it('pide el restaurante por el id de la ruta y muestra su nombre y su dirección', async () => {
      renderPagina()

      expect(await screen.findByRole('heading', { level: 1, name: 'La Parrilla del Puerto' })).toBeInTheDocument()
      expect(pedirRestaurante).toHaveBeenCalledTimes(1)
      expect(pedirRestaurante).toHaveBeenCalledWith('parrilla')
      expect(screen.getByText('Av. Alicia Moreau de Justo 1150, Puerto Madero')).toBeInTheDocument()
    })

    it('sin dirección cargada lo dice en lugar de dejar un hueco', async () => {
      pedirRestaurante.mockResolvedValue(SIN_OFERTAS)

      renderPagina('vito')

      expect(await screen.findByText('Dirección no cargada')).toBeInTheDocument()
    })

    it('"Ingresar a una mesa" lleva al ingreso a mesa de ese restaurante', async () => {
      renderPagina()

      fireEvent.click(await screen.findByRole('link', { name: 'Ingresar a una mesa' }))

      expect(screen.getByText('ingreso a la mesa')).toBeInTheDocument()
    })

    it('explica que se entra con el QR o con el PIN, sin mostrar el campo del PIN', async () => {
      renderPagina()
      await screen.findByRole('heading', { level: 1 })

      expect(screen.getByText('Escaneá el QR o ingresá el PIN de tu mesa.')).toBeInTheDocument()
      expect(screen.queryByLabelText('PIN de mesa')).not.toBeInTheDocument()
    })

    it('"Volver" lleva al inicio', async () => {
      renderPagina()

      fireEvent.click(await screen.findByRole('link', { name: 'Volver' }))

      expect(screen.getByText('inicio')).toBeInTheDocument()
    })

    it('todavía no ofrece "Ver la carta" (llega con la carta en modo vista)', async () => {
      renderPagina()
      await screen.findByRole('heading', { level: 1 })

      expect(screen.queryByText('Ver la carta')).not.toBeInTheDocument()
    })
  })

  describe('las ofertas del restaurante', () => {
    it('se listan con su precio y sin repetir de qué restaurante son', async () => {
      renderPagina()
      await screen.findByRole('heading', { level: 1 })

      expect(screen.getByRole('heading', { level: 2, name: 'Ofertas de este restaurante' })).toBeInTheDocument()
      expect(screen.getByText('Milanesa napolitana')).toBeInTheDocument()
      expect(screen.getByText('Bife de chorizo con guarnición')).toBeInTheDocument()
      // El nombre del restaurante está una sola vez: en el título, no en cada tarjeta.
      expect(screen.getAllByText('La Parrilla del Puerto')).toHaveLength(1)
    })

    it('las tarjetas no son links: dentro del restaurante no hay a dónde ir', async () => {
      renderPagina()
      await screen.findByRole('heading', { level: 1 })

      const seccion = screen.getByRole('heading', { level: 2, name: 'Ofertas de este restaurante' }).closest('section') as HTMLElement
      expect(within(seccion).queryAllByRole('link')).toHaveLength(0)
    })

    it('sin ofertas no hay sección ni título vacío', async () => {
      pedirRestaurante.mockResolvedValue(SIN_OFERTAS)

      renderPagina('vito')
      await screen.findByRole('heading', { level: 1, name: 'Pizzería Don Vito' })

      expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Ingresar a una mesa' })).toBeInTheDocument()
    })
  })

  describe('mientras carga', () => {
    it('muestra un esqueleto y no una pantalla vacía ni un error', () => {
      pedirRestaurante.mockReturnValue(new Promise(() => {}))

      renderPagina()

      expect(screen.getByLabelText('Cargando el restaurante')).toHaveAttribute('aria-busy', 'true')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    })

    it('si el store todavía guarda otro restaurante (el de antes), no lo muestra como si fuera este', () => {
      const pedidoOriginal = useDiscoveryStore.getState().cargarRestaurante
      // El pedido no hace nada: así el store sigue con el restaurante de antes, que es lo que se ve en el primer cuadro.
      useDiscoveryStore.setState({
        cargarRestaurante: vi.fn().mockResolvedValue(undefined),
        detalle: { id: 'vito', estado: 'listo', restaurante: SIN_OFERTAS.restaurante, ofertas: [] },
      })

      const { unmount } = renderPagina('parrilla')

      try {
        expect(screen.getByLabelText('Cargando el restaurante')).toBeInTheDocument()
        expect(screen.queryByText('Pizzería Don Vito')).not.toBeInTheDocument()
      } finally {
        unmount()
        useDiscoveryStore.setState({ cargarRestaurante: pedidoOriginal })
      }
    })

    it('al pasar de un restaurante a otro no muestra el anterior mientras llega el nuevo', async () => {
      renderPagina()
      await screen.findByRole('heading', { level: 1, name: 'La Parrilla del Puerto' })
      pedirRestaurante.mockReturnValue(new Promise(() => {}))

      fireEvent.click(screen.getByRole('button', { name: 'Ir a vito' }))

      expect(await screen.findByLabelText('Cargando el restaurante')).toBeInTheDocument()
      expect(screen.queryByText('La Parrilla del Puerto')).not.toBeInTheDocument()
      expect(pedirRestaurante).toHaveBeenLastCalledWith('vito')
    })
  })

  describe('cuando no se puede mostrar', () => {
    it('un restaurante que no existe (404) lo dice y ofrece volver al inicio', async () => {
      pedirRestaurante.mockRejectedValue(new ApiError('Restaurante no encontrado', 404))

      renderPagina('no-existe')

      expect(await screen.findByText('No encontramos este restaurante')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Ingresar a una mesa' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }))

      expect(screen.getByText('inicio')).toBeInTheDocument()
    })

    it('sin conexión avisa del error (no dice que el restaurante no existe) y "Reintentar" lo vuelve a pedir', async () => {
      pedirRestaurante.mockRejectedValueOnce(new TypeError('Failed to fetch'))

      renderPagina()

      const aviso = await screen.findByRole('alert')
      expect(within(aviso).getByText('No pudimos cargar el restaurante')).toBeInTheDocument()
      expect(screen.queryByText('No encontramos este restaurante')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

      expect(await screen.findByRole('heading', { level: 1, name: 'La Parrilla del Puerto' })).toBeInTheDocument()
      expect(pedirRestaurante).toHaveBeenCalledTimes(2)
    })

    it('un error del servidor (500) también es un error, no un "no existe"', async () => {
      pedirRestaurante.mockRejectedValue(new ApiError('Error 500', 500))

      renderPagina()

      expect(await screen.findByText('No pudimos cargar el restaurante')).toBeInTheDocument()
      expect(screen.queryByText('No encontramos este restaurante')).not.toBeInTheDocument()
    })

    it('si el reintento también falla sigue el aviso, y no queda cargando para siempre', async () => {
      pedirRestaurante.mockRejectedValue(new TypeError('Failed to fetch'))

      renderPagina()
      fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))

      await waitFor(() => expect(pedirRestaurante).toHaveBeenCalledTimes(2))
      expect(await screen.findByText('No pudimos cargar el restaurante')).toBeInTheDocument()
      expect(screen.queryByLabelText('Cargando el restaurante')).not.toBeInTheDocument()
    })
  })
})
