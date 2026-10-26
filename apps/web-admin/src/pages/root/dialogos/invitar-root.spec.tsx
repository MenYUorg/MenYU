import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, api } from '../../../services/api'
import { promesaManual } from '../../../test/root'
import { DialogoInvitarRoot } from './invitar-root'

vi.mock('@menyu/auth-client', async () => (await import('../../../test/authClient')).moduloSimulado())
vi.mock('../../../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../services/api')>()
  const { apiFalsa } = await import('../../../test/root')
  return { ...original, api: apiFalsa }
})

const cuentas = vi.mocked(api.root.cuentas)

const RESPUESTA = { usuarioId: 'u1', email: 'bruno@menyu.com', invitacionEnviada: true }

beforeEach(() => vi.clearAllMocks())

function abrir() {
  const alInvitar = vi.fn()
  const alCerrar = vi.fn()
  render(<DialogoInvitarRoot onInvitada={alInvitar} onCerrar={alCerrar} />)
  return { alInvitar, alCerrar }
}

async function completar(nombre: string, email: string) {
  await userEvent.type(screen.getByLabelText('Nombre *'), nombre)
  await userEvent.type(screen.getByLabelText('Email *'), email)
}

describe('DialogoInvitarRoot', () => {
  it('no pide ni muestra ninguna contraseña: la elige la persona desde el mail', () => {
    abrir()

    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument()
    expect(screen.getByText(/elegir su contraseña/)).toBeInTheDocument()
  })

  it('invita con el nombre sin espacios sobrantes y el email en minúsculas', async () => {
    cuentas.invitar.mockResolvedValue(RESPUESTA)
    const { alInvitar } = abrir()

    await completar('  Bruno Gómez ', ' Bruno@Menyu.com ')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    expect(cuentas.invitar).toHaveBeenCalledWith({ email: 'bruno@menyu.com', nombre: 'Bruno Gómez' })
    expect(alInvitar).toHaveBeenCalledWith({ email: 'bruno@menyu.com', enviada: true })
  })

  it('si ya tenía una cuenta de acceso (invitacionEnviada: false) lo avisa', async () => {
    cuentas.invitar.mockResolvedValue({ ...RESPUESTA, invitacionEnviada: false })
    const { alInvitar } = abrir()

    await completar('Bruno', 'bruno@menyu.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    expect(alInvitar).toHaveBeenCalledWith({ email: 'bruno@menyu.com', enviada: false })
  })

  it('con todo vacío avisa debajo de cada campo y no llama a la API', async () => {
    abrir()

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    expect(screen.getByText('Escribí el nombre.')).toBeInTheDocument()
    expect(screen.getByText('Escribí el email.')).toBeInTheDocument()
    expect(cuentas.invitar).not.toHaveBeenCalled()
  })

  it('un email mal escrito avisa y no llama a la API', async () => {
    abrir()

    await completar('Bruno', 'bruno')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    expect(screen.getByText(/Revisá el email/)).toBeInTheDocument()
    expect(cuentas.invitar).not.toHaveBeenCalled()
  })

  it('si el email ya tiene una cuenta de MenYU (409) lo dice en el campo y manda al script', async () => {
    cuentas.invitar.mockRejectedValue(new ApiError(409, 'Ese email ya tiene una cuenta en MenYU: para hacerla ROOT está el script de cuentas ROOT (promover)'))
    const { alInvitar, alCerrar } = abrir()
    await completar('Dana', 'dana@menyu.com')

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    expect(await screen.findByText(/ya tiene una cuenta de MenYU/)).toBeInTheDocument()
    expect(screen.getByText(/el equipo usa el script de cuentas ROOT/)).toBeInTheDocument()
    expect(screen.getByLabelText('Email *')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(alInvitar).not.toHaveBeenCalled()
    expect(alCerrar).not.toHaveBeenCalled()
  })

  it('el aviso del email se va al cambiar el email', async () => {
    cuentas.invitar.mockRejectedValue(new ApiError(409, 'Ese email ya tiene una cuenta en MenYU'))
    abrir()
    await completar('Dana', 'dana@menyu.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))
    await screen.findByText(/el equipo usa el script/)

    await userEvent.type(screen.getByLabelText('Email *'), 'x')

    expect(screen.queryByText(/el equipo usa el script/)).not.toBeInTheDocument()
  })

  it('cualquier otro error (502 de Supabase, caída) se muestra arriba y se puede volver a intentar', async () => {
    cuentas.invitar.mockRejectedValueOnce(new ApiError(502, 'Supabase no pudo procesar la invitación'))
    cuentas.invitar.mockResolvedValueOnce(RESPUESTA)
    const { alInvitar } = abrir()
    await completar('Bruno', 'bruno@menyu.com')

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos completar la acción. Probá de nuevo en un momento.')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))
    expect(alInvitar).toHaveBeenCalledTimes(1)
  })

  it('un doble toque no manda dos invitaciones', async () => {
    const pendiente = promesaManual<typeof RESPUESTA>()
    cuentas.invitar.mockReturnValue(pendiente.promesa)
    abrir()
    await completar('Bruno', 'bruno@menyu.com')

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enviando…' }))

    expect(cuentas.invitar).toHaveBeenCalledTimes(1)
    pendiente.resolver(RESPUESTA)
  })

  it('un envío que llega mientras el anterior sigue en curso, sin pasar por el botón, tampoco manda otra invitación', async () => {
    const pendiente = promesaManual<typeof RESPUESTA>()
    cuentas.invitar.mockReturnValue(pendiente.promesa)
    abrir()
    await completar('Bruno', 'bruno@menyu.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))

    fireEvent.submit(document.getElementById('form-invitar-root') as HTMLFormElement)

    expect(cuentas.invitar).toHaveBeenCalledTimes(1)
    pendiente.resolver(RESPUESTA)
  })

  it('Cancelar lo cierra sin invitar', async () => {
    const { alCerrar } = abrir()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(alCerrar).toHaveBeenCalledTimes(1)
    expect(cuentas.invitar).not.toHaveBeenCalled()
  })
})
