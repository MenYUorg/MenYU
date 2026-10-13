import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DireccionField } from './DireccionField'

function renderCampo(props: Partial<ComponentProps<typeof DireccionField>> = {}) {
  const onGuardar = vi.fn().mockResolvedValue(undefined)
  const vista = render(
    <DireccionField nombre="Sucursal Centro" direccion="Av. Siempre Viva 742" onGuardar={onGuardar} {...props} />,
  )
  return { onGuardar, ...vista }
}

const campo = () => screen.getByLabelText('Dirección')
const botonGuardar = () => screen.getByRole('button', { name: 'Guardar' })

describe('DireccionField', () => {
  it('muestra la dirección guardada y no deja guardar sin cambios', () => {
    renderCampo()

    expect(campo()).toHaveValue('Av. Siempre Viva 742')
    expect(botonGuardar()).toBeDisabled()
  })

  it('se identifica con el nombre de la sucursal', () => {
    renderCampo()

    expect(screen.getByRole('form', { name: 'Dirección de Sucursal Centro' })).toBeInTheDocument()
  })

  it('si la sucursal no tiene dirección, lo avisa y deja el campo vacío', () => {
    renderCampo({ direccion: null })

    expect(campo()).toHaveValue('')
    expect(screen.getByText('Esta sucursal todavía no tiene dirección.')).toBeInTheDocument()
    expect(botonGuardar()).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('limita el largo a 200 caracteres', () => {
    renderCampo()

    expect(campo()).toHaveAttribute('maxlength', '200')
  })

  it('al cambiar el texto habilita guardar y guarda la dirección sin espacios sobrantes', async () => {
    const user = userEvent.setup()
    const { onGuardar } = renderCampo()

    await user.clear(campo())
    await user.type(campo(), '  Calle Falsa 123  ')
    await user.click(botonGuardar())

    expect(onGuardar).toHaveBeenCalledWith('Calle Falsa 123')
    expect(await screen.findByRole('status')).toHaveTextContent('Dirección guardada')
  })

  it('guarda también con Enter', async () => {
    const user = userEvent.setup()
    const { onGuardar } = renderCampo()

    await user.type(campo(), ' bis{Enter}')

    expect(onGuardar).toHaveBeenCalledWith('Av. Siempre Viva 742 bis')
  })

  it('no deja guardar si lo único que cambia son espacios', async () => {
    const user = userEvent.setup()
    const { onGuardar } = renderCampo()

    await user.type(campo(), '   ')

    expect(botonGuardar()).toBeDisabled()
    await user.type(campo(), '{Enter}')
    expect(onGuardar).not.toHaveBeenCalled()
  })

  it('exige una dirección: si se borra, marca el error y no deja guardar', async () => {
    const user = userEvent.setup()
    const { onGuardar } = renderCampo()

    await user.clear(campo())

    expect(screen.getByRole('alert')).toHaveTextContent('La dirección es obligatoria')
    expect(campo()).toBeInvalid()
    expect(botonGuardar()).toBeDisabled()
    await user.type(campo(), '{Enter}')
    expect(onGuardar).not.toHaveBeenCalled()
  })

  it('una sucursal sin dirección tampoco puede guardar solo espacios', async () => {
    const user = userEvent.setup()
    const { onGuardar } = renderCampo({ direccion: null })

    await user.type(campo(), '   ')

    expect(screen.getByRole('alert')).toHaveTextContent('La dirección es obligatoria')
    expect(botonGuardar()).toBeDisabled()
    expect(onGuardar).not.toHaveBeenCalled()
  })

  it('una sucursal sin dirección puede cargar la primera', async () => {
    const user = userEvent.setup()
    const { onGuardar } = renderCampo({ direccion: null })

    await user.type(campo(), 'Mitre 500')
    await user.click(botonGuardar())

    expect(onGuardar).toHaveBeenCalledWith('Mitre 500')
  })

  it('mientras guarda, el botón avisa y no se puede volver a tocar', async () => {
    const user = userEvent.setup()
    let terminar: () => void = () => undefined
    const onGuardar = vi.fn().mockReturnValue(new Promise<void>((resolver) => (terminar = resolver)))
    renderCampo({ onGuardar })

    await user.type(campo(), ' bis')
    await user.click(botonGuardar())

    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()

    terminar()
    expect(await screen.findByRole('status')).toHaveTextContent('Dirección guardada')
  })

  it('muestra el mensaje del servidor si falla y lo borra al volver a escribir', async () => {
    const user = userEvent.setup()
    const onGuardar = vi.fn().mockRejectedValue(new Error('No tenés acceso a este restaurante'))
    renderCampo({ onGuardar })

    await user.type(campo(), ' bis')
    await user.click(botonGuardar())

    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés acceso a este restaurante')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await user.type(campo(), '!')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('si el error no trae mensaje, muestra uno genérico', async () => {
    const user = userEvent.setup()
    const onGuardar = vi.fn().mockRejectedValue(undefined)
    renderCampo({ onGuardar })

    await user.type(campo(), ' bis')
    await user.click(botonGuardar())

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la dirección. Probá de nuevo.')
  })

  it('refleja la dirección guardada cuando cambia desde afuera', () => {
    const { rerender, onGuardar } = renderCampo()

    rerender(<DireccionField nombre="Sucursal Centro" direccion="Belgrano 10" onGuardar={onGuardar} />)

    expect(campo()).toHaveValue('Belgrano 10')
    expect(botonGuardar()).toBeDisabled()
  })

  it('no pisa lo que se está escribiendo si la dirección guardada no cambió', async () => {
    const user = userEvent.setup()
    const { rerender, onGuardar } = renderCampo()
    await user.type(campo(), ' bis')

    rerender(<DireccionField nombre="Sucursal Centro" direccion="Av. Siempre Viva 742" onGuardar={onGuardar} />)

    expect(campo()).toHaveValue('Av. Siempre Viva 742 bis')
  })
})
