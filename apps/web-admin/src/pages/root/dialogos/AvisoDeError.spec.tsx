import { render, screen } from '@testing-library/react'
import { mensajeDeEnvio } from './envio'
import { AvisoDeError } from './AvisoDeError'
import { ApiError } from '../../../services/api'

vi.mock('@menyu/auth-client', async () => (await import('../../../test/authClient')).moduloSimulado())

describe('AvisoDeError', () => {
  it('sin texto no dibuja nada', () => {
    const { container } = render(<AvisoDeError texto="" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('un error del servidor va debajo del título, tal cual', () => {
    render(<AvisoDeError texto={mensajeDeEnvio(new ApiError(409, 'La marca está dada de baja'))} />)

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos completar la acción. La marca está dada de baja')
  })

  it('el texto genérico no repite el título', () => {
    render(<AvisoDeError texto={mensajeDeEnvio(new ApiError(502, 'Error 502'))} />)

    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('No pudimos completar la acción. Probá de nuevo en un momento.')
    expect(alerta.textContent?.match(/No pudimos completar la acción/g)).toHaveLength(1)
  })

  it('sin conexión se dice como tal', () => {
    render(<AvisoDeError texto={mensajeDeEnvio(new TypeError('Failed to fetch'))} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Sin conexión. Revisá tu internet y probá de nuevo.')
  })
})
