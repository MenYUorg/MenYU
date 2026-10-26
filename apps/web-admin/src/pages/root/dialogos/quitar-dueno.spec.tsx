import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, api } from '../../../services/api'
import { promesaManual } from '../../../test/root'
import { DialogoNoSePuedeQuitar, DialogoQuitarDueno } from './quitar-dueno'

vi.mock('@menyu/auth-client', async () => (await import('../../../test/authClient')).moduloSimulado())
vi.mock('../../../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../services/api')>()
  const { apiFalsa } = await import('../../../test/root')
  return { ...original, api: apiFalsa }
})

const duenos = vi.mocked(api.root.duenos)

const DUENO = { membresiaId: 'membresia-7', nombre: 'Lucía Fiore', email: 'lucia@fiorecucina.com' }

beforeEach(() => vi.clearAllMocks())

describe('DialogoQuitarDueno', () => {
  function abrir() {
    const alHacer = vi.fn()
    const alCerrar = vi.fn()
    render(<DialogoQuitarDueno dueno={DUENO} marcaNombre="Fiore Cucina" onHecho={alHacer} onCerrar={alCerrar} />)
    return { alHacer, alCerrar }
  }

  it('dice a quién se le quita el acceso y a qué marca', () => {
    abrir()

    expect(screen.getByRole('dialog', { name: 'Quitar el acceso de Lucía Fiore' })).toBeInTheDocument()
    expect(screen.getByText('lucia@fiorecucina.com')).toBeInTheDocument()
    expect(screen.getByText(/deja de poder administrar «Fiore Cucina»/)).toBeInTheDocument()
  })

  it('explica que la cuenta no se borra, que la marca no se toca y que se puede volver a invitar', () => {
    abrir()

    expect(screen.getByText(/no se borra/)).toBeInTheDocument()
    expect(screen.getByText(/no se tocan/)).toBeInTheDocument()
    expect(screen.getByText('Lo podés volver a invitar cuando quieras.')).toBeInTheDocument()
    expect(screen.getByText('Esta acción queda registrada en el historial.')).toBeInTheDocument()
  })

  it('quita con el id de la membresía y avisa', async () => {
    duenos.quitar.mockResolvedValue(undefined)
    const { alHacer } = abrir()

    await userEvent.click(screen.getByRole('button', { name: 'Quitar acceso' }))

    expect(duenos.quitar).toHaveBeenCalledWith('membresia-7')
    expect(alHacer).toHaveBeenCalledTimes(1)
  })

  it('si la API lo rechaza (409: es el último dueño) muestra su texto, no cierra y no avisa que salió bien', async () => {
    duenos.quitar.mockRejectedValue(new ApiError(409, 'Es el único dueño de «Fiore Cucina», una marca activa: invitá a otro dueño antes de quitarlo, o dala de baja'))
    const { alHacer, alCerrar } = abrir()

    await userEvent.click(screen.getByRole('button', { name: 'Quitar acceso' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Es el único dueño de «Fiore Cucina»')
    expect(alHacer).not.toHaveBeenCalled()
    expect(alCerrar).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Quitar acceso' })).toBeEnabled()
  })

  it('un error del servidor se dice sin el texto técnico y se puede volver a intentar', async () => {
    duenos.quitar.mockRejectedValueOnce(new ApiError(500, 'Error 500'))
    duenos.quitar.mockResolvedValueOnce(undefined)
    const { alHacer } = abrir()

    await userEvent.click(screen.getByRole('button', { name: 'Quitar acceso' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos completar la acción. Probá de nuevo en un momento.')
    await userEvent.click(screen.getByRole('button', { name: 'Quitar acceso' }))

    expect(alHacer).toHaveBeenCalledTimes(1)
  })

  it('un doble toque no manda dos pedidos', async () => {
    const pendiente = promesaManual<void>()
    duenos.quitar.mockReturnValue(pendiente.promesa)
    abrir()

    await userEvent.click(screen.getByRole('button', { name: 'Quitar acceso' }))
    expect(screen.getByRole('button', { name: 'Quitando…' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Quitando…' }))

    expect(duenos.quitar).toHaveBeenCalledTimes(1)
    pendiente.resolver()
  })

  it('Cancelar lo cierra sin quitar nada', async () => {
    const { alCerrar } = abrir()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(alCerrar).toHaveBeenCalledTimes(1)
    expect(duenos.quitar).not.toHaveBeenCalled()
  })
})

describe('DialogoNoSePuedeQuitar', () => {
  function abrir() {
    const alInvitar = vi.fn()
    const alCerrar = vi.fn()
    render(<DialogoNoSePuedeQuitar marcaNombre="La Parrilla" onInvitar={alInvitar} onCerrar={alCerrar} />)
    return { alInvitar, alCerrar }
  }

  it('explica que es el único dueño y que primero hay que invitar a otro', () => {
    abrir()

    expect(screen.getByRole('dialog', { name: 'No se puede quitar todavía' })).toBeInTheDocument()
    expect(screen.getByText('único dueño')).toBeInTheDocument()
    expect(screen.getByText(/«La Parrilla»/)).toBeInTheDocument()
    expect(screen.getByText(/Invitá a otro antes de quitarle el acceso/)).toBeInTheDocument()
  })

  it('no hace nada, así que no avisa que queda registrado', () => {
    abrir()

    expect(screen.queryByText('Esta acción queda registrada en el historial.')).not.toBeInTheDocument()
    expect(duenos.quitar).not.toHaveBeenCalled()
  })

  it('"Invitar a otro dueño" lleva a invitar', async () => {
    const { alInvitar } = abrir()

    await userEvent.click(screen.getByRole('button', { name: 'Invitar a otro dueño' }))

    expect(alInvitar).toHaveBeenCalledTimes(1)
  })

  it('"Cerrar" lo cierra', async () => {
    const { alCerrar } = abrir()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(alCerrar).toHaveBeenCalledTimes(1)
  })
})
