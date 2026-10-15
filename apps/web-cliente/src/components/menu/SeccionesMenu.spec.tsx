import { fireEvent, render, screen } from '@testing-library/react'
import { crearPlato } from '../../test/fixtures'
import { SeccionesMenu } from './SeccionesMenu'

type Props = Parameters<typeof SeccionesMenu>[0]

const flan = crearPlato({ id: 'flan', nombre: 'Flan' })
const milanesa = crearPlato({ id: 'mila', nombre: 'Milanesa' })

const SIN_PLATOS: Props = {
  descuentos: [],
  recomendados: [],
  nombreRecomendados: 'RECOMENDACIONES',
  categorias: [],
  registrar: () => {},
  buscar: '',
  hayDietas: false,
  onLimpiarFiltros: () => {},
}

const renderSecciones = (parcial: Partial<Props> = {}) => render(<SeccionesMenu {...SIN_PLATOS} {...parcial} />)

describe('SeccionesMenu', () => {
  describe('un restaurante que no cargó ningún plato', () => {
    it('lo dice con un texto propio, no el de una categoría vacía', () => {
      renderSecciones()

      expect(screen.getByText('Este restaurante todavía no cargó su carta')).toBeInTheDocument()
      expect(screen.queryByText(/No hay ítems en esta categoría/)).not.toBeInTheDocument()
    })

    it('no ofrece "Limpiar filtros", porque no hay filtros', () => {
      renderSecciones()

      expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
    })
  })

  describe('cuando hay platos pero los filtros no dejan ninguno', () => {
    it('con una búsqueda dice qué se buscó y deja limpiar', () => {
      const alLimpiar = vi.fn()
      renderSecciones({ buscar: 'sushi', onLimpiarFiltros: alLimpiar })

      expect(screen.getByText('No hay platos que coincidan con "sushi"')).toBeInTheDocument()
      expect(screen.queryByText(/todavía no cargó su carta/)).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
      expect(alLimpiar).toHaveBeenCalledTimes(1)
    })

    it('con filtros de dieta lo dice y deja limpiar', () => {
      const alLimpiar = vi.fn()
      renderSecciones({ hayDietas: true, onLimpiarFiltros: alLimpiar })

      expect(screen.getByText('Ningún plato cumple todos los filtros de dieta')).toBeInTheDocument()
      expect(screen.queryByText(/todavía no cargó su carta/)).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
      expect(alLimpiar).toHaveBeenCalledTimes(1)
    })

    it('si hay búsqueda y dieta, gana el texto de la búsqueda', () => {
      renderSecciones({ buscar: 'sushi', hayDietas: true })

      expect(screen.getByText('No hay platos que coincidan con "sushi"')).toBeInTheDocument()
    })
  })

  describe('cuando hay algo para mostrar', () => {
    it('con categorías muestra los platos y ningún aviso', () => {
      renderSecciones({ categorias: [{ id: 'cat-1', nombre: 'Postres', itemsDirectos: [flan] }] })

      expect(screen.getByText('Flan')).toBeInTheDocument()
      expect(screen.queryByText(/todavía no cargó su carta/)).not.toBeInTheDocument()
    })

    it('con solo descuentos (sin categorías a la vista) tampoco hay aviso', () => {
      renderSecciones({ descuentos: [milanesa] })

      expect(screen.getByText('Milanesa')).toBeInTheDocument()
      expect(screen.queryByText(/todavía no cargó su carta/)).not.toBeInTheDocument()
    })

    it('con solo recomendados tampoco hay aviso', () => {
      renderSecciones({ recomendados: [milanesa] })

      expect(screen.getByText('Milanesa')).toBeInTheDocument()
      expect(screen.queryByText(/todavía no cargó su carta/)).not.toBeInTheDocument()
    })
  })
})
