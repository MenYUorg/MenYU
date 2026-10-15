import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ItemMenu } from '@menyu/types'
import { restaurarPantalla, simularPantalla } from '../../../test/pantalla'
import { ItemRow } from './ItemRow'

function plato(extra: Partial<ItemMenu> = {}): ItemMenu {
  return {
    id: 'item-1',
    restauranteId: 'rest-1',
    categoriaId: null,
    comandaId: null,
    nombre: 'Milanesa Napo',
    descripcion: null,
    precioBase: 2000,
    precioDescuento: null,
    porcentajeDescuento: null,
    precioVigente: 2000,
    disponible: true,
    imagenUrl: null,
    ...extra,
  }
}

const CON_DESCUENTO = plato({ precioDescuento: 1500, porcentajeDescuento: 25, precioVigente: 1500 })

function renderFila(props: Partial<ComponentProps<typeof ItemRow>> = {}) {
  const acciones = {
    onEditar: vi.fn(),
    onDescuento: vi.fn(),
    onToggleDisponible: vi.fn(),
    onToggleRecomendado: vi.fn(),
  }
  render(
    <ItemRow
      item={plato()}
      disponible
      recomendado={false}
      puedeGestionarDescuento
      {...acciones}
      {...props}
    />,
  )
  return acciones
}

describe('ItemRow', () => {
  afterEach(restaurarPantalla)

  describe('precio', () => {
    it('sin descuento muestra solo el precio del plato', () => {
      renderFila()

      expect(screen.getByText('Milanesa Napo')).toBeInTheDocument()
      expect(screen.getByText('$2.000')).toBeInTheDocument()
      expect(screen.queryByText(/^-\d+%$/)).not.toBeInTheDocument()
    })

    it('con descuento muestra el original tachado, el precio con descuento y el porcentaje', () => {
      renderFila({ item: CON_DESCUENTO })

      expect(screen.getByText('$2.000')).toHaveStyle({ textDecoration: 'line-through' })
      expect(screen.getByText('$1.500')).toBeInTheDocument()
      expect(screen.getByText('-25%')).toBeInTheDocument()
    })

    it('el precio base puede llegar como texto desde la API', () => {
      renderFila({ item: plato({ precioBase: '2000.00' as unknown as number }) })

      expect(screen.getByText('$2.000')).toBeInTheDocument()
    })

    it('un plato no disponible dice "Sin stock"', () => {
      renderFila({ disponible: false })

      expect(screen.getByText('· Sin stock')).toBeInTheDocument()
    })
  })

  describe('botón de descuento', () => {
    it('lo ve quien puede gestionar descuentos y al tocarlo avisa', async () => {
      const user = userEvent.setup()
      const { onDescuento } = renderFila()

      await user.click(screen.getByRole('button', { name: 'Descuento de Milanesa Napo' }))

      expect(onDescuento).toHaveBeenCalledTimes(1)
    })

    it('quien no puede (ROOT) no lo ve, pero sí "Editar"', () => {
      renderFila({ puedeGestionarDescuento: false })

      expect(screen.queryByRole('button', { name: /Descuento de/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    })

    it('si el plato ya está en descuento, el botón sigue disponible para cambiarlo o quitarlo', () => {
      renderFila({ item: CON_DESCUENTO })

      expect(screen.getByRole('button', { name: 'Descuento de Milanesa Napo' })).toBeInTheDocument()
    })
  })

  describe('otras acciones', () => {
    it('"Editar" avisa', async () => {
      const user = userEvent.setup()
      const { onEditar } = renderFila()

      await user.click(screen.getByRole('button', { name: 'Editar' }))

      expect(onEditar).toHaveBeenCalledTimes(1)
    })

    it('el interruptor "Disponible" refleja el estado y al tocarlo avisa', async () => {
      const user = userEvent.setup()
      const { onToggleDisponible } = renderFila()
      const interruptor = screen.getByRole('switch', { name: /Disponible/ })

      expect(interruptor).toHaveAttribute('aria-checked', 'true')
      await user.click(interruptor)

      expect(onToggleDisponible).toHaveBeenCalledTimes(1)
    })

    it('el interruptor "Recomendado" refleja el estado y al tocarlo avisa', async () => {
      const user = userEvent.setup()
      const { onToggleRecomendado } = renderFila({ recomendado: true })
      const interruptor = screen.getByRole('switch', { name: /Recomendado/ })

      expect(interruptor).toHaveAttribute('aria-checked', 'true')
      await user.click(interruptor)

      expect(onToggleRecomendado).toHaveBeenCalledTimes(1)
    })

    it('un plato no disponible no se puede marcar como recomendado', async () => {
      const user = userEvent.setup()
      const { onToggleRecomendado } = renderFila({ disponible: false })
      const interruptor = screen.getByRole('switch', { name: /Recomendado/ })

      expect(interruptor).toHaveAttribute('aria-disabled', 'true')
      await user.click(interruptor)

      expect(onToggleRecomendado).not.toHaveBeenCalled()
    })

    it('los interruptores también se manejan con el teclado', async () => {
      const user = userEvent.setup()
      const { onToggleDisponible } = renderFila()

      screen.getByRole('switch', { name: /Disponible/ }).focus()
      await user.keyboard(' ')

      expect(onToggleDisponible).toHaveBeenCalledTimes(1)
    })
  })

  describe('en celular (360 px)', () => {
    it('los botones y los interruptores miden al menos 44px para poder tocarlos', () => {
      simularPantalla(360)

      renderFila()

      expect(screen.getByRole('button', { name: 'Editar' })).toHaveStyle({ minHeight: '44px' })
      expect(screen.getByRole('button', { name: 'Descuento de Milanesa Napo' })).toHaveStyle({ minHeight: '44px' })
      expect(screen.getByRole('switch', { name: /Disponible/ })).toHaveStyle({ minHeight: '44px' })
      expect(screen.getByRole('switch', { name: /Recomendado/ })).toHaveStyle({ minHeight: '44px' })
    })

    it('la fila se apila: la información arriba y las acciones abajo', () => {
      simularPantalla(360)

      renderFila()

      const fila = screen.getByText('Milanesa Napo').closest('div[style*="flex-direction"]') as HTMLElement
      expect(fila).toHaveStyle({ flexDirection: 'column' })
    })

    it('un nombre largo no rompe la fila (se corta con puntos suspensivos)', () => {
      simularPantalla(360)

      renderFila({ item: plato({ nombre: 'Milanesa napolitana con jamón, queso, salsa de tomate casera y papas fritas' }) })

      expect(screen.getByText(/Milanesa napolitana con jamón/)).toHaveStyle({
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      })
    })
  })

  describe('en escritorio (1280 px)', () => {
    it('la fila va en una sola línea y los botones no se agrandan', () => {
      simularPantalla(1280)

      renderFila()

      const fila = screen.getByText('Milanesa Napo').closest('div[style*="flex-direction"]') as HTMLElement
      expect(fila).toHaveStyle({ flexDirection: 'row' })
      expect(screen.getByRole('button', { name: 'Editar' })).not.toHaveStyle({ minHeight: '44px' })
    })
  })
})
