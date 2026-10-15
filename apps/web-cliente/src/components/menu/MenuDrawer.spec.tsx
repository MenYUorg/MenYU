import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { MenuDrawer } from './MenuDrawer'
import type { ModoMenu } from './modo'

function Ubicacion() {
  const { pathname, search } = useLocation()
  return <p>ahora: {pathname}{search}</p>
}

interface Props {
  modo: ModoMenu
  restauranteId: string
  usuario: { nombre: string; email: string } | null
  comensalNombre: string | null
}

function renderDrawer({ modo, restauranteId, usuario, comensalNombre }: Props) {
  const alCerrar = vi.fn()
  const alCerrarSesion = vi.fn()
  render(
    <MemoryRouter initialEntries={['/origen']}>
      <MenuDrawer abierto onCerrar={alCerrar} modo={modo} restauranteId={restauranteId} usuario={usuario} comensalNombre={comensalNombre} onCerrarSesion={alCerrarSesion} />
      <Routes>
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>,
  )
  return { alCerrar, alCerrarSesion }
}

const INVITADO: Pick<Props, 'usuario' | 'comensalNombre'> = { usuario: null, comensalNombre: null }

describe('MenuDrawer', () => {
  describe('al elegir una fila se cierra y navega', () => {
    it.each([
      ['mesa', 'Etiquetar pedidos', '/etiquetar'],
      ['mesa', 'Mis pedidos', '/pedidos'],
      ['mesa', 'Pagar la cuenta', '/pagar'],
      ['carta', 'Ingresar a una mesa', '/restaurante/rest-1/mesa'],
      ['carta', 'Volver al restaurante', '/restaurante/rest-1'],
    ] as const)('en la %s, "%s" lleva a %s y cierra el menú', (modo, fila, ruta) => {
      const { alCerrar } = renderDrawer({ modo, restauranteId: 'rest-1', ...INVITADO })

      fireEvent.click(screen.getByText(fila))

      expect(screen.getByText(`ahora: ${ruta}`)).toBeInTheDocument()
      expect(alCerrar).toHaveBeenCalledTimes(1)
    })

    it('"Iniciar sesión" y "Crear cuenta gratis" también cierran el menú', () => {
      const { alCerrar } = renderDrawer({ modo: 'mesa', restauranteId: 'rest-1', ...INVITADO })

      fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
      fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta gratis' }))

      expect(alCerrar).toHaveBeenCalledTimes(2)
    })

    it('tocar el fondo oscuro cierra el menú', () => {
      const { alCerrar } = renderDrawer({ modo: 'mesa', restauranteId: 'rest-1', ...INVITADO })

      fireEvent.click(document.body.querySelector('div[style*="rgba(45, 53, 97, 0.45)"]') as HTMLElement)

      expect(alCerrar).toHaveBeenCalledTimes(1)
    })
  })

  describe('iniciar sesión y registrarse', () => {
    it('desde la mesa no llevan "volver"', () => {
      renderDrawer({ modo: 'mesa', restauranteId: 'rest-1', ...INVITADO })

      fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
      expect(screen.getByText('ahora: /auth')).toBeInTheDocument()
    })

    it('desde la mesa, "Crear cuenta gratis" abre el registro sin "volver"', () => {
      renderDrawer({ modo: 'mesa', restauranteId: 'rest-1', ...INVITADO })

      fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta gratis' }))

      expect(screen.getByText('ahora: /auth?tab=register')).toBeInTheDocument()
    })

    it('desde la carta vuelven a la carta', () => {
      renderDrawer({ modo: 'carta', restauranteId: 'rest-1', ...INVITADO })

      fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

      expect(screen.getByText('ahora: /auth?volver=%2Frestaurante%2Frest-1%2Fcarta')).toBeInTheDocument()
    })

    it('desde la carta, el registro abre la pestaña de registrarse y vuelve a la carta', () => {
      renderDrawer({ modo: 'carta', restauranteId: 'rest-1', ...INVITADO })

      fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta gratis' }))

      expect(screen.getByText('ahora: /auth?tab=register&volver=%2Frestaurante%2Frest-1%2Fcarta')).toBeInTheDocument()
    })
  })

  describe('el id del restaurante con caracteres raros', () => {
    it('se escribe seguro en las direcciones: no cambia la ruta ni agrega parámetros', () => {
      renderDrawer({ modo: 'carta', restauranteId: 'a/b?c=d', ...INVITADO })

      fireEvent.click(screen.getByText('Ingresar a una mesa'))

      expect(screen.getByText('ahora: /restaurante/a%2Fb%3Fc%3Dd/mesa')).toBeInTheDocument()
    })

    it('y también en el "volver" del inicio de sesión', () => {
      renderDrawer({ modo: 'carta', restauranteId: 'a/b', ...INVITADO })

      fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

      expect(screen.getByText('ahora: /auth?volver=%2Frestaurante%2Fa%252Fb%2Fcarta')).toBeInTheDocument()
    })
  })

  describe('la cabeza', () => {
    it('un invitado de la mesa con nombre es saludado por ese nombre', () => {
      renderDrawer({ modo: 'mesa', restauranteId: 'rest-1', usuario: null, comensalNombre: 'Lucía' })

      expect(screen.getByText('¡Hola, Lucía!')).toBeInTheDocument()
      expect(screen.getByText('Estás navegando como invitado')).toBeInTheDocument()
    })

    it('un invitado de la mesa sin nombre es saludado sin nombre', () => {
      renderDrawer({ modo: 'mesa', restauranteId: 'rest-1', ...INVITADO })

      expect(screen.getByText('¡Hola!')).toBeInTheDocument()
    })

    it('en la carta no se usa el nombre de una mesa (puede ser de otra persona o de otro día)', () => {
      renderDrawer({ modo: 'carta', restauranteId: 'rest-1', usuario: null, comensalNombre: 'Lucía' })

      expect(screen.getByText('¡Hola!')).toBeInTheDocument()
      expect(screen.queryByText(/Lucía/)).not.toBeInTheDocument()
    })

    it('con cuenta muestra el primer nombre y el email, y "Cerrar sesión" avisa', () => {
      const { alCerrarSesion } = renderDrawer({ modo: 'carta', restauranteId: 'rest-1', usuario: { nombre: 'Ana Gómez', email: 'ana@mail.com' }, comensalNombre: null })

      expect(screen.getByText('¡Hola, Ana!')).toBeInTheDocument()
      expect(screen.getByText('ana@mail.com')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

      expect(alCerrarSesion).toHaveBeenCalledTimes(1)
    })

    it('"Mis puntos" es solo de la mesa y solo con cuenta', () => {
      const conCuenta = { nombre: 'Ana', email: 'ana@mail.com' }
      const { unmount } = render(
        <MemoryRouter>
          <MenuDrawer abierto onCerrar={vi.fn()} modo="mesa" restauranteId="r" usuario={conCuenta} comensalNombre={null} onCerrarSesion={vi.fn()} />
        </MemoryRouter>,
      )
      expect(screen.getByText('Mis puntos')).toBeInTheDocument()
      unmount()

      render(
        <MemoryRouter>
          <MenuDrawer abierto onCerrar={vi.fn()} modo="carta" restauranteId="r" usuario={conCuenta} comensalNombre={null} onCerrarSesion={vi.fn()} />
        </MemoryRouter>,
      )
      expect(screen.queryByText('Mis puntos')).not.toBeInTheDocument()
    })
  })

  it('cerrado queda fuera de la pantalla, abierto a la vista', () => {
    const { unmount } = render(
      <MemoryRouter>
        <MenuDrawer abierto={false} onCerrar={vi.fn()} modo="mesa" restauranteId="r" usuario={null} comensalNombre={null} onCerrarSesion={vi.fn()} />
      </MemoryRouter>,
    )
    const panelCerrado = screen.getByText('Mis pedidos').closest('div[style*="translateX"]') as HTMLElement
    expect(panelCerrado.style.transform).toBe('translateX(-100%)')
    unmount()

    render(
      <MemoryRouter>
        <MenuDrawer abierto onCerrar={vi.fn()} modo="mesa" restauranteId="r" usuario={null} comensalNombre={null} onCerrarSesion={vi.fn()} />
      </MemoryRouter>,
    )
    const panelAbierto = screen.getByText('Mis pedidos').closest('div[style*="translateX"]') as HTMLElement
    expect(panelAbierto.style.transform).toBe('translateX(0)')
  })
})
