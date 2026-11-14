import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useSessionStore } from '../../store/sessionStore'
import { axe } from '../../test/axe'
import { PagoExitosoPage } from './PagoExitosoPage'
import { PagoFallidoPage } from './PagoFallidoPage'
import { PagoPendientePage } from './PagoPendientePage'

function Destino() {
  const { pathname } = useLocation()
  return <p>destino {pathname}</p>
}

function abrir(ruta: string, pantalla: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path={ruta} element={pantalla} />
        <Route path="*" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PagoExitosoPage', () => {
  it('agradece, va dentro de un <main> y "Salir" cierra la sesión de mesa y vuelve al inicio', () => {
    useSessionStore.setState({ sesionId: 'ses-1', restauranteId: 'rest-1', jwt: 'jwt' })
    abrir('/pago/exitoso', <PagoExitosoPage />)

    expect(screen.getByRole('main')).toHaveTextContent('Tu pago fue acreditado con éxito')
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))

    expect(screen.getByText('destino /')).toBeInTheDocument()
    expect(useSessionStore.getState().sesionId).toBeNull()
  })

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const { container } = abrir('/pago/exitoso', <PagoExitosoPage />)

    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('PagoFallidoPage', () => {
  it('explica que no se pudo procesar, va dentro de un <main> y deja reintentar o volver al menú', () => {
    abrir('/pago/fallido', <PagoFallidoPage />)

    expect(screen.getByRole('main')).toHaveTextContent('El pago no pudo procesarse')

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(screen.getByText('destino /pagar')).toBeInTheDocument()
  })

  it('"Volver al menú" lleva al menú', () => {
    abrir('/pago/fallido', <PagoFallidoPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Volver al menú' }))

    expect(screen.getByText('destino /menu')).toBeInTheDocument()
  })

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const { container } = abrir('/pago/fallido', <PagoFallidoPage />)

    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('PagoPendientePage', () => {
  it('avisa que el pago se está verificando, va dentro de un <main> y lleva a "Mis pedidos"', () => {
    abrir('/pago/pendiente', <PagoPendientePage />)

    expect(screen.getByRole('main')).toHaveTextContent('Pago en proceso')

    fireEvent.click(screen.getByRole('button', { name: 'Ver mis pedidos' }))
    expect(screen.getByText('destino /pedidos')).toBeInTheDocument()
  })

  it('"Volver al menú" lleva al menú', () => {
    abrir('/pago/pendiente', <PagoPendientePage />)

    fireEvent.click(screen.getByRole('button', { name: 'Volver al menú' }))

    expect(screen.getByText('destino /menu')).toBeInTheDocument()
  })

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const { container } = abrir('/pago/pendiente', <PagoPendientePage />)

    expect(await axe(container)).toHaveNoViolations()
  })
})
