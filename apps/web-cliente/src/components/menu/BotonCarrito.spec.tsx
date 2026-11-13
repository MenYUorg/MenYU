import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useCarritoStore } from '../../store/carritoStore'
import { axe } from '../../test/axe'
import { BotonCarrito } from './BotonCarrito'

function renderBoton() {
  return render(
    <MemoryRouter initialEntries={['/menu']}>
      <Routes>
        <Route path="/menu" element={<BotonCarrito />} />
        <Route path="/carrito" element={<p>Pantalla del carrito</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const agregar = (itemMenuId: string, nombre: string, cantidad: number) =>
  useCarritoStore.getState().agregar({ itemMenuId, nombre, precioUnitario: 1000, cantidad, modificaciones: [] })

beforeEach(() => {
  localStorage.clear()
  useCarritoStore.getState().vaciar()
})

describe('BotonCarrito', () => {
  it('con el carrito vacío no aparece', () => {
    renderBoton()

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('con un plato dice "Ver carrito, 1 ítem" (singular)', () => {
    agregar('hamb', 'Hamburguesa', 1)

    renderBoton()

    expect(screen.getByRole('button', { name: 'Ver carrito, 1 ítem' })).toBeInTheDocument()
  })

  it('cuenta unidades, no líneas: 3 hamburguesas y 2 flanes son "5 ítems"', () => {
    agregar('hamb', 'Hamburguesa', 3)
    agregar('flan', 'Flan', 2)

    renderBoton()

    expect(screen.getByRole('button', { name: 'Ver carrito, 5 ítems' })).toBeInTheDocument()
    expect(useCarritoStore.getState().items).toHaveLength(2)
  })

  it('una sola línea con varias unidades también suma las unidades', () => {
    agregar('hamb', 'Hamburguesa', 4)

    renderBoton()

    expect(screen.getByRole('button', { name: 'Ver carrito, 4 ítems' })).toBeInTheDocument()
  })

  it('el número que se ve es el mismo que dice el nombre (WCAG 2.5.3), y es decorativo para el lector', () => {
    agregar('hamb', 'Hamburguesa', 3)
    agregar('flan', 'Flan', 2)

    renderBoton()

    const boton = screen.getByRole('button', { name: 'Ver carrito, 5 ítems' })
    expect(boton).toHaveTextContent('5')
    const decorativos = Array.from(boton.querySelectorAll('[aria-hidden="true"]')).map((e) => e.textContent)
    expect(decorativos).toEqual(['🛒', '5'])
  })

  it('un número de dos cifras entra en el círculo (crece en vez de salirse)', () => {
    agregar('hamb', 'Hamburguesa', 12)

    renderBoton()

    const numero = screen.getByRole('button', { name: 'Ver carrito, 12 ítems' }).querySelectorAll('[aria-hidden="true"]')[1] as HTMLElement
    expect(numero).toHaveTextContent('12')
    expect(numero).toHaveStyle({ minWidth: '22px', height: '22px' })
  })

  it('se actualiza cuando cambia el carrito: aparece con el primer plato y sigue las unidades', () => {
    renderBoton()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    act(() => agregar('hamb', 'Hamburguesa', 1))
    expect(screen.getByRole('button', { name: 'Ver carrito, 1 ítem' })).toBeInTheDocument()

    act(() => agregar('flan', 'Flan', 2))
    expect(screen.getByRole('button', { name: 'Ver carrito, 3 ítems' })).toBeInTheDocument()
  })

  it('lleva al carrito', () => {
    agregar('hamb', 'Hamburguesa', 2)
    renderBoton()

    fireEvent.click(screen.getByRole('button', { name: 'Ver carrito, 2 ítems' }))

    expect(screen.getByText('Pantalla del carrito')).toBeInTheDocument()
  })

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    agregar('hamb', 'Hamburguesa', 3)
    const { container } = renderBoton()

    expect(await axe(container)).toHaveNoViolations()
  })
})
