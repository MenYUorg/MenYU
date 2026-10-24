import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { compartirLaSesionDeWebAuth } from '../../test/authClient'
import { irA } from '../../utils/navegar'
import { MenuDrawer } from './MenuDrawer'

vi.mock('../../utils/navegar', () => ({ irA: vi.fn() }))

function Ubicacion() {
  const { pathname, search } = useLocation()
  return <p>ahora: {pathname}{search}</p>
}

type Props = Parameters<typeof MenuDrawer>[0]

const PROPS: Props = {
  abierto: true,
  onCerrar: () => {},
  modo: 'mesa',
  restauranteId: 'rest-1',
  nombreRestaurante: 'La Parrilla del Puerto',
  direccion: 'Av. Alicia Moreau de Justo 1150, Puerto Madero',
  logoUrl: null,
  usuario: null,
  comensalNombre: null,
  puedeCerrarSesion: true,
  onCerrarSesion: () => {},
}

/** Dibuja el menú con esos cambios y devuelve los espías de lo que avisa. */
function renderDrawer(parcial: Partial<Props> = {}) {
  const alCerrar = vi.fn()
  const alCerrarSesion = vi.fn()
  const resultado = render(
    <MemoryRouter initialEntries={['/origen']}>
      <MenuDrawer {...PROPS} onCerrar={alCerrar} onCerrarSesion={alCerrarSesion} {...parcial} />
      <Routes>
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>,
  )
  return { alCerrar, alCerrarSesion, ...resultado }
}

const CON_CUENTA = { nombre: 'Ana Gómez de la Fuente', email: 'ana@mail.com' }
const panel = () => screen.getByText('Mis pedidos').closest('div[style*="translateX"]') as HTMLElement

