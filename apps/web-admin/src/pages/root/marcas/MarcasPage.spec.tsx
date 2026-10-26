import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApiError, api } from '../../../services/api'
import { marcaDetalle, marcaResumen, promesaManual } from '../../../test/root'
import { MarcasPage } from './MarcasPage'

vi.mock('../../../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../services/api')>()
  const { apiFalsa } = await import('../../../test/root')
  return { ...original, api: apiFalsa }
})

const marcas = vi.mocked(api.root.marcas)

const PARRILLA = marcaResumen()
const CAFE = marcaResumen({ id: 'marca-2', nombre: 'Café del Puerto', slug: 'cafe-del-puerto', restaurantes: { activos: 1, total: 1 }, duenos: 2 })
const SIN_DUENO = marcaResumen({ id: 'marca-3', nombre: 'Sushi Ya', slug: 'sushi-ya', restaurantes: { activos: 0, total: 0 }, duenos: 0 })
const DE_BAJA = marcaResumen({ id: 'marca-4', nombre: 'Pizzería Vieja', slug: 'pizzeria-vieja', activo: false, restaurantes: { activos: 0, total: 3 } })

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/root/marcas']}>
      <Routes>
        <Route path="/root/marcas" element={<MarcasPage />} />
        <Route path="/root/marcas/:id" element={<p>Detalle de la marca</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const lista = () => screen.getByLabelText('Marcas')

beforeEach(() => {
  vi.clearAllMocks()
  marcas.listar.mockImplementation(({ bajas } = {}) => Promise.resolve(bajas ? [PARRILLA, CAFE, SIN_DUENO, DE_BAJA] : [PARRILLA, CAFE, SIN_DUENO]))
})

describe('MarcasPage', () => {
  it('muestra la carga y después las marcas activas, con enlace a su detalle', async () => {
    renderPagina()
    expect(screen.getByLabelText('Cargando')).toHaveAttribute('aria-busy', 'true')

    await screen.findByLabelText('Marcas')

    expect(marcas.listar).toHaveBeenCalledWith({ bajas: false })
    expect(within(lista()).getAllByRole('link')).toHaveLength(3)
    expect(screen.getByRole('link', { name: /La Parrilla/ })).toHaveAttribute('href', '/root/marcas/marca-1')
    expect(screen.queryByText('Pizzería Vieja')).not.toBeInTheDocument()
  })

  it('cada marca muestra su identificador, cuántos restaurantes y dueños tiene y su estado', async () => {
    renderPagina()
    await screen.findByLabelText('Marcas')

    const parrilla = screen.getByRole('link', { name: /La Parrilla/ })
    expect(parrilla).toHaveTextContent('la-parrilla')
    expect(parrilla).toHaveTextContent('2 restaurantes')
    expect(parrilla).toHaveTextContent('1 dueño')
    expect(parrilla).toHaveTextContent('Activa')
    expect(screen.getByRole('link', { name: /Café del Puerto/ })).toHaveTextContent('2 dueños')
    expect(screen.getByRole('link', { name: /Café del Puerto/ })).toHaveTextContent('1 restaurante')
  })

  it('una marca sin dueño lo marca con un aviso', async () => {
    renderPagina()
    await screen.findByLabelText('Marcas')

    expect(screen.getByRole('link', { name: /Sushi Ya/ })).toHaveTextContent('Sin dueño')
    expect(screen.getByRole('link', { name: /La Parrilla/ })).not.toHaveTextContent('Sin dueño')
  })

  it('"Mostrar dadas de baja" vuelve a pedir la lista con las bajas y las marca', async () => {
    renderPagina()
    await screen.findByLabelText('Marcas')
    const interruptor = screen.getByRole('switch', { name: 'Mostrar dadas de baja' })
    expect(interruptor).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(interruptor)

    const baja = await screen.findByRole('link', { name: /Pizzería Vieja/ })
    expect(marcas.listar).toHaveBeenLastCalledWith({ bajas: true })
    expect(interruptor).toHaveAttribute('aria-checked', 'true')
    expect(baja).toHaveTextContent('De baja')
    expect(baja).toHaveTextContent('3 restaurantes')
    expect(baja).toHaveTextContent('(3 de baja)')
    expect(baja).toHaveClass('baja')
  })

  it('busca por nombre sin importar mayúsculas ni acentos', async () => {
    renderPagina()
    await screen.findByLabelText('Marcas')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar marca' }), 'CAFE')

    expect(within(lista()).getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link', { name: /Café del Puerto/ })).toBeInTheDocument()
  })

  it('encuentra por el nombre aunque el identificador sea otro (acentos y eñes incluidos)', async () => {
    marcas.listar.mockResolvedValue([PARRILLA, marcaResumen({ id: 'marca-5', nombre: 'Ñandú Grill', slug: 'grill-uno' })])
    renderPagina()
    await screen.findByLabelText('Marcas')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar marca' }), 'NANDU')

    expect(within(lista()).getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link', { name: /Ñandú Grill/ })).toBeInTheDocument()
  })

  it('también busca por identificador', async () => {
    renderPagina()
    await screen.findByLabelText('Marcas')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar marca' }), 'sushi-ya')

    expect(within(lista()).getAllByRole('link')).toHaveLength(1)
  })

  it('sin resultados lo dice con lo que se buscó y sugiere sumar las dadas de baja', async () => {
    renderPagina()
    await screen.findByLabelText('Marcas')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar marca' }), 'xyz')

    expect(screen.getByText('No encontramos marcas con «xyz»')).toBeInTheDocument()
    expect(screen.getByText(/activá «Mostrar dadas de baja»/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Marcas')).not.toBeInTheDocument()
  })

  it('sin marcas activas invita a crear la primera', async () => {
    marcas.listar.mockResolvedValue([])
    renderPagina()

    expect(await screen.findByText('Todavía no hay marcas activas')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Crear la primera marca' }))

    expect(screen.getByRole('dialog', { name: 'Nueva marca' })).toBeInTheDocument()
  })

  it('con las bajas incluidas y sin ninguna marca, dice "Todavía no hay marcas"', async () => {
    marcas.listar.mockResolvedValue([])
    renderPagina()
    await screen.findByText('Todavía no hay marcas activas')

    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar dadas de baja' }))

    expect(await screen.findByText('Todavía no hay marcas')).toBeInTheDocument()
  })

  it('si falla la carga muestra el error y "Reintentar" vuelve a pedir', async () => {
    marcas.listar.mockRejectedValueOnce(new ApiError(500, 'Error 500'))
    renderPagina()

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los datos.')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByLabelText('Marcas')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('sin red lo dice distinto', async () => {
    marcas.listar.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderPagina()

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión.')
  })

  it('una respuesta tardía de la lista anterior no pisa la nueva al cambiar "dadas de baja"', async () => {
    const lenta = promesaManual<ReturnType<typeof marcaResumen>[]>()
    marcas.listar.mockReturnValueOnce(lenta.promesa)
    renderPagina()

    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar dadas de baja' }))
    await screen.findByRole('link', { name: /Pizzería Vieja/ })
    lenta.resolver([PARRILLA])
    await screen.findByRole('link', { name: /Pizzería Vieja/ })

    expect(within(lista()).getAllByRole('link')).toHaveLength(4)
  })

  it('"Nueva marca" crea y lleva al detalle de la marca creada', async () => {
    marcas.crear.mockResolvedValue(marcaDetalle({ id: 'marca-nueva', nombre: 'Nueva', slug: 'nueva' }))
    renderPagina()
    await screen.findByLabelText('Marcas')

    await userEvent.click(screen.getByRole('button', { name: 'Nueva marca' }))
    await userEvent.type(screen.getByLabelText('Nombre *'), 'Nueva')
    await userEvent.click(screen.getByRole('button', { name: 'Crear marca' }))

    expect(marcas.crear).toHaveBeenCalledWith({ nombre: 'Nueva', slug: 'nueva' })
    expect(await screen.findByText('Detalle de la marca')).toBeInTheDocument()
  })

  it('cancelar el diálogo no crea nada', async () => {
    renderPagina()
    await screen.findByLabelText('Marcas')

    await userEvent.click(screen.getByRole('button', { name: 'Nueva marca' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(marcas.crear).not.toHaveBeenCalled()
  })
})
