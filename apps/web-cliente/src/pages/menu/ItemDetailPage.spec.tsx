import type { MenuPublico, MenuPublicoItem } from '@menyu/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../services/api'
import { useCarritoStore } from '../../store/carritoStore'
import { usePublicMenuStore } from '../../store/publicMenuStore'
import { useSessionStore } from '../../store/sessionStore'
import { crearExtra, crearMenu, crearPlato, crearPlatoEnDescuento } from '../../test/fixtures'
import { ItemDetailPage } from './ItemDetailPage'
import { axe } from '../../test/axe'
import userEvent from '@testing-library/user-event'
import { useAnunciadorStore } from '../../utils/anunciador'

vi.mock('../../services/api', () => ({
  api: { menu: { publico: vi.fn() } },
}))

// Plato de $1000 con 20% de descuento ($800) y un extra de $150.
const queso = crearExtra({
  id: 'ii-queso',
  precioExtra: 150,
  cantidadMax: 3,
  ingrediente: { id: 'ing-queso', restauranteId: 'rest-1', nombre: 'Queso extra', esAlergeno: false },
})
const hamburguesaEnDescuento = () =>
  crearPlatoEnDescuento({ id: 'hamb', nombre: 'Hamburguesa', precioBase: 1000, precioDescuento: 800, ingredientes: [queso] })

