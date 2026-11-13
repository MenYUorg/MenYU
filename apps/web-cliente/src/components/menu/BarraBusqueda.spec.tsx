import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { axe } from '../../test/axe'
import { useAnunciadorStore } from '../../utils/anunciador'
import { Anunciador } from '../Anunciador'
import { BarraBusqueda, type ClasificacionConCantidad } from './BarraBusqueda'

const CLASIFICACIONES: ClasificacionConCantidad[] = [
  { id: 'veg', nombre: 'Vegano', count: 2 },
  { id: 'tacc', nombre: 'Sin TACC', count: 1 },
]

/**
 * La barra con su estado, como la usa MenuView. `platosQueQuedan` dice cuántos platos hay según las dietas elegidas (en la
 * pantalla lo calcula MenuView con la búsqueda y el menú).
 */
function Barra({
  clasificaciones = CLASIFICACIONES,
  platosQueQuedan = (dietas) => (dietas.size === 0 ? 5 : 2),
}: {
  clasificaciones?: ClasificacionConCantidad[]
  platosQueQuedan?: (dietas: Set<string>) => number
}) {
  const [dietas, setDietas] = useState<Set<string>>(new Set())
  const [buscar, setBuscar] = useState('')
  return (
    <BarraBusqueda
      buscar={buscar}
      onBuscar={setBuscar}
      clasificaciones={clasificaciones}
      dietasActivas={dietas}
      onDietasActivas={setDietas}
      cantidadDePlatos={platosQueQuedan(dietas)}
    />
  )
}

const botonDeDietas = (nombre = 'Filtrar por dietas') => screen.getByRole('button', { name: nombre })
const abrirPanel = () => fireEvent.click(botonDeDietas())
const anunciado = () => useAnunciadorStore.getState().mensaje

beforeEach(() => {
  useAnunciadorStore.setState({ mensaje: '', numero: 0 })
})

