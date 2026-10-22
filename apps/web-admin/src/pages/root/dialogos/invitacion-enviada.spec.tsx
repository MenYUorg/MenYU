import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DialogoInvitacionEnviada } from './invitacion-enviada'

vi.mock('@menyu/auth-client', async () => (await import('../../../test/authClient')).moduloSimulado())

describe('DialogoInvitacionEnviada', () => {
  it('con mail enviado dice a quién le llegó y cómo pedir otro enlace', () => {
    render(<DialogoInvitacionEnviada email="juan@laparrilla.com" enviada onCerrar={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Invitación enviada' })).toBeInTheDocument()
    expect(screen.getByText('juan@laparrilla.com')).toBeInTheDocument()
    expect(screen.getByText(/elegir su contraseña y entrar/)).toBeInTheDocument()
    expect(screen.getByText(/«Olvidé mi contraseña»/)).toBeInTheDocument()
  })

  it('avisa que quedó en el historial, en pasado, y no repite el aviso de los diálogos que van a cambiar algo', () => {
    render(<DialogoInvitacionEnviada email="juan@laparrilla.com" enviada onCerrar={vi.fn()} />)

    expect(screen.getByText('Esta acción quedó registrada en el historial.')).toBeInTheDocument()
    expect(screen.queryByText('Esta acción queda registrada en el historial.')).not.toBeInTheDocument()
  })

  it('si el dueño ya tenía una cuenta, dice que no se le mandó mail y no promete que ya pueda entrar', () => {
    render(<DialogoInvitacionEnviada email="juan@laparrilla.com" enviada={false} onCerrar={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Ya tenía una cuenta' })).toBeInTheDocument()
    expect(screen.getByText(/no se le mandó ningún mail/)).toBeInTheDocument()
    expect(screen.getByText(/ya figura como dueño/)).toBeInTheDocument()
    expect(screen.queryByText(/ya puede entrar/)).not.toBeInTheDocument()
  })

  it('si el dueño nunca llegó a aceptar una invitación anterior (su cuenta existe, pero sin mail nuevo), le dice cómo pedir un enlace', () => {
    render(<DialogoInvitacionEnviada email="juan@laparrilla.com" enviada={false} onCerrar={vi.fn()} />)

    expect(screen.getByText(/Si nunca llegó a aceptar una invitación anterior/)).toBeInTheDocument()
    expect(screen.getByText(/«Olvidé mi contraseña»/)).toBeInTheDocument()
  })

  it('con una cuenta ROOT que ya tenía acceso (por ejemplo, con Google) habla de la consola, no de la marca', () => {
    render(<DialogoInvitacionEnviada email="dana@menyu.com" enviada={false} aRoot onCerrar={vi.fn()} />)

    expect(screen.getByText(/usar la consola de ROOT/)).toBeInTheDocument()
    expect(screen.getByText(/la que creó con Google/)).toBeInTheDocument()
    expect(screen.queryByText(/figura como dueño/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Si nunca llegó a aceptar/)).not.toBeInTheDocument() // esa cuenta ya está confirmada
  })

  it('"Listo" lo cierra', async () => {
    const alCerrar = vi.fn()
    render(<DialogoInvitacionEnviada email="juan@laparrilla.com" enviada onCerrar={alCerrar} />)

    await userEvent.click(screen.getByRole('button', { name: 'Listo' }))

    expect(alCerrar).toHaveBeenCalledTimes(1)
  })
})