function renderDetalle(itemId: string, menu: MenuPublico) {
  usePublicMenuStore.setState({ menu, loading: false, error: null })
  return render(
    <MemoryRouter initialEntries={[`/menu/${itemId}`]}>
      <Routes>
        <Route path="/menu/:itemId" element={<ItemDetailPage />} />
        <Route path="/menu" element={<p>Pantalla del menú</p>} />
        <Route path="/carrito" element={<p>Pantalla del carrito</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const menuConCategoria = (...platos: MenuPublicoItem[]) =>
  crearMenu({ categorias: [{ id: 'cat-1', nombre: 'Principales', orden: 1, itemsDirectos: platos }] })

const botonAgregar = () => screen.getByRole('button', { name: /Agregar al pedido/ })

describe('ItemDetailPage', () => {
  // El estado se reinicia antes de cada test, no después: al terminar, la página sigue montada hasta que
  // Testing Library la desmonta, y un cambio de estado en ese momento dispara un render fuera de act().
  beforeEach(() => {
    useSessionStore.setState({ restauranteId: 'rest-1' })
    usePublicMenuStore.setState({ menu: null, loading: false, error: null })
    useCarritoStore.getState().vaciar()
    localStorage.clear()
  })

  describe('plato en descuento', () => {
    it('muestra el círculo con el porcentaje en la foto', () => {
      renderDetalle('hamb', menuConCategoria(hamburguesaEnDescuento()))

      expect(screen.getByRole('img', { name: '20% de descuento' })).toHaveTextContent('-20%')
    })

    it('muestra el precio original tachado y el precio con descuento', () => {
      const { container } = renderDetalle('hamb', menuConCategoria(hamburguesaEnDescuento()))

      expect(container.querySelector('s')).toHaveTextContent('$ 1.000')
      expect(container).toHaveTextContent('Antes $ 1.000, ahora $ 800')
    })

    it('el botón de agregar parte del precio con descuento', () => {
      renderDetalle('hamb', menuConCategoria(hamburguesaEnDescuento()))

      expect(botonAgregar()).toHaveTextContent('$ 800')
    })

    it('los extras se suman a precio normal, sin descuento', () => {
      renderDetalle('hamb', menuConCategoria(hamburguesaEnDescuento()))

      fireEvent.click(screen.getByRole('button', { name: 'Sumar Queso extra' }))

      expect(botonAgregar()).toHaveTextContent('$ 950') // 800 + 150
    })

    it('la cantidad multiplica el precio con descuento más los extras', () => {
      renderDetalle('hamb', menuConCategoria(hamburguesaEnDescuento()))

      fireEvent.click(screen.getByRole('button', { name: 'Sumar Queso extra' })) // 1 extra
      fireEvent.click(screen.getByRole('button', { name: 'Sumar Hamburguesa' })) // 2 platos

      expect(botonAgregar()).toHaveTextContent('$ 1.900') // (800 + 150) × 2
    })

    it('al agregar, el carrito guarda el precio con descuento más los extras', () => {
      renderDetalle('hamb', menuConCategoria(hamburguesaEnDescuento()))
      fireEvent.click(screen.getByRole('button', { name: 'Sumar Queso extra' }))

      fireEvent.click(botonAgregar())

      const [enCarrito] = useCarritoStore.getState().items
      expect(enCarrito).toMatchObject({ itemMenuId: 'hamb', precioUnitario: 950, cantidad: 1 })
      expect(screen.getByText('Pantalla del carrito')).toBeInTheDocument()
    })

    it('sin extras, el carrito guarda el precio con descuento', () => {
      renderDetalle('hamb', menuConCategoria(hamburguesaEnDescuento()))

      fireEvent.click(botonAgregar())

      expect(useCarritoStore.getState().items[0].precioUnitario).toBe(800)
    })

    it('encuentra un plato que solo está en la sección de descuentos', () => {
      renderDetalle('hamb', crearMenu({ descuentos: [hamburguesaEnDescuento()] }))

      expect(screen.getByRole('heading', { name: 'Hamburguesa' })).toBeInTheDocument()
      expect(botonAgregar()).toHaveTextContent('$ 800')
    })
  })

  describe('plato sin descuento', () => {
    const milanesa = () => crearPlato({ id: 'mila', nombre: 'Milanesa', precioBase: 1000, ingredientes: [queso] })

    it('no muestra el círculo ni un precio tachado', () => {
      const { container } = renderDetalle('mila', menuConCategoria(milanesa()))

      expect(screen.queryByRole('img', { name: /de descuento/ })).not.toBeInTheDocument()
      expect(container.querySelector('s')).toBeNull()
    })

    it('el botón de agregar parte del precio base', () => {
      renderDetalle('mila', menuConCategoria(milanesa()))

      expect(botonAgregar()).toHaveTextContent('$ 1.000')
    })

    it('los extras se suman al precio base', () => {
      renderDetalle('mila', menuConCategoria(milanesa()))

      fireEvent.click(screen.getByRole('button', { name: 'Sumar Queso extra' }))

      expect(botonAgregar()).toHaveTextContent('$ 1.150')
    })

    it('un extra con centavos los escribe con coma, y el total del botón también', () => {
      const conCentavos = crearExtra({
        id: 'ii-centavos',
        precioExtra: 150.5,
        ingrediente: { id: 'ing-centavos', restauranteId: 'rest-1', nombre: 'Panceta', esAlergeno: false },
      })
      renderDetalle('mila', menuConCategoria(crearPlato({ id: 'mila', nombre: 'Milanesa', precioBase: 1000, ingredientes: [conCentavos] })))

      expect(screen.getByText('+$ 150,50')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Sumar Panceta' }))

      expect(botonAgregar()).toHaveTextContent('$ 1.150,50')
    })
  })

  it('un plato que no está en el menú muestra "Ítem no encontrado"', () => {
    renderDetalle('no-existe', menuConCategoria(crearPlato()))

    expect(screen.getByText('Ítem no encontrado')).toBeInTheDocument()
  })

  describe('estructura de la pantalla (accesibilidad)', () => {
    it('el nombre del plato es el <h1> y todo el contenido va dentro del <main>', () => {
      renderDetalle('hamb', menuConCategoria(hamburguesaEnDescuento()))

      expect(screen.getByRole('heading', { level: 1, name: 'Hamburguesa' })).toBeInTheDocument()
      const principal = screen.getByRole('main')
      expect(principal).toContainElement(botonAgregar())
    })

    it('un plato que no está en el menú tiene su <h1> y su <main>', () => {
      renderDetalle('no-existe', menuConCategoria(crearPlato()))

      expect(screen.getByRole('heading', { level: 1, name: 'Ítem no encontrado' })).toBeInTheDocument()
      expect(screen.getByRole('main')).toBeInTheDocument()
    })

    it('si el menú no se pudo cargar, también', async () => {
      vi.mocked(api.menu.publico).mockRejectedValue(new Error('Error 500'))
      render(
        <MemoryRouter initialEntries={['/menu/hamb']}>
          <Routes>
            <Route path="/menu/:itemId" element={<ItemDetailPage />} />
          </Routes>
        </MemoryRouter>,
      )

      expect(await screen.findByRole('heading', { level: 1, name: 'No se pudo cargar el menú' })).toBeInTheDocument()
      expect(screen.getByRole('main')).toBeInTheDocument()
    })

    it('mientras carga ya hay un <main>', () => {
      vi.mocked(api.menu.publico).mockReturnValue(new Promise(() => {}))
      render(
        <MemoryRouter initialEntries={['/menu/hamb']}>
          <Routes>
            <Route path="/menu/:itemId" element={<ItemDetailPage />} />
          </Routes>
        </MemoryRouter>,
      )

      expect(screen.getByRole('main')).toBeInTheDocument()
    })

    it('no tiene violaciones de accesibilidad (axe)', async () => {
      const { container } = renderDetalle('hamb', menuConCategoria(hamburguesaEnDescuento()))

      expect(await axe(container)).toHaveNoViolations()
    })
  })

  describe('lectores de pantalla (accesibilidad)', () => {
    const cebolla = crearExtra({
      id: 'ii-cebolla',
      esOriginal: true,
      esRemovible: true,
      esAgregable: false,
      precioExtra: 0,
      cantidadMax: 1,
      ingrediente: { id: 'ing-cebolla', restauranteId: 'rest-1', nombre: 'Cebolla', esAlergeno: true },
    })
    const tomate = crearExtra({
      id: 'ii-tomate',
      esOriginal: true,
      esRemovible: true,
      esAgregable: false,
      precioExtra: 0,
      cantidadMax: 1,
      ingrediente: { id: 'ing-tomate', restauranteId: 'rest-1', nombre: 'Tomate', esAlergeno: false },
    })
    const hamburguesa = () => crearPlato({ id: 'hamb', nombre: 'Hamburguesa', precioBase: 1000, ingredientes: [cebolla, tomate, queso] })
    const anunciado = () => useAnunciadorStore.getState().mensaje

    beforeEach(() => {
      useAnunciadorStore.setState({ mensaje: '', numero: 0 })
    })

    describe('la estructura', () => {
      it('"Personalizá tu plato" es un encabezado de nivel 2 y "Quitar ingredientes" y "Agregar extras", de nivel 3', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))

        expect(screen.getByRole('heading', { level: 1, name: 'Hamburguesa' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 2, name: 'Personalizá tu plato' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 3, name: 'Quitar ingredientes' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 3, name: 'Agregar extras' })).toBeInTheDocument()
      })

      it('un plato sin ingredientes que personalizar no muestra esos encabezados', () => {
        renderDetalle('mila', menuConCategoria(crearPlato({ id: 'mila', nombre: 'Milanesa', ingredientes: [] })))

        expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
        expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
      })

      it('solo con extras, no aparece "Quitar ingredientes"', () => {
        renderDetalle('mila', menuConCategoria(crearPlato({ id: 'mila', nombre: 'Milanesa', ingredientes: [queso] })))

        expect(screen.queryByRole('heading', { name: 'Quitar ingredientes' })).not.toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 3, name: 'Agregar extras' })).toBeInTheDocument()
      })
    })

    describe('quitar un ingrediente es un interruptor con el ingrediente y su estado', () => {
      it('se llama "{ingrediente}, incluida" y está activado; al tocarlo pasa a "…, quitada" y se desactiva', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))

        const interruptor = screen.getByRole('switch', { name: 'Cebolla, incluida' })
        expect(interruptor).toHaveAttribute('aria-checked', 'true')

        fireEvent.click(interruptor)

        expect(screen.getByRole('switch', { name: 'Cebolla, quitada' })).toHaveAttribute('aria-checked', 'false')
        expect(screen.queryByRole('switch', { name: 'Cebolla, incluida' })).not.toBeInTheDocument()
      })

      it('cada ingrediente tiene el suyo y no se afectan entre sí', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))

        fireEvent.click(screen.getByRole('switch', { name: 'Tomate, incluida' }))

        expect(screen.getByRole('switch', { name: 'Tomate, quitada' })).toBeInTheDocument()
        expect(screen.getByRole('switch', { name: 'Cebolla, incluida' })).toBeInTheDocument()
      })

      it('volver a tocarlo lo restaura', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))

        fireEvent.click(screen.getByRole('switch', { name: 'Cebolla, incluida' }))
        fireEvent.click(screen.getByRole('switch', { name: 'Cebolla, quitada' }))

        expect(screen.getByRole('switch', { name: 'Cebolla, incluida' })).toHaveAttribute('aria-checked', 'true')
      })

      it('lo que se quita llega al carrito como modificación', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))
        fireEvent.click(screen.getByRole('switch', { name: 'Cebolla, incluida' }))

        fireEvent.click(botonAgregar())

        expect(useCarritoStore.getState().items[0].modificaciones).toEqual([
          expect.objectContaining({ itemIngredienteId: 'ii-cebolla', accion: 'quitar', nombre: 'Cebolla' }),
        ])
      })
    })

    describe('el alérgeno se dice con texto', () => {
      it('un ingrediente con alérgeno dice "(contiene alérgeno)" y el emoji es decorativo', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))

        expect(screen.getByText(/contiene alérgeno/)).toBeInTheDocument()
        expect(screen.getByText('⚠️')).toHaveAttribute('aria-hidden', 'true')
        expect(screen.getByText(/contiene alérgeno/).className).toContain('sr-only')
      })

      it('solo el que lo tiene: uno sin alérgeno no dice nada', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))

        expect(screen.getAllByText(/contiene alérgeno/)).toHaveLength(1)
        expect(screen.getAllByText('⚠️')).toHaveLength(1)
      })
    })

    describe('la cantidad de un extra', () => {
      it('los botones se llaman "Sumar {extra}" y "Restar {extra}"', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))

        expect(screen.getByRole('button', { name: 'Sumar Queso extra' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Restar Queso extra' })).toBeInTheDocument()
      })

      it('al sumar anuncia "Queso extra: 1", y al restar, "Queso extra: 0"', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))

        fireEvent.click(screen.getByRole('button', { name: 'Sumar Queso extra' }))
        expect(anunciado()).toBe('Queso extra: 1')

        fireEvent.click(screen.getByRole('button', { name: 'Restar Queso extra' }))
        expect(anunciado()).toBe('Queso extra: 0')
      })

      it('sin ninguno, "Restar" queda atenuado y no hace nada', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))

        const restar = screen.getByRole('button', { name: 'Restar Queso extra' })
        expect(restar).toHaveAttribute('aria-disabled', 'true')
        fireEvent.click(restar)

        expect(anunciado()).toBe('')
        expect(botonAgregar()).toHaveTextContent('$ 1.000')
      })

      it('en el máximo (3) "Sumar" queda atenuado, no suma de más ni anuncia, y no pierde el foco', async () => {
        const usuario = userEvent.setup()
        renderDetalle('hamb', menuConCategoria(hamburguesa()))
        const sumar = screen.getByRole('button', { name: 'Sumar Queso extra' })

        await usuario.click(sumar)
        await usuario.click(sumar)
        await usuario.click(sumar)
        expect(anunciado()).toBe('Queso extra: 3')
        expect(sumar).toHaveAttribute('aria-disabled', 'true')
        expect(sumar).toHaveFocus()

        await usuario.click(sumar)

        expect(anunciado()).toBe('Queso extra: 3')
        expect(useAnunciadorStore.getState().numero).toBe(3)
        expect(botonAgregar()).toHaveTextContent('$ 1.450')
      })
    })

    describe('la cantidad del plato', () => {
      it('dice "Cantidad" (no "Cant.") y los botones se llaman "Sumar Hamburguesa" y "Restar Hamburguesa"', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))

        expect(screen.getByText('Cantidad')).toBeInTheDocument()
        expect(screen.queryByText('Cant.')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Sumar Hamburguesa' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Restar Hamburguesa' })).toBeInTheDocument()
      })

      it('al sumar anuncia "Hamburguesa: 2" y cambia el total del botón', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))

        fireEvent.click(screen.getByRole('button', { name: 'Sumar Hamburguesa' }))

        expect(anunciado()).toBe('Hamburguesa: 2')
        expect(botonAgregar()).toHaveTextContent('$ 2.000')
      })

      it('no baja de 1: "Restar" queda atenuado y no hace nada', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))
        const restar = screen.getByRole('button', { name: 'Restar Hamburguesa' })

        expect(restar).toHaveAttribute('aria-disabled', 'true')
        fireEvent.click(restar)

        expect(anunciado()).toBe('')
        expect(botonAgregar()).toHaveTextContent('$ 1.000')
      })

      it('sin tope: se puede seguir sumando', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))
        const sumar = screen.getByRole('button', { name: 'Sumar Hamburguesa' })

        for (let i = 0; i < 5; i++) fireEvent.click(sumar)

        expect(sumar).toHaveAttribute('aria-disabled', 'false')
        expect(anunciado()).toBe('Hamburguesa: 6')
      })
    })

    describe('la nota para cocina', () => {
      it('el título está asociado al campo (se anuncia "Nota para cocina") y el emoji es decorativo', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))

        // Por rol y nombre accesible, que es lo que percibe el lector: getByLabelText cuenta también el texto del emoji oculto.
        const campo = screen.getByRole('textbox', { name: 'Nota para cocina' })
        expect(campo.tagName).toBe('TEXTAREA')
        expect(screen.getByText('📝')).toHaveAttribute('aria-hidden', 'true')
      })

      it('lo que se escribe llega al carrito', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))

        fireEvent.change(screen.getByRole('textbox', { name: 'Nota para cocina' }), { target: { value: 'sin sal' } })
        fireEvent.click(botonAgregar())

        expect(useCarritoStore.getState().items[0].nota).toBe('sin sal')
      })
    })

    describe('volver y agregar', () => {
      it('el botón de volver se llama "Volver", la flecha es decorativa, y lleva al menú', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))

        const volver = screen.getByRole('button', { name: 'Volver' })
        expect(volver.querySelector('[aria-hidden="true"]')).toHaveTextContent('←')
        fireEvent.click(volver)

        expect(screen.getByText('Pantalla del menú')).toBeInTheDocument()
      })

      it('al agregar anuncia "Se agregó {plato} al carrito" (forma impersonal: no depende del género del plato) y pasa al carrito', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))

        fireEvent.click(botonAgregar())

        expect(anunciado()).toBe('Se agregó Hamburguesa al carrito')
        expect(screen.getByText('Pantalla del carrito')).toBeInTheDocument()
      })

      it('si es un plato que ya está en el carrito (se edita), anuncia que se guardaron los cambios', () => {
        useCarritoStore.getState().agregar({ itemMenuId: 'hamb', nombre: 'Hamburguesa', precioUnitario: 1000, cantidad: 1, modificaciones: [] })
        const { cartId } = useCarritoStore.getState().items[0]
        usePublicMenuStore.setState({ menu: menuConCategoria(hamburguesa()), loading: false, error: null })
        render(
          <MemoryRouter initialEntries={[{ pathname: '/menu/hamb', state: { cartId } }]}>
            <Routes>
              <Route path="/menu/:itemId" element={<ItemDetailPage />} />
              <Route path="/carrito" element={<p>Pantalla del carrito</p>} />
            </Routes>
          </MemoryRouter>,
        )

        fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }))

        expect(anunciado()).toBe('Se guardaron los cambios de Hamburguesa')
        expect(useCarritoStore.getState().items).toHaveLength(1)
      })

      it('el emoji del carrito del botón es decorativo: el nombre es "Agregar al pedido" y el total', () => {
        renderDetalle('hamb', menuConCategoria(hamburguesa()))

        expect(botonAgregar().querySelector('[aria-hidden="true"]')).toHaveTextContent('🛒')
        expect(botonAgregar()).toHaveAccessibleName(/^Agregar al pedido/)
      })
    })

    it('la foto es decorativa: el nombre del plato ya es el título', () => {
      const { container } = renderDetalle('hamb', menuConCategoria(hamburguesa()))

      expect(container.querySelector('img')).toHaveAttribute('alt', '')
      expect(screen.queryByRole('img', { name: 'Hamburguesa' })).not.toBeInTheDocument()
    })

    it('no tiene violaciones de accesibilidad (axe), con ingredientes, extras y una cantidad elegida', async () => {
      const { container } = renderDetalle('hamb', menuConCategoria(hamburguesa()))
      expect(await axe(container)).toHaveNoViolations()

      fireEvent.click(screen.getByRole('switch', { name: 'Cebolla, incluida' }))
      fireEvent.click(screen.getByRole('button', { name: 'Sumar Queso extra' }))
      fireEvent.click(screen.getByRole('button', { name: 'Sumar Hamburguesa' }))

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
