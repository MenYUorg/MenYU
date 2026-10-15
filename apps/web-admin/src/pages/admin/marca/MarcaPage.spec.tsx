import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Marca, Restaurante } from '@menyu/types'
import { api } from '../../../services/api'
import { useContextStore } from '../../../store/contextStore'
import { MarcaPage } from './MarcaPage'

vi.mock('@menyu/auth', () => ({
  TOKEN_KEY: 'menyu_access_token',
  REFRESH_KEY: 'menyu_refresh_token',
}))

vi.mock('../../../services/api', () => ({
  api: {
    marcas: { list: vi.fn(), uploadLogo: vi.fn(), deleteLogo: vi.fn() },
    restaurantes: { list: vi.fn(), update: vi.fn(), uploadLogo: vi.fn(), deleteLogo: vi.fn() },
  },
}))

const LOGO_MARCA = 'https://storage.test/logos/marcas/marca-1.png?v=1'
const LOGO_SUCURSAL = 'https://storage.test/logos/restaurantes/rest-1.png?v=2'
const LOGO_NUEVO = 'https://storage.test/logos/nuevo.png?v=3'

const MARCA: Marca = {
  id: 'marca-1',
  nombre: 'Marca Seed',
  slug: 'marca-seed',
  logoUrl: null,
  activo: true,
  createdAt: '2024-01-01',
}

const CENTRO: Restaurante = {
  id: 'rest-1',
  marcaId: 'marca-1',
  nombre: 'Sucursal Centro',
  direccion: 'Av. Siempre Viva 742',
  logoUrl: null,
  modoSesion: 'abierto',
  activo: true,
  createdAt: '2024-01-01',
  nombreSeccionRecomendados: 'Recomendaciones del chef',
}

const NORTE: Restaurante = { ...CENTRO, id: 'rest-2', nombre: 'Sucursal Norte', direccion: null }

// Simula la parte del servidor que usa la pantalla, para ver que después de cada cambio se recarga lo guardado.
let servidor: { marcas: Marca[]; restaurantes: Restaurante[] }

function cambiarMarca(cambios: Partial<Marca>) {
  servidor.marcas = servidor.marcas.map((m) => ({ ...m, ...cambios }))
}

function cambiarRestaurante(id: string, cambios: Partial<Restaurante>) {
  servidor.restaurantes = servidor.restaurantes.map((r) => (r.id === id ? { ...r, ...cambios } : r))
}

function logo(nombreArchivo = 'logo.png') {
  return new File(['png'], nombreArchivo, { type: 'image/png' })
}

async function renderPagina() {
  render(<MarcaPage />)
  await screen.findByRole('heading', { name: 'Marca Seed' })
}

const tarjeta = (nombre: string) => within(screen.getByRole('region', { name: nombre }))

