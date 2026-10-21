import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pencil, Trash2 } from 'lucide-react'
import { ChipEstado, ErrorDeCarga, Interruptor, MenuDeAcciones } from './piezas'
import { plural, siglasDe, sinAcentos, slugDe } from './texto'

describe('siglasDe', () => {
  it('toma la inicial de las dos primeras palabras, en mayúscula', () => {
    expect(siglasDe('La Parrilla de Juan')).toBe('LP')
    expect(siglasDe('café del puerto')).toBe('CD')
  })

  it('con una sola palabra, una sola letra; sin nombre, un signo de pregunta', () => {
    expect(siglasDe('Sushi')).toBe('S')
    expect(siglasDe('   ')).toBe('?')
    expect(siglasDe('')).toBe('?')
  })
})

describe('plural, sinAcentos y slugDe', () => {
  it('plural distingue uno de los demás (cero incluido)', () => {
    expect(plural(1, 'restaurante', 'restaurantes')).toBe('1 restaurante')
    expect(plural(0, 'restaurante', 'restaurantes')).toBe('0 restaurantes')
    expect(plural(3, 'dueño', 'dueños')).toBe('3 dueños')
  })

  it('sinAcentos ignora mayúsculas y acentos', () => {
    expect(sinAcentos('CAFÉ del Pingüino')).toBe('cafe del pinguino')
  })

  it('slugDe arma un identificador válido con el nombre', () => {
    expect(slugDe('Café del Puerto')).toBe('cafe-del-puerto')
    expect(slugDe('  La  Parrilla — de Juan!  ')).toBe('la-parrilla-de-juan')
    expect(slugDe('Ñandú 2')).toBe('nandu-2')
    expect(slugDe('***')).toBe('')
  })
})

describe('ChipEstado', () => {
  it('concuerda el género: una marca "Activa", un restaurante "Activo"', () => {
    const { rerender } = render(<ChipEstado activo femenino />)
    expect(screen.getByText('Activa')).toBeInTheDocument()
    rerender(<ChipEstado activo />)
    expect(screen.getByText('Activo')).toBeInTheDocument()
    rerender(<ChipEstado activo={false} />)
    expect(screen.getByText('De baja')).toBeInTheDocument()
  })
})

describe('ErrorDeCarga', () => {
  it('distingue "sin conexión" de un error del servidor y permite reintentar', async () => {
    const reintentar = vi.fn()
    const { rerender } = render(<ErrorDeCarga sinConexion={false} onReintentar={reintentar} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los datos.')

    rerender(<ErrorDeCarga sinConexion onReintentar={reintentar} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Sin conexión.')

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(reintentar).toHaveBeenCalledTimes(1)
  })
})

describe('Interruptor', () => {
  it('es un switch accesible que avisa el valor nuevo', async () => {
    const alCambiar = vi.fn()
    render(
      <Interruptor activo={false} onCambio={alCambiar}>
        Mostrar dadas de baja
      </Interruptor>,
    )

    const interruptor = screen.getByRole('switch', { name: 'Mostrar dadas de baja' })
    expect(interruptor).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(interruptor)
    expect(alCambiar).toHaveBeenCalledWith(true)
  })
})

describe('MenuDeAcciones', () => {
  function menu() {
    const editar = vi.fn()
    const borrar = vi.fn()
    render(
      <div>
        <button type="button">Afuera</button>
        <MenuDeAcciones
          etiqueta="Acciones de La Parrilla Centro"
          opciones={[
            { texto: 'Editar nombre', icono: Pencil, onElegir: editar },
            { texto: 'Dar de baja', icono: Trash2, peligro: true, separador: true, onElegir: borrar },
          ]}
        />
      </div>,
    )
    return { editar, borrar, boton: screen.getByRole('button', { name: 'Acciones de La Parrilla Centro' }) }
  }

  it('arranca cerrado y se abre con el botón', async () => {
    const { boton } = menu()

    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await userEvent.click(boton)

    expect(boton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem').map((o) => o.textContent)).toEqual(['Editar nombre', 'Dar de baja'])
  })

  it('elegir una opción la ejecuta y cierra el menú', async () => {
    const { boton, editar, borrar } = menu()
    await userEvent.click(boton)

    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar nombre' }))

    expect(editar).toHaveBeenCalledTimes(1)
    expect(borrar).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('se cierra con Escape', async () => {
    const { boton } = menu()
    await userEvent.click(boton)

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('se cierra al tocar afuera, pero no al tocar adentro', async () => {
    const { boton } = menu()
    await userEvent.click(boton)

    await userEvent.click(screen.getByRole('menu'))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Afuera' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('el botón vuelve a cerrarlo', async () => {
    const { boton } = menu()
    await userEvent.click(boton)
    await userEvent.click(boton)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