describe('MenuDrawer', () => {
  describe('el restaurante, arriba', () => {
    it('muestra su nombre y su dirección', () => {
      renderDrawer()

      expect(screen.getByText('La Parrilla del Puerto')).toBeInTheDocument()
      expect(screen.getByText('Av. Alicia Moreau de Justo 1150, Puerto Madero')).toBeInTheDocument()
    })

    it('sin dirección cargada no muestra ninguna línea (ni un hueco)', () => {
      const { container } = renderDrawer({ direccion: null })

      expect(screen.getByText('La Parrilla del Puerto')).toBeInTheDocument()
      expect(container.querySelector('svg[width="14"]')).toBeNull()
    })

    it('una dirección larguísima, sin espacios, se parte en vez de salirse del menú', () => {
      renderDrawer({ direccion: 'Calle-con-un-nombre-larguisimo-sin-espacios-12345-y-mas-y-mas' })

      expect(screen.getByText('Calle-con-un-nombre-larguisimo-sin-espacios-12345-y-mas-y-mas')).toHaveStyle({ overflowWrap: 'anywhere' })
    })

    it('muestra el logo del restaurante, entero', () => {
      const { container } = renderDrawer({ logoUrl: 'https://x/logo.png' })

      const imagen = container.querySelector('img') as HTMLImageElement
      expect(imagen).toHaveAttribute('src', 'https://x/logo.png')
      expect(imagen).toHaveStyle({ objectFit: 'contain' })
    })

    it('sin logo del restaurante ni de su marca muestra el de MenYU', () => {
      const { container } = renderDrawer({ logoUrl: null })

      expect(container.querySelector('img')).toHaveAttribute('src', '/logo-u.png')
    })

    it('en la carta también', () => {
      renderDrawer({ modo: 'carta' })

      expect(screen.getByText('La Parrilla del Puerto')).toBeInTheDocument()
      expect(screen.getByText('Av. Alicia Moreau de Justo 1150, Puerto Madero')).toBeInTheDocument()
    })
  })

  describe('la animación al abrir', () => {
    const cajaDelLogo = (c: HTMLElement) => c.querySelector('img')!.parentElement as HTMLElement
    const bloqueDelNombre = () => screen.getByText('La Parrilla del Puerto').parentElement as HTMLElement

    it('al abrirse el logo está en su tamaño y el nombre a la vista', () => {
      const { container } = renderDrawer({ abierto: true })

      expect(cajaDelLogo(container).className).toContain('scale-100')
      expect(bloqueDelNombre().className).toContain('opacity-100')
    })

    it('cerrado, el logo está más chico y el nombre invisible (y se agrandan al abrirse)', () => {
      const { container } = renderDrawer({ abierto: false })

      expect(cajaDelLogo(container).className).toContain('scale-[0.55]')
      expect(bloqueDelNombre().className).toContain('opacity-0')
    })

    it('es corta y suave: dura menos de medio segundo y el nombre entra un instante después', () => {
      const { container } = renderDrawer()

      expect(cajaDelLogo(container).className).toMatch(/duration-300\b/)
      expect(cajaDelLogo(container).className).toContain('ease-out')
      expect(bloqueDelNombre().className).toMatch(/delay-100\b/)
    })

    it('si la persona pidió menos movimiento, no hay transición (queda en su estado final al instante)', () => {
      const { container } = renderDrawer()

      expect(cajaDelLogo(container).className).toContain('motion-reduce:transition-none')
      expect(bloqueDelNombre().className).toContain('motion-reduce:transition-none')
    })

    it('el panel también se puede desplazar, por si el restaurante y la cuenta ocupan toda la pantalla', () => {
      renderDrawer()

      expect(panel()).toHaveStyle({ overflowY: 'auto' })
    })
  })

  describe('al elegir una fila se cierra y navega', () => {
    it.each([
      ['mesa', 'Etiquetar pedidos', '/etiquetar'],
      ['mesa', 'Mis pedidos', '/pedidos'],
      ['mesa', 'Pagar la cuenta', '/pagar'],
      ['carta', 'Ingresar a una mesa', '/restaurante/rest-1/mesa'],
      ['carta', 'Volver al inicio', '/'],
    ] as const)('en la %s, "%s" lleva a %s y cierra el menú', (modo, fila, ruta) => {
      const { alCerrar } = renderDrawer({ modo })

      fireEvent.click(screen.getByText(fila))

      expect(screen.getByText(`ahora: ${ruta}`)).toBeInTheDocument()
      expect(alCerrar).toHaveBeenCalledTimes(1)
    })

    it('"Iniciar sesión" y "Crear cuenta gratis" también cierran el menú', () => {
      const { alCerrar } = renderDrawer()

      fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
      fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta gratis' }))

      expect(alCerrar).toHaveBeenCalledTimes(2)
    })

    it('tocar el fondo oscuro cierra el menú', () => {
      const { alCerrar } = renderDrawer()

      fireEvent.click(document.body.querySelector('div[style*="rgba(45, 53, 97, 0.45)"]') as HTMLElement)

      expect(alCerrar).toHaveBeenCalledTimes(1)
    })
  })

  describe('las filas de cada pantalla', () => {
    it('la mesa ofrece lo del pedido', () => {
      renderDrawer({ modo: 'mesa' })

      expect(screen.getByText('Etiquetar pedidos')).toBeInTheDocument()
      expect(screen.getByText('Mis pedidos')).toBeInTheDocument()
      expect(screen.getByText('Pagar la cuenta')).toBeInTheDocument()
      expect(screen.queryByText('Ingresar a una mesa')).not.toBeInTheDocument()
      expect(screen.queryByText('Volver al inicio')).not.toBeInTheDocument()
    })

    it('la carta ofrece entrar a una mesa y volver al inicio, y nada del pedido', () => {
      renderDrawer({ modo: 'carta' })

      expect(screen.getByText('Ingresar a una mesa')).toBeInTheDocument()
      expect(screen.getByText('Volver al inicio')).toBeInTheDocument()
      expect(screen.queryByText('Volver al restaurante')).not.toBeInTheDocument()
      expect(screen.queryByText('Etiquetar pedidos')).not.toBeInTheDocument()
      expect(screen.queryByText('Mis pedidos')).not.toBeInTheDocument()
      expect(screen.queryByText('Pagar la cuenta')).not.toBeInTheDocument()
    })
  })

  // En web-auth (Fase 4b), que vuelve a la pantalla en la que estaba: la carta o el menú de la mesa. En jsdom esa URL es
  // la de la página (window.location), no la del MemoryRouter.
  describe('iniciar sesión y registrarse (sin cuenta)', () => {
    beforeEach(() => {
      vi.mocked(irA).mockClear()
      compartirLaSesionDeWebAuth()
    })
    afterEach(() => vi.unstubAllEnvs())
    const vuelta = () => new URLSearchParams({ redirect: window.location.href }).toString()

    it.each(['mesa', 'carta'] as const)('desde la %s, "Iniciar sesión" va a web-auth y vuelve acá', (modo) => {
      const { alCerrar } = renderDrawer({ modo })

      fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

      expect(irA).toHaveBeenCalledWith(`https://auth.menyu-app.com/?${vuelta()}`)
      expect(alCerrar).toHaveBeenCalled()
    })

    it.each(['mesa', 'carta'] as const)('desde la %s, "Crear cuenta gratis" va al registro de web-auth y vuelve acá', (modo) => {
      renderDrawer({ modo })

      fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta gratis' }))

      expect(irA).toHaveBeenCalledWith(`https://auth.menyu-app.com/crear-cuenta?${vuelta()}`)
    })

    it('donde la app no comparte la sesión de web-auth (un dominio viejo de Vercel), van al /auth de la app', () => {
      vi.stubEnv('VITE_AUTH_COOKIE_DOMAIN', '.menyu-app.com')
      const { alCerrar } = renderDrawer({ modo: 'carta' })

      fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta gratis' }))

      expect(screen.getByText('ahora: /auth?tab=register&volver=%2F')).toBeInTheDocument()
      expect(irA).not.toHaveBeenCalled()
      expect(alCerrar).toHaveBeenCalled()
    })
  })

  describe('el id del restaurante con caracteres raros', () => {
    it('se escribe seguro en las direcciones: no cambia la ruta ni agrega parámetros', () => {
      renderDrawer({ modo: 'carta', restauranteId: 'a/b?c=d' })

      fireEvent.click(screen.getByText('Ingresar a una mesa'))

      expect(screen.getByText('ahora: /restaurante/a%2Fb%3Fc%3Dd/mesa')).toBeInTheDocument()
    })
  })

  describe('la cuenta', () => {
    it('un invitado de la mesa con nombre es saludado por ese nombre', () => {
      renderDrawer({ modo: 'mesa', comensalNombre: 'Lucía' })

      expect(screen.getByText('¡Hola, Lucía!')).toBeInTheDocument()
      expect(screen.getByText('Estás navegando como invitado')).toBeInTheDocument()
    })

    it('un invitado de la mesa sin nombre es saludado sin nombre', () => {
      renderDrawer({ modo: 'mesa' })

      expect(screen.getByText('¡Hola!')).toBeInTheDocument()
    })

    it('en la carta no se usa el nombre de una mesa (puede ser de otra persona o de otro día)', () => {
      renderDrawer({ modo: 'carta', comensalNombre: 'Lucía' })

      expect(screen.getByText('¡Hola!')).toBeInTheDocument()
      expect(screen.queryByText(/Lucía/)).not.toBeInTheDocument()
    })

    it('con cuenta saluda por el nombre completo y no ofrece iniciar sesión ni crear una cuenta', () => {
      renderDrawer({ usuario: CON_CUENTA })

      expect(screen.getByText('¡Hola, Ana Gómez de la Fuente!')).toBeInTheDocument()
      expect(screen.getByText('ana@mail.com')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Crear cuenta gratis' })).not.toBeInTheDocument()
      expect(screen.queryByText('Estás navegando como invitado')).not.toBeInTheDocument()
    })

    it('con cuenta, el saludo ignora el nombre que dio como comensal', () => {
      renderDrawer({ usuario: CON_CUENTA, comensalNombre: 'Lucía' })

      expect(screen.queryByText(/Lucía/)).not.toBeInTheDocument()
    })

    it('un nombre larguísimo sin espacios se parte en vez de salirse del menú', () => {
      renderDrawer({ usuario: { nombre: 'Superlargonombredeusuariosinespacios', email: '' } })

      expect(screen.getByText('¡Hola, Superlargonombredeusuariosinespacios!')).toHaveStyle({ overflowWrap: 'anywhere' })
    })

    it('sin email no deja una línea vacía debajo del saludo', () => {
      renderDrawer({ usuario: { nombre: 'Ana', email: '' }, puedeCerrarSesion: false })

      // Sin email y sin "Cerrar sesión", el saludo es lo último de la cabeza.
      expect(screen.getByText('¡Hola, Ana!').nextElementSibling).toBeNull()
    })
  })

  describe('"Cerrar sesión"', () => {
    it('se ofrece cuando se puede y avisa al tocarlo', () => {
      const { alCerrarSesion } = renderDrawer({ usuario: CON_CUENTA, puedeCerrarSesion: true })

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

      expect(alCerrarSesion).toHaveBeenCalledTimes(1)
    })

    it('no se ofrece cuando no se puede (la mesa ya pidió algo)', () => {
      renderDrawer({ usuario: CON_CUENTA, puedeCerrarSesion: false })

      expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
      // El saludo sigue.
      expect(screen.getByText('¡Hola, Ana Gómez de la Fuente!')).toBeInTheDocument()
    })

    it('sin cuenta nunca aparece, aunque se pueda', () => {
      renderDrawer({ usuario: null, puedeCerrarSesion: true })

      expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
    })

    it('tocarlo no cierra el menú por su cuenta (lo decide quien lo recibe)', () => {
      const { alCerrar } = renderDrawer({ usuario: CON_CUENTA })

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

      expect(alCerrar).not.toHaveBeenCalled()
    })
  })

  describe('"Mis puntos"', () => {
    it('es solo de la mesa y solo con cuenta', () => {
      const { unmount } = renderDrawer({ modo: 'mesa', usuario: CON_CUENTA })
      expect(screen.getByText('Mis puntos')).toBeInTheDocument()
      unmount()

      const { unmount: otro } = renderDrawer({ modo: 'carta', usuario: CON_CUENTA })
      expect(screen.queryByText('Mis puntos')).not.toBeInTheDocument()
      otro()

      renderDrawer({ modo: 'mesa', usuario: null })
      expect(screen.queryByText('Mis puntos')).not.toBeInTheDocument()
    })
  })

  it('cerrado queda fuera de la pantalla, abierto a la vista', () => {
    const { unmount } = renderDrawer({ abierto: false })
    expect(panel().style.transform).toBe('translateX(-100%)')
    unmount()

    renderDrawer({ abierto: true })
    expect(panel().style.transform).toBe('translateX(0)')
  })
})
