import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApiError, api } from '../../../services/api'
import { marcaDetalle, promesaManual, restaurante } from '../../../test/root'
import { MarcaDetallePage } from './MarcaDetallePage'

vi.mock('../../../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../services/api')>()
  const { apiFalsa } = await import('../../../test/root')
  return { ...original, api: apiFalsa }
})

const marcas = vi.mocked(api.root.marcas)
const restaurantes = vi.mocked(api.root.restaurantes)
const duenos = vi.mocked(api.root.duenos)

function renderPagina(id = 'marca-1') {
  return render(
    <MemoryRouter initialEntries={[`/root/marcas/${id}`]}>
      <Link to="/root/marcas/marca-2">Ir a la otra marca</Link>
      <Routes>
        <Route path="/root/marcas" element={<p>Lista de marcas</p>} />
        <Route path="/root/marcas/:id" element={<MarcaDetallePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const seccion = (nombre: string) => within(screen.getByRole('region', { name: nombre }))

beforeEach(() => {
  vi.clearAllMocks()
  marcas.detalle.mockResolvedValue(marcaDetalle())
})

describe('MarcaDetallePage', () => {
  it('muestra los datos de la marca', async () => {
    renderPagina()

    expect(await screen.findByRole('heading', { name: 'La Parrilla', level: 2 })).toBeInTheDocument()
    expect(marcas.detalle).toHaveBeenCalledWith('marca-1')
    expect(screen.getByText('la-parrilla')).toBeInTheDocument()
    expect(screen.getByText('Activa')).toBeInTheDocument()
    expect(screen.getByText('2 activos de 2')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Marcas' })).toHaveAttribute('href', '/root/marcas')
  })

  it('los dueños se ven con su nombre y su email', async () => {
    renderPagina()
    await screen.findByRole('heading', { name: 'La Parrilla' })

    expect(seccion('Dueños').getByText('Juan')).toBeInTheDocument()
    expect(seccion('Dueños').getByText('juan@laparrilla.com')).toBeInTheDocument()
    expect(seccion('Dueños').getByText(/Se invitan por mail/)).toBeInTheDocument()
  })

  it('lista los restaurantes con su dirección, o "Dirección no cargada"', async () => {
    renderPagina()
    await screen.findByRole('heading', { name: 'La Parrilla' })

    expect(seccion('Restaurantes').getByText('La Parrilla Centro')).toBeInTheDocument()
    expect(seccion('Restaurantes').getByText('Av. Siempre Viva 742')).toBeInTheDocument()
    expect(seccion('Restaurantes').getByText('La Parrilla Norte')).toBeInTheDocument()
    expect(seccion('Restaurantes').getByText('Dirección no cargada')).toBeInTheDocument()
  })

  it('ROOT no puede eliminar nada: solo editar y dar de baja', async () => {
    renderPagina()
    await screen.findByRole('heading', { name: 'La Parrilla' })
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de La Parrilla Centro' }))

    expect(screen.queryByRole('button', { name: /eliminar|borrar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /eliminar|borrar/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('menuitem').map((o) => o.textContent)).toEqual(['Editar nombre', 'Dar de baja'])
  })

  it('recuerda lo que ROOT no ve', async () => {
    renderPagina()
    await screen.findByRole('heading', { name: 'La Parrilla' })

    expect(screen.getByText(/ROOT no ve ni decide sobre el menú/)).toBeInTheDocument()
  })

  it('una marca sin dueño lo avisa y ofrece invitar a uno', async () => {
    marcas.detalle.mockResolvedValue(marcaDetalle({ duenos: [] }))
    renderPagina()

    expect(await screen.findByText('Esta marca no tiene dueño.')).toBeInTheDocument()
    expect(seccion('Dueños').getByText('Todavía no hay ningún dueño.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Invitar dueño' })).toHaveLength(2) // el del aviso y el de la sección

    await userEvent.click(screen.getAllByRole('button', { name: 'Invitar dueño' })[0])

    expect(screen.getByRole('dialog', { name: 'Invitar dueño' })).toBeInTheDocument()
  })

  it('una marca sin restaurantes lo dice', async () => {
    marcas.detalle.mockResolvedValue(marcaDetalle({ restaurantes: [] }))
    renderPagina()

    expect(await screen.findByText('Todavía no tiene restaurantes.')).toBeInTheDocument()
  })

  describe('marca dada de baja', () => {
    beforeEach(() => {
      marcas.detalle.mockResolvedValue(
        marcaDetalle({ activo: false, restaurantes: [restaurante({ activo: false })] }),
      )
    })

    it('muestra el aviso con "Reactivar" y esconde "Dar de baja" y "Agregar restaurante"', async () => {
      renderPagina()

      expect(await screen.findByText('Esta marca está dada de baja.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reactivar la marca' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Dar de baja' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Agregar restaurante' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Invitar dueño' })).not.toBeInTheDocument() // la API rechaza invitar en una marca de baja
      expect(screen.getAllByText('De baja').length).toBeGreaterThan(0)
    })

    it('reactivarla actualiza la pantalla con lo que devuelve la API y avisa', async () => {
      marcas.reactivar.mockResolvedValue(marcaDetalle())
      renderPagina()
      await userEvent.click(await screen.findByRole('button', { name: 'Reactivar la marca' }))

      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivar' }))

      expect(marcas.reactivar).toHaveBeenCalledWith('marca-1')
      expect(await screen.findByRole('status')).toHaveTextContent('Marca reactivada')
      expect(screen.queryByText('Esta marca está dada de baja.')).not.toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(marcas.detalle).toHaveBeenCalledTimes(1) // no vuelve a pedir: usa la respuesta del cambio
    })
  })

  describe('editar y dar de baja la marca', () => {
    it('editar guarda y muestra el nombre nuevo', async () => {
      marcas.editar.mockResolvedValue(marcaDetalle({ nombre: 'La Parrilla Grande' }))
      renderPagina()
      await userEvent.click(await screen.findByRole('button', { name: 'Editar' }))

      await userEvent.type(screen.getByLabelText('Nombre *'), ' Grande')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      expect(marcas.editar).toHaveBeenCalledWith('marca-1', { nombre: 'La Parrilla Grande' })
      expect(await screen.findByRole('heading', { name: 'La Parrilla Grande' })).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Cambios guardados')
    })

    it('dar de baja pide escribir el nombre y deja la pantalla en estado de baja', async () => {
      marcas.baja.mockResolvedValue(marcaDetalle({ activo: false }))
      renderPagina()
      await userEvent.click(await screen.findByRole('button', { name: 'Dar de baja' }))
      const dialogo = within(screen.getByRole('dialog'))

      expect(dialogo.getByRole('button', { name: 'Dar de baja' })).toBeDisabled()
      await userEvent.type(dialogo.getByLabelText('Para confirmar, escribí el nombre de la marca'), 'La Parrilla')
      await userEvent.click(dialogo.getByRole('button', { name: 'Dar de baja' }))

      expect(marcas.baja).toHaveBeenCalledWith('marca-1')
      expect(await screen.findByText('Esta marca está dada de baja.')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Marca dada de baja')
    })
  })

  describe('restaurantes', () => {
    it('agregar crea el restaurante y vuelve a pedir la marca', async () => {
      marcas.crearRestaurante.mockResolvedValue(restaurante({ id: 'rest-3', nombre: 'Sur' }))
      marcas.detalle
        .mockResolvedValueOnce(marcaDetalle())
        .mockResolvedValueOnce(marcaDetalle({ restaurantes: [restaurante(), restaurante({ id: 'rest-3', nombre: 'La Parrilla Sur' })] }))
      renderPagina()
      await userEvent.click(await screen.findByRole('button', { name: 'Agregar restaurante' }))

      await userEvent.type(screen.getByLabelText('Nombre *'), 'Sur')
      await userEvent.type(screen.getByLabelText('Dirección *'), 'Calle 1')
      await userEvent.click(screen.getByRole('button', { name: 'Crear restaurante' }))

      expect(marcas.crearRestaurante).toHaveBeenCalledWith('marca-1', { nombre: 'Sur', direccion: 'Calle 1' })
      expect(await seccion('Restaurantes').findByText('La Parrilla Sur')).toBeInTheDocument()
      expect(marcas.detalle).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('status')).toHaveTextContent('Restaurante creado')
    })

    it('editar el nombre llama a la API del restaurante y vuelve a pedir la marca', async () => {
      restaurantes.editar.mockResolvedValue(restaurante({ nombre: 'Centro' }))
      renderPagina()
      await screen.findByRole('heading', { name: 'La Parrilla' })

      await userEvent.click(screen.getByRole('button', { name: 'Acciones de La Parrilla Centro' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Editar nombre' }))
      await userEvent.clear(screen.getByLabelText('Nombre *'))
      await userEvent.type(screen.getByLabelText('Nombre *'), 'Centro')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      expect(restaurantes.editar).toHaveBeenCalledWith('rest-1', { nombre: 'Centro' })
      expect(await screen.findByRole('status')).toHaveTextContent('Cambios guardados')
      expect(marcas.detalle).toHaveBeenCalledTimes(2)
    })

    it('dar de baja un restaurante y reactivarlo', async () => {
      restaurantes.baja.mockResolvedValue(restaurante({ activo: false }))
      restaurantes.reactivar.mockResolvedValue(restaurante())
      marcas.detalle
        .mockResolvedValueOnce(marcaDetalle())
        .mockResolvedValueOnce(marcaDetalle({ restaurantes: [restaurante({ activo: false })] }))
        .mockResolvedValueOnce(marcaDetalle())
      renderPagina()
      await screen.findByRole('heading', { name: 'La Parrilla' })

      await userEvent.click(screen.getByRole('button', { name: 'Acciones de La Parrilla Centro' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Dar de baja' }))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Dar de baja' }))

      expect(restaurantes.baja).toHaveBeenCalledWith('rest-1')
      expect(await screen.findByText('Restaurante dado de baja')).toBeInTheDocument()
      await userEvent.click(await screen.findByRole('button', { name: 'Acciones de La Parrilla Centro' }))
      expect(screen.getAllByRole('menuitem').map((o) => o.textContent)).toEqual(['Editar nombre', 'Reactivar'])

      await userEvent.click(screen.getByRole('menuitem', { name: 'Reactivar' }))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivar' }))

      expect(restaurantes.reactivar).toHaveBeenCalledWith('rest-1')
      expect(await screen.findByText('Restaurante reactivado')).toBeInTheDocument()
    })

    it('si la baja del restaurante falla, el diálogo sigue abierto con el error', async () => {
      restaurantes.baja.mockRejectedValue(new ApiError(500, 'Error 500'))
      renderPagina()
      await screen.findByRole('heading', { name: 'La Parrilla' })
      await userEvent.click(screen.getByRole('button', { name: 'Acciones de La Parrilla Centro' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Dar de baja' }))

      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Dar de baja' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos completar la acción.')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(marcas.detalle).toHaveBeenCalledTimes(1)
    })
  })

  describe('dueños', () => {
    const JUAN = { id: 'dueno-1', membresiaId: 'membresia-1', email: 'juan@laparrilla.com', nombre: 'Juan' }
    const ANA = { id: 'dueno-2', membresiaId: 'membresia-2', email: 'ana@laparrilla.com', nombre: 'Ana' }

    it('el menú de cada dueño tiene una sola acción: "Quitar acceso"', async () => {
      marcas.detalle.mockResolvedValue(marcaDetalle({ duenos: [JUAN, ANA] }))
      renderPagina()
      await screen.findByRole('heading', { name: 'La Parrilla' })

      await userEvent.click(screen.getByRole('button', { name: 'Acciones de Ana' }))

      expect(screen.getAllByRole('menuitem').map((o) => o.textContent)).toEqual(['Quitar acceso'])
    })

    it('invitar abre el diálogo con la marca ya elegida, invita, cuenta que salió el mail y vuelve a pedir la marca', async () => {
      duenos.invitar.mockResolvedValue({ usuarioId: 'u', membresiaId: 'm', invitacionEnviada: true })
      marcas.detalle
        .mockResolvedValueOnce(marcaDetalle())
        .mockResolvedValueOnce(marcaDetalle({ duenos: [JUAN, ANA] }))
      renderPagina()
      await userEvent.click(await screen.findByRole('button', { name: 'Invitar dueño' }))

      const dialogo = within(screen.getByRole('dialog', { name: 'Invitar dueño' }))
      expect(dialogo.getByText('La Parrilla')).toBeInTheDocument()
      await userEvent.type(dialogo.getByLabelText('Nombre *'), 'Ana')
      await userEvent.type(dialogo.getByLabelText('Email *'), 'ana@laparrilla.com')
      await userEvent.click(dialogo.getByRole('button', { name: 'Enviar invitación' }))

      expect(duenos.invitar).toHaveBeenCalledWith('marca-1', { email: 'ana@laparrilla.com', nombre: 'Ana' })
      expect(await screen.findByRole('dialog', { name: 'Invitación enviada' })).toBeInTheDocument()
      expect(await seccion('Dueños').findByText('Ana')).toBeInTheDocument()
      expect(marcas.detalle).toHaveBeenCalledTimes(2)
    })

    it('si la persona ya tenía cuenta, lo cuenta', async () => {
      duenos.invitar.mockResolvedValue({ usuarioId: 'u', membresiaId: 'm', invitacionEnviada: false })
      renderPagina()
      await userEvent.click(await screen.findByRole('button', { name: 'Invitar dueño' }))
      await userEvent.type(screen.getByLabelText('Nombre *'), 'Ana')
      await userEvent.type(screen.getByLabelText('Email *'), 'ana@laparrilla.com')

      await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

      expect(await screen.findByRole('dialog', { name: 'Ya tenía una cuenta' })).toBeInTheDocument()
    })

    it('quitar a uno de dos dueños pide confirmar, quita con el id de la membresía, vuelve a pedir la marca y avisa', async () => {
      duenos.quitar.mockResolvedValue(undefined)
      marcas.detalle
        .mockResolvedValueOnce(marcaDetalle({ duenos: [JUAN, ANA] }))
        .mockResolvedValueOnce(marcaDetalle({ duenos: [JUAN] }))
      renderPagina()
      await screen.findByRole('heading', { name: 'La Parrilla' })

      await userEvent.click(screen.getByRole('button', { name: 'Acciones de Ana' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Quitar acceso' }))
      const dialogo = within(screen.getByRole('dialog', { name: 'Quitar el acceso de Ana' }))
      expect(dialogo.getByText(/deja de poder administrar «La Parrilla»/)).toBeInTheDocument()
      await userEvent.click(dialogo.getByRole('button', { name: 'Quitar acceso' }))

      expect(duenos.quitar).toHaveBeenCalledWith('membresia-2')
      expect(await screen.findByRole('status')).toHaveTextContent('Acceso quitado')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(marcas.detalle).toHaveBeenCalledTimes(2)
      expect(seccion('Dueños').queryByText('Ana')).not.toBeInTheDocument()
    })

    it('el único dueño de una marca activa no se quita: explica y ofrece invitar a otro, sin llamar a la API', async () => {
      renderPagina()
      await screen.findByRole('heading', { name: 'La Parrilla' })

      await userEvent.click(screen.getByRole('button', { name: 'Acciones de Juan' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Quitar acceso' }))

      expect(screen.getByRole('dialog', { name: 'No se puede quitar todavía' })).toBeInTheDocument()
      expect(screen.getByText(/único dueño/)).toBeInTheDocument()
      expect(duenos.quitar).not.toHaveBeenCalled()

      await userEvent.click(screen.getByRole('button', { name: 'Invitar a otro dueño' }))

      expect(screen.getByRole('dialog', { name: 'Invitar dueño' })).toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'No se puede quitar todavía' })).not.toBeInTheDocument()
    })

    it('el único dueño de una marca de baja sí se puede quitar', async () => {
      marcas.detalle.mockResolvedValue(marcaDetalle({ activo: false }))
      renderPagina()
      await screen.findByRole('heading', { name: 'La Parrilla' })

      await userEvent.click(screen.getByRole('button', { name: 'Acciones de Juan' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Quitar acceso' }))

      expect(screen.getByRole('dialog', { name: 'Quitar el acceso de Juan' })).toBeInTheDocument()
    })

    it('si la API rechaza quitarlo (409 por una carrera), el diálogo muestra el texto y no se vuelve a pedir la marca', async () => {
      duenos.quitar.mockRejectedValue(new ApiError(409, 'Es el único dueño de «La Parrilla», una marca activa'))
      marcas.detalle.mockResolvedValue(marcaDetalle({ duenos: [JUAN, ANA] }))
      renderPagina()
      await screen.findByRole('heading', { name: 'La Parrilla' })
      await userEvent.click(screen.getByRole('button', { name: 'Acciones de Ana' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Quitar acceso' }))

      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Quitar acceso' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Es el único dueño de «La Parrilla»')
      expect(marcas.detalle).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })

  describe('errores de carga', () => {
    it('una marca que no existe dice "No encontramos esa marca" y no ofrece reintentar', async () => {
      marcas.detalle.mockRejectedValue(new ApiError(404, 'No existe'))
      renderPagina('marca-inexistente')

      expect(await screen.findByText('No encontramos esa marca')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Marcas' })).toBeInTheDocument()
    })

    it('un error del servidor ofrece reintentar', async () => {
      marcas.detalle.mockRejectedValueOnce(new ApiError(500, 'Error 500'))
      renderPagina()

      expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los datos.')
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

      expect(await screen.findByRole('heading', { name: 'La Parrilla' })).toBeInTheDocument()
    })

    it('sin red lo dice', async () => {
      marcas.detalle.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      renderPagina()

      expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión.')
    })
  })

  it('al pasar a otra marca no queda a la vista lo de la anterior mientras carga', async () => {
    const otra = promesaManual<ReturnType<typeof marcaDetalle>>()
    marcas.detalle.mockResolvedValueOnce(marcaDetalle()).mockReturnValueOnce(otra.promesa)
    renderPagina()
    await screen.findByRole('heading', { name: 'La Parrilla' })

    await userEvent.click(screen.getByRole('link', { name: 'Ir a la otra marca' }))

    expect(screen.queryByRole('heading', { name: 'La Parrilla' })).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('Cargando').length).toBeGreaterThan(0)
    otra.resolver(marcaDetalle({ id: 'marca-2', nombre: 'Café del Puerto' }))
    expect(await screen.findByRole('heading', { name: 'Café del Puerto' })).toBeInTheDocument()
    expect(marcas.detalle).toHaveBeenLastCalledWith('marca-2')
  })
})
