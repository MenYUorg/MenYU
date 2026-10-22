import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, api } from '../../../services/api'
import { marcaResumen, promesaManual } from '../../../test/root'
import { DialogoInvitarDueno } from './invitar-dueno'

vi.mock('@menyu/auth-client', async () => (await import('../../../test/authClient')).moduloSimulado())
vi.mock('../../../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../services/api')>()
  const { apiFalsa } = await import('../../../test/root')
  return { ...original, api: apiFalsa }
})

const duenos = vi.mocked(api.root.duenos)
const marcas = vi.mocked(api.root.marcas)

const RESPUESTA = { usuarioId: 'u1', membresiaId: 'm1', invitacionEnviada: true }

beforeEach(() => {
  vi.clearAllMocks()
  marcas.listar.mockResolvedValue([marcaResumen(), marcaResumen({ id: 'marca-2', nombre: 'Café del Puerto', slug: 'cafe-del-puerto' })])
})

async function completar(nombre: string, email: string) {
  await userEvent.type(screen.getByLabelText('Nombre *'), nombre)
  await userEvent.type(screen.getByLabelText('Email *'), email)
}

describe('DialogoInvitarDueno con la marca ya elegida', () => {
  function abrir() {
    const alInvitar = vi.fn()
    const alCerrar = vi.fn()
    render(<DialogoInvitarDueno marca={{ id: 'marca-1', nombre: 'La Parrilla' }} onInvitado={alInvitar} onCerrar={alCerrar} />)
    return { alInvitar, alCerrar }
  }

  it('muestra la marca fija y no pide elegirla ni carga la lista de marcas', () => {
    abrir()

    expect(screen.getByText('La Parrilla')).toBeInTheDocument()
    expect(screen.queryByLabelText('Marca *')).not.toBeInTheDocument()
    expect(marcas.listar).not.toHaveBeenCalled()
  })

  it('no pide ni muestra ninguna contraseña: la elige la persona desde el mail', () => {
    abrir()

    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument()
    expect(screen.getByText(/elija su contraseña y entre/)).toBeInTheDocument()
  })

  it('invita con el nombre sin espacios sobrantes y el email en minúsculas, y avisa a quién y si salió el mail', async () => {
    duenos.invitar.mockResolvedValue(RESPUESTA)
    const { alInvitar } = abrir()

    await completar('  Juan Pérez  ', '  Juan.Perez@LaParrilla.com ')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    expect(duenos.invitar).toHaveBeenCalledWith('marca-1', { email: 'juan.perez@laparrilla.com', nombre: 'Juan Pérez' })
    expect(alInvitar).toHaveBeenCalledWith({ email: 'juan.perez@laparrilla.com', enviada: true })
  })

  it('si la persona ya tenía cuenta (invitacionEnviada: false) lo avisa para que el diálogo siguiente lo cuente', async () => {
    duenos.invitar.mockResolvedValue({ ...RESPUESTA, invitacionEnviada: false })
    const { alInvitar } = abrir()

    await completar('Juan', 'juan@laparrilla.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    expect(alInvitar).toHaveBeenCalledWith({ email: 'juan@laparrilla.com', enviada: false })
  })

  it('con todo vacío avisa debajo de cada campo y no llama a la API', async () => {
    abrir()

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    expect(screen.getByText('Escribí el nombre.')).toBeInTheDocument()
    expect(screen.getByText('Escribí el email.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre *')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Email *')).toHaveAttribute('aria-invalid', 'true')
    expect(duenos.invitar).not.toHaveBeenCalled()
  })

  it('un email mal escrito avisa y no llama a la API', async () => {
    abrir()

    await completar('Juan', 'juan@laparrilla')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    expect(screen.getByText(/Revisá el email/)).toBeInTheDocument()
    expect(duenos.invitar).not.toHaveBeenCalled()
  })

  it('si esa persona ya es dueña de la marca (409), el aviso va en el campo del email y el diálogo sigue abierto', async () => {
    duenos.invitar.mockRejectedValue(new ApiError(409, 'El usuario ya tiene un rol ahí'))
    const { alInvitar, alCerrar } = abrir()
    await completar('Juan', 'juan@laparrilla.com')

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    expect(await screen.findByText('Esa persona ya es dueña de esta marca.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email *')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(alInvitar).not.toHaveBeenCalled()
    expect(alCerrar).not.toHaveBeenCalled()
  })

  it('el aviso del email se va al seguir escribiendo', async () => {
    duenos.invitar.mockRejectedValue(new ApiError(409, 'El usuario ya tiene un rol ahí'))
    abrir()
    await completar('Juan', 'juan@laparrilla.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))
    await screen.findByText('Esa persona ya es dueña de esta marca.')

    await userEvent.type(screen.getByLabelText('Email *'), 'x')

    expect(screen.queryByText('Esa persona ya es dueña de esta marca.')).not.toBeInTheDocument()
  })

  it('invitar al propio email (403) lo dice en el campo', async () => {
    duenos.invitar.mockRejectedValue(new ApiError(403, 'No te podés invitar a vos mismo'))
    abrir()
    await completar('Yo', 'root@menyu.com')

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    expect(await screen.findByText('Ese es tu propio email: no podés invitarte.')).toBeInTheDocument()
  })

  it.each([
    [409, 'La marca está dada de baja'],
    [409, 'El usuario está desactivado'],
    [404, 'Marca no encontrada'],
  ])('un %i que no es del email (%s) se muestra arriba con el texto del servidor', async (estado, mensaje) => {
    duenos.invitar.mockRejectedValue(new ApiError(estado, mensaje))
    abrir()
    await completar('Juan', 'juan@laparrilla.com')

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(`No pudimos completar la acción. ${mensaje}`)
    expect(screen.getByLabelText('Email *')).not.toHaveAttribute('aria-invalid')
  })

  it('si Supabase rechaza la invitación (502) no muestra el texto técnico y se puede volver a intentar', async () => {
    duenos.invitar.mockRejectedValueOnce(new ApiError(502, 'Supabase no pudo procesar la invitación: rate limit'))
    duenos.invitar.mockResolvedValueOnce(RESPUESTA)
    const { alInvitar } = abrir()
    await completar('Juan', 'juan@laparrilla.com')

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos completar la acción. Probá de nuevo en un momento.')
    expect(screen.queryByText(/rate limit/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))
    expect(alInvitar).toHaveBeenCalledTimes(1)
  })

  it('un doble toque no manda dos invitaciones', async () => {
    const pendiente = promesaManual<typeof RESPUESTA>()
    duenos.invitar.mockReturnValue(pendiente.promesa)
    abrir()
    await completar('Juan', 'juan@laparrilla.com')

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))
    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Enviando…' }))

    expect(duenos.invitar).toHaveBeenCalledTimes(1)
    pendiente.resolver(RESPUESTA)
  })

  it('un envío que llega mientras el anterior sigue en curso, sin pasar por el botón, tampoco manda otra invitación', async () => {
    const pendiente = promesaManual<typeof RESPUESTA>()
    duenos.invitar.mockReturnValue(pendiente.promesa)
    abrir()
    await completar('Juan', 'juan@laparrilla.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    fireEvent.submit(document.getElementById('form-invitar-dueno') as HTMLFormElement)

    expect(duenos.invitar).toHaveBeenCalledTimes(1)
    pendiente.resolver(RESPUESTA)
  })

  it('Cancelar lo cierra sin invitar', async () => {
    const { alCerrar } = abrir()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(alCerrar).toHaveBeenCalledTimes(1)
    expect(duenos.invitar).not.toHaveBeenCalled()
  })

  it('avisa que la acción queda registrada en el historial', () => {
    abrir()

    expect(screen.getByText('Esta acción queda registrada en el historial.')).toBeInTheDocument()
  })
})

describe('DialogoInvitarDueno eligiendo la marca (desde la lista de dueños)', () => {
  function abrir(marcaInicialId?: string) {
    const alInvitar = vi.fn()
    render(<DialogoInvitarDueno marcaInicialId={marcaInicialId} onInvitado={alInvitar} onCerrar={vi.fn()} />)
    return { alInvitar }
  }

  it('ofrece las marcas activas, no las de baja (la lista se pide sin las bajas)', async () => {
    abrir()

    const selector = await screen.findByLabelText('Marca *')
    await within(selector).findByRole('option', { name: 'La Parrilla' })

    expect(marcas.listar).toHaveBeenCalledWith()
    expect(within(selector).getAllByRole('option').map((o) => o.textContent)).toEqual(['Elegí la marca', 'La Parrilla', 'Café del Puerto'])
  })

  it('mientras carga las marcas, el selector lo dice y está desactivado', async () => {
    const pendiente = promesaManual<ReturnType<typeof marcaResumen>[]>()
    marcas.listar.mockReturnValue(pendiente.promesa)
    abrir()

    expect(screen.getByLabelText('Marca *')).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Cargando marcas…' })).toBeInTheDocument()
    pendiente.resolver([marcaResumen()])
    expect(await screen.findByRole('option', { name: 'La Parrilla' })).toBeInTheDocument()
    expect(screen.getByLabelText('Marca *')).toBeEnabled()
  })

  it('sin elegir marca avisa y no llama a la API', async () => {
    abrir()
    await screen.findByRole('option', { name: 'La Parrilla' })
    await completar('Juan', 'juan@laparrilla.com')

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    expect(screen.getByText('Elegí la marca.')).toBeInTheDocument()
    expect(screen.getByLabelText('Marca *')).toHaveAttribute('aria-invalid', 'true')
    expect(duenos.invitar).not.toHaveBeenCalled()
  })

  it('invita a la marca elegida', async () => {
    duenos.invitar.mockResolvedValue(RESPUESTA)
    abrir()
    await screen.findByRole('option', { name: 'Café del Puerto' })

    await userEvent.selectOptions(screen.getByLabelText('Marca *'), 'Café del Puerto')
    await completar('Mateo', 'mateo@cafedelpuerto.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    expect(duenos.invitar).toHaveBeenCalledWith('marca-2', { email: 'mateo@cafedelpuerto.com', nombre: 'Mateo' })
  })

  it('con una marca inicial, ya viene elegida', async () => {
    abrir('marca-2')

    await screen.findByRole('option', { name: 'Café del Puerto' })

    expect(screen.getByLabelText('Marca *')).toHaveValue('marca-2')
  })

  it('si no hay marcas activas lo dice en el selector', async () => {
    marcas.listar.mockResolvedValue([])
    abrir()

    expect(await screen.findByRole('option', { name: 'No hay marcas activas' })).toBeInTheDocument()
  })

  it('si no se pudieron cargar las marcas ofrece reintentar, y al volver a pedirlas aparecen', async () => {
    marcas.listar.mockRejectedValueOnce(new ApiError(500, 'Error 500'))
    abrir()

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los datos.')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('option', { name: 'La Parrilla' })).toBeInTheDocument()
    expect(marcas.listar).toHaveBeenCalledTimes(2)
  })

  it('sin red lo dice', async () => {
    marcas.listar.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    abrir()

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión.')
  })
})
