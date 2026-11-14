import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe } from '../test/axe'
import { AbriendoMesaScreen, CheckInFalloScreen } from './CheckInScreens'
import { AnfitrionScreen, CodigoSesionScreen } from './SesionSeguraModals'

// Las pantallas por las que se entra a una mesa (`/check-in` y el modo seguro): cada una con su <h1> y su <main>.

const dentroDeRouter = (pantalla: React.ReactElement) => render(<MemoryRouter>{pantalla}</MemoryRouter>)

describe('AbriendoMesaScreen (`/check-in` mientras abre la mesa)', () => {
  it('"Abriendo tu mesa…" es el <h1>, dentro de un <main>', () => {
    dentroDeRouter(<AbriendoMesaScreen />)

    expect(screen.getByRole('heading', { level: 1, name: 'Abriendo tu mesa…' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('el aviso de que tarda unos segundos sigue siendo una región de estado', () => {
    dentroDeRouter(<AbriendoMesaScreen />)

    expect(screen.getByRole('status')).toHaveTextContent('Esto tarda solo unos segundos.')
  })

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const { container } = dentroDeRouter(<AbriendoMesaScreen />)

    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('CheckInFalloScreen (la mesa no se pudo abrir)', () => {
  it.each([
    ['qr', 'No pudimos abrir tu mesa'],
    ['red', 'No pudimos conectarnos'],
    ['cerrado', 'Este restaurante no está disponible'],
  ] as const)('con el motivo "%s" el <h1> dice "%s", dentro de un <main>', (motivo, titulo) => {
    dentroDeRouter(<CheckInFalloScreen motivo={motivo} restauranteId="rest-1" onReintentar={() => {}} />)

    expect(screen.getByRole('heading', { level: 1, name: titulo })).toBeInTheDocument()
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('alert'))
  })

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const { container } = dentroDeRouter(<CheckInFalloScreen motivo="qr" restauranteId="rest-1" onReintentar={() => {}} />)

    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('AnfitrionScreen (el código de una mesa en modo seguro)', () => {
  it('"¡Sos el anfitrión de la mesa!" es el <h1>, dentro de un <main>', () => {
    dentroDeRouter(<AnfitrionScreen codigo="042" onContinuar={() => {}} />)

    expect(screen.getByRole('heading', { level: 1, name: '¡Sos el anfitrión de la mesa!' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('042')
  })

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const { container } = dentroDeRouter(<AnfitrionScreen codigo="042" onContinuar={() => {}} />)

    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('CodigoSesionScreen (unirse a una mesa en modo seguro)', () => {
  it('"Mesa en modo seguro" es el <h1> y el formulario va dentro del <main>', () => {
    dentroDeRouter(<CodigoSesionScreen loading={false} error={null} onSubmit={() => {}} onVolver={() => {}} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Mesa en modo seguro' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('button', { name: 'Unirme a la mesa' }))
  })

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const { container } = dentroDeRouter(<CodigoSesionScreen loading={false} error={null} onSubmit={() => {}} onVolver={() => {}} />)

    expect(await axe(container)).toHaveNoViolations()
  })
})
