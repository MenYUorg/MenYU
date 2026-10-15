import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ItemMenu } from '@menyu/types'
import { DescuentoModal } from './DescuentoModal'

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

function renderModal(item: ItemMenu | null = plato()) {
  const onClose = vi.fn()
  const onGuardar = vi.fn().mockResolvedValue(undefined)
  const onQuitar = vi.fn().mockResolvedValue(undefined)
  const vista = render(<DescuentoModal item={item} onClose={onClose} onGuardar={onGuardar} onQuitar={onQuitar} />)
  return { onClose, onGuardar, onQuitar, ...vista }
}

const campoPorcentaje = () => screen.getByLabelText('Porcentaje de descuento (%)')
const campoPrecio = () => screen.getByLabelText('Precio con descuento ($)')
const botonGuardar = () => screen.getByRole('button', { name: /^(Guardar|Actualizar) descuento$/ })

describe('DescuentoModal', () => {
  it('sin plato no se muestra', () => {
    const { container } = renderModal(null)

    expect(container).toBeEmptyDOMElement()
  })

  describe('al abrirlo para un plato sin descuento', () => {
    it('muestra el nombre, el precio original y los dos campos vacíos', () => {
      renderModal()

      expect(screen.getByRole('dialog', { name: 'Descuento — Milanesa Napo' })).toBeInTheDocument()
      expect(screen.getByText('$2.000')).toBeInTheDocument()
      expect(campoPorcentaje()).toHaveValue('')
      expect(campoPrecio()).toHaveValue('')
      expect(screen.getByText(/el otro se calcula solo/)).toBeInTheDocument()
    })

    it('no se puede guardar todavía y no ofrece quitar nada', () => {
      renderModal()

      expect(botonGuardar()).toBeDisabled()
      expect(botonGuardar()).toHaveTextContent('Guardar descuento')
      expect(screen.queryByRole('button', { name: 'Quitar descuento' })).not.toBeInTheDocument()
    })

    it('aclara que el descuento dura hasta que se quite y que los extras no se descuentan', () => {
      renderModal()

      expect(screen.getByText(/vale hasta que lo quites/)).toHaveTextContent('los extras se cobran a su precio normal')
    })

    it('el precio base puede llegar como texto (así lo entrega la API)', () => {
      renderModal(plato({ precioBase: '2000.00' as unknown as number }))

      expect(screen.getByText('$2.000')).toBeInTheDocument()
    })
  })

  describe('cargar por porcentaje', () => {
    it('calcula el precio, muestra la vista previa y guarda el porcentaje', async () => {
      const user = userEvent.setup()
      const { onGuardar, onClose } = renderModal()

      await user.type(campoPorcentaje(), '25')

      expect(campoPrecio()).toHaveValue('1500')
      expect(screen.getByText('Así lo van a ver los clientes')).toBeInTheDocument()
      expect(screen.getByText('$1.500')).toBeInTheDocument()
      expect(screen.getByText('-25%')).toBeInTheDocument()
      expect(botonGuardar()).toBeEnabled()

      await user.click(botonGuardar())

      expect(onGuardar).toHaveBeenCalledWith('item-1', { porcentaje: 25 })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('avisa cuando el precio se redondea al peso más cercano', async () => {
      const user = userEvent.setup()
      renderModal(plato({ precioBase: 999, precioVigente: 999 }))

      await user.type(campoPorcentaje(), '15') // 849,15

      expect(campoPrecio()).toHaveValue('849')
      expect(screen.getByText('El precio se redondea al peso más cercano.')).toBeInTheDocument()
    })

    it('un porcentaje que da un precio exacto no avisa redondeo', async () => {
      const user = userEvent.setup()
      renderModal()

      await user.type(campoPorcentaje(), '10')

      expect(campoPrecio()).toHaveValue('1800')
      expect(screen.queryByText(/se redondea/)).not.toBeInTheDocument()
    })
  })

  describe('cargar por precio', () => {
    it('calcula el porcentaje y guarda el precio', async () => {
      const user = userEvent.setup()
      const { onGuardar } = renderModal()

      await user.type(campoPrecio(), '1500')

      expect(campoPorcentaje()).toHaveValue('25')
      expect(screen.getByText('-25%')).toBeInTheDocument()

      await user.click(botonGuardar())

      expect(onGuardar).toHaveBeenCalledWith('item-1', { precioDescuento: 1500 })
    })

    it('al editar el otro campo, el último que se tocó manda', async () => {
      const user = userEvent.setup()
      const { onGuardar } = renderModal()

      await user.type(campoPorcentaje(), '25')
      await user.clear(campoPrecio())
      await user.type(campoPrecio(), '1600')

      expect(campoPorcentaje()).toHaveValue('20')

      await user.click(botonGuardar())

      expect(onGuardar).toHaveBeenCalledWith('item-1', { precioDescuento: 1600 })
    })

    it('si se borra lo escrito, vuelve al estado vacío y no se puede guardar', async () => {
      const user = userEvent.setup()
      renderModal()
      await user.type(campoPrecio(), '1500')

      await user.clear(campoPrecio())

      expect(campoPorcentaje()).toHaveValue('')
      expect(botonGuardar()).toBeDisabled()
    })
  })

  describe('valores inválidos: lo explica y no deja guardar', () => {
    it.each([
      ['porcentaje 0', 'porcentaje', '0', 'El porcentaje tiene que ser un número entero entre 1 y 99'],
      ['porcentaje 100', 'porcentaje', '100', 'El porcentaje tiene que ser un número entero entre 1 y 99'],
      ['porcentaje con decimales', 'porcentaje', '12.5', 'Ingresá un número entero, sin decimales'],
      ['porcentaje con letras', 'porcentaje', 'abc', 'Ingresá un número entero, sin decimales'],
      ['precio igual al original', 'precio', '2000', 'El precio con descuento tiene que ser un número entero mayor a 0 y menor al precio original ($2.000)'],
      ['precio mayor al original', 'precio', '2500', 'menor al precio original ($2.000)'],
      ['precio cero', 'precio', '0', 'mayor a 0 y menor al precio original'],
      ['precio con decimales', 'precio', '1500.5', 'Ingresá un número entero, sin decimales'],
      ['precio negativo', 'precio', '-100', 'Ingresá un número entero, sin decimales'],
      ['precio que es menos del 1%', 'precio', '1995', 'El descuento es menor al 1%'], // 0,25%
      ['precio que es casi el 100%', 'precio', '5', 'El descuento no puede ser del 100%'],
    ])('%s', async (_caso, campo, valor, mensaje) => {
      const user = userEvent.setup()
      const { onGuardar } = renderModal()

      await user.type(campo === 'porcentaje' ? campoPorcentaje() : campoPrecio(), valor)

      expect(screen.getByText(new RegExp(mensaje.replace(/[$()]/g, '\\$&')))).toBeInTheDocument()
      expect(botonGuardar()).toBeDisabled()
      await user.click(botonGuardar())
      expect(onGuardar).not.toHaveBeenCalled()
    })

    it('si el redondeo deja el precio igual al original, lo explica (base 10 con 1%)', async () => {
      const user = userEvent.setup()
      renderModal(plato({ precioBase: 10, precioVigente: 10 }))

      await user.type(campoPorcentaje(), '1')

      expect(screen.getByText(/Con 1% el precio no cambia/)).toBeInTheDocument()
      expect(botonGuardar()).toBeDisabled()
    })

    it('un plato sin precio base no admite descuento', () => {
      renderModal(plato({ precioBase: 0, precioVigente: 0 }))

      expect(screen.getByText(/no tiene precio base/)).toBeInTheDocument()
      expect(screen.queryByLabelText('Porcentaje de descuento (%)')).not.toBeInTheDocument()
      expect(botonGuardar()).toBeDisabled()
    })
  })

  describe('al abrirlo para un plato que ya tiene descuento', () => {
    it('muestra el descuento actual y no deja "guardar" lo mismo', () => {
      renderModal(CON_DESCUENTO)

      expect(campoPrecio()).toHaveValue('1500')
      expect(campoPorcentaje()).toHaveValue('25')
      expect(screen.getByText('Es el descuento que ya tiene este plato.')).toBeInTheDocument()
      expect(botonGuardar()).toHaveTextContent('Actualizar descuento')
      expect(botonGuardar()).toBeDisabled()
    })

    it('cambiar el valor lo habilita y guarda el nuevo descuento', async () => {
      const user = userEvent.setup()
      const { onGuardar, onClose } = renderModal(CON_DESCUENTO)

      await user.clear(campoPrecio())
      await user.type(campoPrecio(), '1400')

      expect(campoPorcentaje()).toHaveValue('30')
      await user.click(botonGuardar())

      expect(onGuardar).toHaveBeenCalledWith('item-1', { precioDescuento: 1400 })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('"Quitar descuento" lo saca y cierra', async () => {
      const user = userEvent.setup()
      const { onQuitar, onGuardar, onClose } = renderModal(CON_DESCUENTO)

      await user.click(screen.getByRole('button', { name: 'Quitar descuento' }))

      expect(onQuitar).toHaveBeenCalledWith('item-1')
      expect(onGuardar).not.toHaveBeenCalled()
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('errores y estados de espera', () => {
    it('si el servidor rechaza el descuento, muestra el motivo y deja el modal abierto para corregir', async () => {
      const user = userEvent.setup()
      const { onGuardar, onClose } = renderModal()
      onGuardar.mockRejectedValue(new Error('No tenés acceso a este restaurante'))
      await user.type(campoPorcentaje(), '25')

      await user.click(botonGuardar())

      expect(await screen.findByRole('alert')).toHaveTextContent('No tenés acceso a este restaurante')
      expect(onClose).not.toHaveBeenCalled()
      expect(botonGuardar()).toBeEnabled()
    })

    it('un error sin mensaje muestra uno genérico', async () => {
      const user = userEvent.setup()
      const { onGuardar } = renderModal()
      onGuardar.mockRejectedValue(undefined)
      await user.type(campoPorcentaje(), '25')

      await user.click(botonGuardar())

      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el descuento. Probá de nuevo.')
    })

    it('si falla al quitar, muestra el motivo y deja el modal abierto', async () => {
      const user = userEvent.setup()
      const { onQuitar, onClose } = renderModal(CON_DESCUENTO)
      onQuitar.mockRejectedValue(new Error('Ítem del menú no encontrado'))

      await user.click(screen.getByRole('button', { name: 'Quitar descuento' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Ítem del menú no encontrado')
      expect(onClose).not.toHaveBeenCalled()
    })

    it('el error se borra al volver a escribir', async () => {
      const user = userEvent.setup()
      const { onGuardar } = renderModal()
      onGuardar.mockRejectedValue(new Error('Falló la red'))
      await user.type(campoPorcentaje(), '25')
      await user.click(botonGuardar())
      await screen.findByRole('alert')

      await user.type(campoPorcentaje(), '0')

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('mientras guarda, los botones y los campos quedan bloqueados', async () => {
      const user = userEvent.setup()
      let terminar: () => void = () => undefined
      const { onGuardar, onClose } = renderModal()
      onGuardar.mockReturnValue(new Promise<void>((resolver) => (terminar = resolver)))
      await user.type(campoPorcentaje(), '25')

      await user.click(botonGuardar())

      expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
      expect(campoPorcentaje()).toBeDisabled()
      await user.keyboard('{Escape}')
      expect(onClose).not.toHaveBeenCalled()

      terminar()
      await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })
  })

  describe('cerrar', () => {
    it('Cancelar cierra sin guardar', async () => {
      const user = userEvent.setup()
      const { onClose, onGuardar } = renderModal()

      await user.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(onClose).toHaveBeenCalledTimes(1)
      expect(onGuardar).not.toHaveBeenCalled()
    })

    it('la X cierra', async () => {
      const user = userEvent.setup()
      const { onClose } = renderModal()

      await user.click(screen.getByRole('button', { name: 'Cerrar' }))

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('Escape cierra', async () => {
      const user = userEvent.setup()
      const { onClose } = renderModal()

      await user.keyboard('{Escape}')

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('tocar afuera cierra, pero tocar adentro no', async () => {
      const user = userEvent.setup()
      const { onClose } = renderModal()

      await user.click(screen.getByRole('dialog'))
      expect(onClose).not.toHaveBeenCalled()

      await user.click(screen.getByRole('dialog').parentElement as HTMLElement)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('al pasar a otro plato se reinician los campos', async () => {
    const user = userEvent.setup()
    const { rerender, onClose, onGuardar, onQuitar } = renderModal()
    await user.type(campoPorcentaje(), '25')

    rerender(
      <DescuentoModal
        item={plato({ id: 'item-2', nombre: 'Provoleta' })}
        onClose={onClose}
        onGuardar={onGuardar}
        onQuitar={onQuitar}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Descuento — Provoleta' })).toBeInTheDocument()
    expect(campoPorcentaje()).toHaveValue('')
  })
})
