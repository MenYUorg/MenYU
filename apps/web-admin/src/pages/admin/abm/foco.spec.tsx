import { act, fireEvent, render, screen } from '@testing-library/react'
import { ApiError } from '../../../services/api'
import { CONFIG_DE_CAJAS } from '../cajas/config'
import { FilaDeAbm } from './FilaDeAbm'
import { FormularioDeAltaDeAbm } from './FormularioDeAltaDeAbm'

const ITEM = { id: 'c-barra', nombre: 'Barra', activa: true }

const actualizar = vi.fn()
const onCambio = vi.fn()
const crear = vi.fn()
const onCreada = vi.fn()

function montarFila() {
  return render(
    <ul>
      <FilaDeAbm config={CONFIG_DE_CAJAS} item={ITEM} bloqueo={null} actualizar={actualizar} onCambio={onCambio} />
    </ul>,
  )
}

const boton = (nombre: string) => screen.getByRole('button', { name: nombre })
const campo = () => screen.getByLabelText('Nombre de la caja') as HTMLInputElement
/** Hace click y espera, dentro de act, lo que haga la respuesta. */
const tocar = (elemento: HTMLElement) => act(async () => { fireEvent.click(elemento) })
const enfocar = (elemento: HTMLElement) => act(async () => { elemento.focus() })
const guardar = () => act(async () => { fireEvent.submit(campo().closest('form') as HTMLFormElement) })

/** Abre "Renombrar" y lo cierra con "Cancelar": desde ahí el foco vuelve al botón al salir de la edición. */
async function abrirYCancelarLaEdicion() {
  await tocar(boton('Renombrar «Barra»'))
  await tocar(boton('Cancelar'))
}

/** Abre "Renombrar", cambia el nombre y guarda con un 404: la fila vuelve a leer la lista sin pasar por `cerrar()`. */
async function renombrarConUn404() {
  actualizar.mockRejectedValue(new ApiError(404, 'Caja no encontrada'))
  await tocar(boton('Renombrar «Barra»'))
  await act(async () => { fireEvent.change(campo(), { target: { value: 'Barra nueva' } }) })
  await guardar()
}

beforeEach(() => {
  vi.resetAllMocks()
  actualizar.mockResolvedValue(undefined)
  crear.mockResolvedValue(undefined)
})

describe('foco del ABM', () => {
  it('al cancelar la edición el foco vuelve al botón "Renombrar" de la fila', async () => {
    montarFila()
    await abrirYCancelarLaEdicion()
    expect(document.activeElement).toBe(boton('Renombrar «Barra»'))
  })

  it('abrir y cancelar la confirmación de "Desactivar" no mueve el foco al botón "Renombrar"', async () => {
    montarFila()
    await abrirYCancelarLaEdicion()
    // La fila ya "puede volver al botón": se lleva el foco a mano a "Desactivar".
    await enfocar(boton('Desactivar «Barra»'))
    expect(document.activeElement).toBe(boton('Desactivar «Barra»'))

    await tocar(boton('Desactivar «Barra»'))
    expect(screen.getByText(/¿Desactivar «Barra»\?/)).toBeInTheDocument()
    expect(document.activeElement).toBe(boton('Desactivar «Barra»'))

    await tocar(boton('Cancelar'))
    expect(screen.queryByText(/¿Desactivar «Barra»\?/)).not.toBeInTheDocument()
    expect(document.activeElement).toBe(boton('Desactivar «Barra»'))
  })

  it('en una fila sin edición previa, un 404 que relee la lista no deja el foco en "Renombrar"', async () => {
    montarFila()
    await renombrarConUn404()

    expect(onCambio).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Nombre de la caja')).not.toBeInTheDocument()
    expect(document.activeElement).not.toBe(boton('Renombrar «Barra»'))
    expect(document.activeElement).toBe(document.body)
  })

  it('contraste: tras una edición cancelada antes, el mismo 404 sí deja el foco en "Renombrar"', async () => {
    montarFila()
    await abrirYCancelarLaEdicion()
    // Se saca el foco del botón para comprobar que lo lleva el 404 y no el que quedó de antes.
    await act(async () => { (document.activeElement as HTMLElement).blur() })
    expect(document.activeElement).toBe(document.body)

    await renombrarConUn404()

    expect(onCambio).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(boton('Renombrar «Barra»'))
  })

  it('el alta no lleva el foco al campo del nombre al montarse', async () => {
    render(<FormularioDeAltaDeAbm config={CONFIG_DE_CAJAS} restauranteId="rest-1" crear={crear} onCreada={onCreada} />)
    await act(async () => {})
    expect(campo()).toBeInTheDocument()
    expect(document.activeElement).not.toBe(campo())
  })

  it('contraste: al abrir "Renombrar" el campo del nombre sí queda enfocado', async () => {
    montarFila()
    await tocar(boton('Renombrar «Barra»'))
    expect(document.activeElement).toBe(campo())
  })
})