describe('MarcaPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    useContextStore.setState({
      marcas: [],
      restaurantes: [],
      selectedMarcaId: null,
      selectedRestauranteId: null,
    })
    servidor = { marcas: [{ ...MARCA }], restaurantes: [{ ...CENTRO }, { ...NORTE }] }

    vi.mocked(api.marcas.list).mockImplementation(async () => servidor.marcas)
    vi.mocked(api.restaurantes.list).mockImplementation(async () => servidor.restaurantes)
    vi.mocked(api.marcas.uploadLogo).mockImplementation(async (id) => {
      cambiarMarca({ logoUrl: LOGO_NUEVO })
      return { id, logoUrl: LOGO_NUEVO }
    })
    vi.mocked(api.marcas.deleteLogo).mockImplementation(async (id) => {
      cambiarMarca({ logoUrl: null })
      return { id, logoUrl: null }
    })
    vi.mocked(api.restaurantes.uploadLogo).mockImplementation(async (id) => {
      cambiarRestaurante(id, { logoUrl: LOGO_NUEVO })
      return { id, logoUrl: LOGO_NUEVO }
    })
    vi.mocked(api.restaurantes.deleteLogo).mockImplementation(async (id) => {
      cambiarRestaurante(id, { logoUrl: null })
      return { id, logoUrl: null }
    })
    vi.mocked(api.restaurantes.update).mockImplementation(async (id, data) => {
      cambiarRestaurante(id, { direccion: data.direccion })
      return servidor.restaurantes.find((r) => r.id === id) as Restaurante
    })
  })

  describe('al cargar', () => {
    it('muestra "Cargando…" hasta que llegan los datos', async () => {
      let responder: (marcas: Marca[]) => void = () => undefined
      vi.mocked(api.marcas.list).mockReturnValue(new Promise<Marca[]>((resolver) => (responder = resolver)))

      render(<MarcaPage />)

      expect(screen.getByText('Cargando…')).toBeInTheDocument()

      responder([MARCA])
      expect(await screen.findByRole('heading', { name: 'Marca Seed' })).toBeInTheDocument()
      expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
    })

    it('pide los datos al servidor al entrar', async () => {
      await renderPagina()

      expect(api.marcas.list).toHaveBeenCalledTimes(1)
      expect(api.restaurantes.list).toHaveBeenCalledTimes(1)
    })

    it('si no hay una marca asociada a la cuenta, lo avisa', async () => {
      servidor.marcas = []
      servidor.restaurantes = []

      render(<MarcaPage />)

      expect(
        await screen.findByText('No encontramos una marca asociada a tu cuenta. Probá recargar la página.'),
      ).toBeInTheDocument()
    })

    it('muestra la marca y una tarjeta por sucursal con su dirección', async () => {
      await renderPagina()

      expect(screen.getByRole('region', { name: 'Marca Seed' })).toBeInTheDocument()
      expect(tarjeta('Sucursal Centro').getByLabelText('Dirección')).toHaveValue('Av. Siempre Viva 742')
      expect(tarjeta('Sucursal Norte').getByLabelText('Dirección')).toHaveValue('')
      expect(tarjeta('Sucursal Norte').getByText('Esta sucursal todavía no tiene dirección.')).toBeInTheDocument()
    })

    it('muestra solo las sucursales de la marca', async () => {
      servidor.restaurantes = [...servidor.restaurantes, { ...CENTRO, id: 'rest-9', marcaId: 'otra', nombre: 'Ajena' }]

      await renderPagina()

      expect(screen.getByRole('region', { name: 'Sucursal Centro' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Ajena' })).not.toBeInTheDocument()
    })

    it('si la marca no tiene sucursales, lo dice', async () => {
      servidor.restaurantes = []

      await renderPagina()

      expect(screen.getByText('Esta marca todavía no tiene sucursales.')).toBeInTheDocument()
    })
  })

  describe('qué logo se ve en cada lugar', () => {
    it('sin ningún logo: la marca y las sucursales lo indican', async () => {
      await renderPagina()

      expect(screen.getByText('Todavía no cargaste un logo')).toBeInTheDocument()
      expect(tarjeta('Sucursal Centro').getByText('Sin logo')).toBeInTheDocument()
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })

    it('las sucursales sin logo propio usan el de la marca', async () => {
      servidor.marcas = [{ ...MARCA, logoUrl: LOGO_MARCA }]

      await renderPagina()

      const centro = tarjeta('Sucursal Centro')
      expect(centro.getByText('Usa el logo de la marca')).toBeInTheDocument()
      expect(centro.getByRole('img', { name: 'Logo de Sucursal Centro' })).toHaveAttribute('src', LOGO_MARCA)
      expect(centro.queryByRole('button', { name: /Quitar logo/ })).not.toBeInTheDocument()
    })

    it('una sucursal con logo propio muestra el suyo', async () => {
      servidor.marcas = [{ ...MARCA, logoUrl: LOGO_MARCA }]
      servidor.restaurantes = [{ ...CENTRO, logoUrl: LOGO_SUCURSAL }, { ...NORTE }]

      await renderPagina()

      const centro = tarjeta('Sucursal Centro')
      expect(centro.getByText('Logo propio de la sucursal')).toBeInTheDocument()
      expect(centro.getByRole('img', { name: 'Logo de Sucursal Centro' })).toHaveAttribute('src', LOGO_SUCURSAL)
      expect(centro.getByRole('button', { name: 'Quitar logo de Sucursal Centro' })).toBeInTheDocument()
      expect(tarjeta('Sucursal Norte').getByRole('img')).toHaveAttribute('src', LOGO_MARCA)
    })
  })

  describe('logo de la marca', () => {
    it('al subirlo se guarda y lo pasan a usar las sucursales sin logo propio', async () => {
      const user = userEvent.setup()
      await renderPagina()
      const elegido = logo()

      await user.upload(screen.getByLabelText('Archivo del logo de Marca Seed'), elegido)

      expect(api.marcas.uploadLogo).toHaveBeenCalledWith('marca-1', elegido)
      expect(await tarjeta('Marca Seed').findByRole('img', { name: 'Logo de Marca Seed' })).toHaveAttribute(
        'src',
        LOGO_NUEVO,
      )
      expect(tarjeta('Sucursal Centro').getByRole('img')).toHaveAttribute('src', LOGO_NUEVO)
      expect(tarjeta('Sucursal Norte').getByText('Usa el logo de la marca')).toBeInTheDocument()
    })

    it('al quitarlo (confirmando) las sucursales vuelven a quedar sin logo', async () => {
      servidor.marcas = [{ ...MARCA, logoUrl: LOGO_MARCA }]
      const user = userEvent.setup()
      await renderPagina()

      await user.click(screen.getByRole('button', { name: 'Quitar logo de Marca Seed' }))
      await user.click(screen.getByRole('button', { name: 'Sí, quitar' }))

      expect(api.marcas.deleteLogo).toHaveBeenCalledWith('marca-1')
      expect(await screen.findByText('Todavía no cargaste un logo')).toBeInTheDocument()
      expect(tarjeta('Sucursal Centro').getByText('Sin logo')).toBeInTheDocument()
    })

    it('si el servidor rechaza la subida, muestra el motivo y no cambia nada', async () => {
      vi.mocked(api.marcas.uploadLogo).mockRejectedValue(new Error('El logo no puede pesar más de 2 MB'))
      const user = userEvent.setup()
      await renderPagina()

      await user.upload(screen.getByLabelText('Archivo del logo de Marca Seed'), logo())

      expect(await tarjeta('Marca Seed').findByRole('alert')).toHaveTextContent('El logo no puede pesar más de 2 MB')
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })
  })

  describe('logo de una sucursal', () => {
    it('al subirlo se guarda solo para esa sucursal', async () => {
      const user = userEvent.setup()
      await renderPagina()
      const elegido = logo('centro.png')

      await user.upload(screen.getByLabelText('Archivo del logo de Sucursal Centro'), elegido)

      expect(api.restaurantes.uploadLogo).toHaveBeenCalledWith('rest-1', elegido)
      expect(await tarjeta('Sucursal Centro').findByText('Logo propio de la sucursal')).toBeInTheDocument()
      expect(tarjeta('Sucursal Centro').getByRole('img')).toHaveAttribute('src', LOGO_NUEVO)
      expect(tarjeta('Sucursal Norte').getByText('Sin logo')).toBeInTheDocument()
    })

    it('al quitarlo vuelve a usar el logo de la marca', async () => {
      servidor.marcas = [{ ...MARCA, logoUrl: LOGO_MARCA }]
      servidor.restaurantes = [{ ...CENTRO, logoUrl: LOGO_SUCURSAL }, { ...NORTE }]
      const user = userEvent.setup()
      await renderPagina()

      await user.click(screen.getByRole('button', { name: 'Quitar logo de Sucursal Centro' }))
      expect(screen.getByRole('group', { name: 'Confirmar quitar el logo de Sucursal Centro' })).toHaveTextContent(
        'Va a usar el logo de la marca.',
      )
      await user.click(screen.getByRole('button', { name: 'Sí, quitar' }))

      expect(api.restaurantes.deleteLogo).toHaveBeenCalledWith('rest-1')
      expect(await tarjeta('Sucursal Centro').findByText('Usa el logo de la marca')).toBeInTheDocument()
    })

    it('al quitarlo, si la marca tampoco tiene logo, avisa que quedará sin logo', async () => {
      servidor.restaurantes = [{ ...CENTRO, logoUrl: LOGO_SUCURSAL }]
      const user = userEvent.setup()
      await renderPagina()

      await user.click(screen.getByRole('button', { name: 'Quitar logo de Sucursal Centro' }))

      expect(screen.getByRole('group', { name: 'Confirmar quitar el logo de Sucursal Centro' })).toHaveTextContent(
        'Va a quedar sin logo porque la marca tampoco tiene uno.',
      )
    })

    it('el error de una subida aparece solo en la tarjeta de esa sucursal', async () => {
      vi.mocked(api.restaurantes.uploadLogo).mockRejectedValue(new Error('No tenés acceso a este restaurante'))
      const user = userEvent.setup()
      await renderPagina()

      await user.upload(screen.getByLabelText('Archivo del logo de Sucursal Centro'), logo())

      expect(await tarjeta('Sucursal Centro').findByRole('alert')).toHaveTextContent(
        'No tenés acceso a este restaurante',
      )
      expect(tarjeta('Sucursal Norte').queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('dirección de una sucursal', () => {
    it('guarda la dirección nueva y la muestra ya guardada', async () => {
      const user = userEvent.setup()
      await renderPagina()
      const centro = tarjeta('Sucursal Centro')

      await user.clear(centro.getByLabelText('Dirección'))
      await user.type(centro.getByLabelText('Dirección'), 'Mitre 500')
      await user.click(centro.getByRole('button', { name: 'Guardar' }))

      expect(api.restaurantes.update).toHaveBeenCalledWith('rest-1', { direccion: 'Mitre 500' })
      expect(await centro.findByRole('status')).toHaveTextContent('Dirección guardada')
      expect(centro.getByLabelText('Dirección')).toHaveValue('Mitre 500')
      expect(centro.getByRole('button', { name: 'Guardar' })).toBeDisabled()
      expect(tarjeta('Sucursal Norte').getByLabelText('Dirección')).toHaveValue('')
    })

    it('una sucursal sin dirección puede cargar la primera', async () => {
      const user = userEvent.setup()
      await renderPagina()
      const norte = tarjeta('Sucursal Norte')

      await user.type(norte.getByLabelText('Dirección'), '  San Martín 10  ')
      await user.click(norte.getByRole('button', { name: 'Guardar' }))

      expect(api.restaurantes.update).toHaveBeenCalledWith('rest-2', { direccion: 'San Martín 10' })
      expect(await norte.findByRole('status')).toHaveTextContent('Dirección guardada')
    })

    it('no guarda una dirección vacía', async () => {
      const user = userEvent.setup()
      await renderPagina()
      const centro = tarjeta('Sucursal Centro')

      await user.clear(centro.getByLabelText('Dirección'))

      expect(centro.getByRole('alert')).toHaveTextContent('La dirección es obligatoria')
      expect(centro.getByRole('button', { name: 'Guardar' })).toBeDisabled()
      expect(api.restaurantes.update).not.toHaveBeenCalled()
    })

    it('si el servidor la rechaza, muestra el motivo y conserva lo escrito', async () => {
      vi.mocked(api.restaurantes.update).mockRejectedValue(new Error('Solo el owner de la marca puede hacer esto'))
      const user = userEvent.setup()
      await renderPagina()
      const centro = tarjeta('Sucursal Centro')

      await user.type(centro.getByLabelText('Dirección'), ' bis')
      await user.click(centro.getByRole('button', { name: 'Guardar' }))

      expect(await centro.findByRole('alert')).toHaveTextContent('Solo el owner de la marca puede hacer esto')
      expect(centro.getByLabelText('Dirección')).toHaveValue('Av. Siempre Viva 742 bis')
    })
  })
})