describe('BarraBusqueda: el filtro de dietas', () => {
  describe('el botón', () => {
    it('se llama "Filtrar por dietas" y su texto visible, "Dietas", está en el nombre (WCAG 2.5.3)', () => {
      render(<Barra />)

      expect(botonDeDietas()).toHaveTextContent('Dietas')
      expect(botonDeDietas().getAttribute('aria-label')?.toLowerCase()).toContain('dietas')
    })

    it('el emoji y la flecha son decorativos: están ocultos del lector', () => {
      render(<Barra />)

      const ocultos = Array.from(botonDeDietas().querySelectorAll('[aria-hidden="true"]')).map((e) => e.textContent)
      expect(ocultos).toEqual(['🥗', '▾'])
    })

    it('con filtros activos dice cuántos: "1 filtro activo" y "2 filtros activos"', () => {
      render(<Barra />)
      abrirPanel()

      fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' }))
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' }))
      expect(botonDeDietas('Filtrar por dietas, 1 filtro activo')).toBeInTheDocument()

      fireEvent.click(botonDeDietas('Filtrar por dietas, 1 filtro activo'))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Sin TACC, 1 plato' }))
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar (2)' }))
      expect(botonDeDietas('Filtrar por dietas, 2 filtros activos')).toBeInTheDocument()
    })

    it('con filtros activos el número que se ve es decorativo (el nombre ya lo dice)', () => {
      render(<Barra />)
      abrirPanel()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' }))
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' }))

      const boton = botonDeDietas('Filtrar por dietas, 1 filtro activo')
      expect(boton.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2)
      expect(boton).toHaveTextContent('Dietas')
      expect(boton).toHaveTextContent('1')
    })

    it('dice si el panel está abierto (aria-expanded) y qué controla', () => {
      render(<Barra />)
      expect(botonDeDietas()).toHaveAttribute('aria-expanded', 'false')
      expect(botonDeDietas()).not.toHaveAttribute('aria-controls')

      abrirPanel()

      expect(botonDeDietas()).toHaveAttribute('aria-expanded', 'true')
      const panel = screen.getByRole('group', { name: 'Filtros de dieta' })
      expect(botonDeDietas()).toHaveAttribute('aria-controls', panel.id)
    })
  })

  describe('las opciones son casillas', () => {
    it('cada dieta es una casilla con su nombre y cuántos platos tiene, sin marcar al principio', () => {
      render(<Barra />)
      abrirPanel()

      expect(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' })).not.toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'Sin TACC, 1 plato' })).not.toBeChecked()
      expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    })

    it('se marca con un toque en la casilla o en cualquier lado de la fila (el nombre)', () => {
      render(<Barra />)
      abrirPanel()

      fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' }))
      expect(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' })).toBeChecked()

      fireEvent.click(screen.getByText('Sin TACC'))
      expect(screen.getByRole('checkbox', { name: 'Sin TACC, 1 plato' })).toBeChecked()

      fireEvent.click(screen.getByText('Vegano'))
      expect(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' })).not.toBeChecked()
    })

    it('se marca con el teclado (Espacio)', async () => {
      const usuario = userEvent.setup()
      render(<Barra />)
      abrirPanel()
      screen.getByRole('checkbox', { name: 'Vegano, 2 platos' }).focus()

      await usuario.keyboard(' ')

      expect(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' })).toBeChecked()
    })

    it('al volver a abrir el panel, las casillas parten de lo que está aplicado', () => {
      render(<Barra />)
      abrirPanel()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' }))
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' }))

      fireEvent.click(botonDeDietas('Filtrar por dietas, 1 filtro activo'))

      expect(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'Sin TACC, 1 plato' })).not.toBeChecked()
    })

    it('el recuadro que se ve es decorativo y muestra el foco con teclado cuando la casilla lo tiene (WCAG 2.4.7)', () => {
      render(<Barra />)
      abrirPanel()

      const casilla = screen.getByRole('checkbox', { name: 'Vegano, 2 platos' })
      expect(casilla.className).toContain('peer')
      const recuadro = casilla.nextElementSibling as HTMLElement
      expect(recuadro).toHaveAttribute('aria-hidden', 'true')
      expect(recuadro.className).toContain('peer-focus-visible:outline')
    })

    it('el número suelto de cada fila es decorativo (el nombre de la casilla ya dice los platos)', () => {
      render(<Barra />)
      abrirPanel()

      const numeros = screen.getAllByText(/^[12]$/)
      expect(numeros).toHaveLength(2)
      for (const numero of numeros) expect(numero).toHaveAttribute('aria-hidden', 'true')
    })

    it('sin clasificaciones lo dice, y no hay casillas', () => {
      render(<Barra clasificaciones={[]} />)
      abrirPanel()

      expect(screen.getByText('Sin clasificaciones disponibles')).toBeInTheDocument()
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })
  })

  describe('al aplicar o limpiar', () => {
    it('"Aplicar" cierra el panel, devuelve el foco al botón "Dietas" y anuncia cuántos platos quedan', () => {
      render(<Barra platosQueQuedan={() => 2} />)
      abrirPanel()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' }))

      fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' }))

      expect(screen.queryByRole('group', { name: 'Filtros de dieta' })).not.toBeInTheDocument()
      expect(botonDeDietas('Filtrar por dietas, 1 filtro activo')).toHaveFocus()
      expect(anunciado()).toBe('2 platos')
    })

    it('"Limpiar" también: cierra, devuelve el foco, saca los filtros y anuncia cuántos platos hay', () => {
      render(<Barra />)
      abrirPanel()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' }))
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' }))
      useAnunciadorStore.setState({ mensaje: '', numero: 0 })

      fireEvent.click(botonDeDietas('Filtrar por dietas, 1 filtro activo'))
      fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))

      expect(screen.queryByRole('group', { name: 'Filtros de dieta' })).not.toBeInTheDocument()
      expect(botonDeDietas()).toHaveFocus()
      expect(anunciado()).toBe('5 platos')
    })

    it('si queda un solo plato dice "1 plato", y si no queda ninguno, "Ningún plato coincide"', () => {
      const { unmount } = render(<Barra platosQueQuedan={() => 1} />)
      abrirPanel()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' }))
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' }))
      expect(anunciado()).toBe('1 plato')
      unmount()

      render(<Barra platosQueQuedan={() => 0} />)
      abrirPanel()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' }))
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' }))
      expect(anunciado()).toBe('Ningún plato coincide')
    })

    it('"Aplicar" sin marcar nada es lo mismo que limpiar: anuncia cuántos platos hay', () => {
      render(<Barra />)
      abrirPanel()

      fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

      expect(botonDeDietas()).toHaveFocus()
      expect(anunciado()).toBe('5 platos')
    })

    it('no anuncia nada al montarse, ni al abrir el panel, ni al marcar casillas (solo al aplicar o limpiar)', () => {
      render(<Barra />)
      expect(anunciado()).toBe('')

      abrirPanel()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Sin TACC, 1 plato' }))

      expect(anunciado()).toBe('')
      expect(useAnunciadorStore.getState().numero).toBe(0)
    })

    it('escribir en el buscador no anuncia nada desde acá (eso es de la etapa 4)', () => {
      render(<Barra />)

      fireEvent.change(screen.getByPlaceholderText('Buscar platos...'), { target: { value: 'ens' } })

      expect(anunciado()).toBe('')
    })

    it('el anuncio sale una sola vez por cada cambio', () => {
      render(<Barra />)
      abrirPanel()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' }))
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' }))

      expect(useAnunciadorStore.getState().numero).toBe(1)
    })
  })

  describe('cerrar el panel', () => {
    it('Esc lo cierra y el foco vuelve al botón', async () => {
      const usuario = userEvent.setup()
      render(<Barra />)
      abrirPanel()
      screen.getByRole('checkbox', { name: 'Vegano, 2 platos' }).focus()

      await usuario.keyboard('{Escape}')

      expect(screen.queryByRole('group', { name: 'Filtros de dieta' })).not.toBeInTheDocument()
      expect(botonDeDietas()).toHaveFocus()
      expect(botonDeDietas()).toHaveAttribute('aria-expanded', 'false')
    })

    it('Esc con el panel cerrado no mueve el foco (otros diálogos también usan Esc)', async () => {
      const usuario = userEvent.setup()
      render(<Barra />)
      const buscador = screen.getByPlaceholderText('Buscar platos...')
      buscador.focus()

      await usuario.keyboard('{Escape}')

      expect(buscador).toHaveFocus()
    })

    it('Esc no anuncia nada ni cambia los filtros', async () => {
      const usuario = userEvent.setup()
      render(<Barra />)
      abrirPanel()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' }))

      await usuario.keyboard('{Escape}')

      expect(anunciado()).toBe('')
      expect(botonDeDietas()).toBeInTheDocument()
    })

    it('tocar afuera cierra el panel', () => {
      render(<Barra />)
      abrirPanel()

      fireEvent.mouseDown(document.body)

      expect(screen.queryByRole('group', { name: 'Filtros de dieta' })).not.toBeInTheDocument()
    })

    it('tocar adentro no lo cierra', () => {
      render(<Barra />)
      abrirPanel()

      fireEvent.mouseDown(screen.getByText('Mostramos solo platos compatibles'))

      expect(screen.getByRole('group', { name: 'Filtros de dieta' })).toBeInTheDocument()
    })
  })

  describe('el anuncio llega al lector', () => {
    it('queda en la región viva del anunciador', async () => {
      render(<><Anunciador /><Barra platosQueQuedan={() => 3} /></>)
      abrirPanel()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' }))

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Aplicar (1)' })) })

      expect(screen.getByRole('status')).toHaveTextContent('3 platos')
    })
  })

  it('no tiene violaciones de accesibilidad (axe), con el panel cerrado, abierto y con una dieta marcada', async () => {
    const { container } = render(<Barra />)
    expect(await axe(container)).toHaveNoViolations()

    abrirPanel()
    expect(await axe(container)).toHaveNoViolations()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Vegano, 2 platos' }))
    expect(await axe(container, { rules: { 'label-content-name-mismatch': { enabled: true } } })).toHaveNoViolations()
  })
})
