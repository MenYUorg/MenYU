import { act, fireEvent, render, screen } from '@testing-library/react'
import { api } from '../../services/api'
import { useSessionStore } from '../../store/sessionStore'
import { MenuHeader } from './MenuHeader'
import userEvent from '@testing-library/user-event'
import { axe } from '../../test/axe'
import { useAnunciadorStore } from '../../utils/anunciador'

vi.mock('../../services/api', () => ({
  api: { waiterCalls: { llamar: vi.fn() } },
}))

type Props = Parameters<typeof MenuHeader>[0]

const PROPS: Props = { nombre: 'La Parrilla del Puerto', logoUrl: null, modo: 'mesa', onAbrirMenu: () => {} }
const MESA = { sesionId: 'ses-1', mesaId: 'mesa-1', jwt: 'jwt', numeroMesa: '5', modoSesion: 'abierto', codigoSesion: '042' }

const renderHeader = (parcial: Partial<Props> = {}) => render(<MenuHeader {...PROPS} {...parcial} />)
const botonDelMenu = () => screen.getByRole('button', { name: 'Abrir el menú' })

describe('MenuHeader', () => {
  beforeEach(() => {
    useSessionStore.setState({ ...MESA })
    vi.mocked(api.waiterCalls.llamar).mockReset().mockResolvedValue(undefined as never)
  })

  describe('el logo es el botón del menú lateral', () => {
    it('es un botón con nombre accesible que abre el menú', () => {
      const alAbrir = vi.fn()
      renderHeader({ onAbrirMenu: alAbrir })

      fireEvent.click(botonDelMenu())

      expect(alAbrir).toHaveBeenCalledTimes(1)
    })

    it('muestra el logo del restaurante, entero', () => {
      renderHeader({ logoUrl: 'https://x/logo.png' })

      const imagen = botonDelMenu().querySelector('img') as HTMLImageElement
      expect(imagen).toHaveAttribute('src', 'https://x/logo.png')
      expect(imagen).toHaveStyle({ objectFit: 'contain' })
    })

    it('sin logo del restaurante ni de su marca muestra el de MenYU', () => {
      renderHeader({ logoUrl: null })

      expect(botonDelMenu().querySelector('img')).toHaveAttribute('src', '/logo-u.png')
    })

    it('si la imagen del logo no carga, pasa al de MenYU', () => {
      renderHeader({ logoUrl: 'https://x/roto.png' })

      fireEvent.error(botonDelMenu().querySelector('img') as HTMLImageElement)

      expect(botonDelMenu().querySelector('img')).toHaveAttribute('src', '/logo-u.png')
    })

    it('con otro logo (otro restaurante) vuelve a intentar con ese, aunque el anterior no haya cargado', () => {
      const { rerender } = renderHeader({ logoUrl: 'https://x/roto.png' })
      fireEvent.error(botonDelMenu().querySelector('img') as HTMLImageElement)

      rerender(<MenuHeader {...PROPS} logoUrl="https://x/otro.png" />)

      expect(botonDelMenu().querySelector('img')).toHaveAttribute('src', 'https://x/otro.png')
    })

    it('es un cuadro blanco de 40 px con el indicador de que abre un menú, y se toca como uno de 44', () => {
      renderHeader()

      expect(botonDelMenu()).toHaveStyle({ width: '40px', height: '40px', background: 'white' })
      expect(botonDelMenu().className).toContain('after:-inset-0.5')
      // Las tres rayitas: un círculo blanco con tres líneas.
      expect(botonDelMenu().querySelectorAll('span > span')).toHaveLength(3)
    })

    it('ya no muestra las iniciales del restaurante', () => {
      renderHeader()

      expect(screen.queryByText('LP')).not.toBeInTheDocument()
    })
  })

  describe('el nombre', () => {
    it('se muestra completo', () => {
      renderHeader({ nombre: 'El Rincón de los Abuelos — Parrilla, pastas y cocina casera de autor' })

      expect(screen.getByText('El Rincón de los Abuelos — Parrilla, pastas y cocina casera de autor')).toBeInTheDocument()
    })

    it('puede ocupar dos líneas y una palabra larguísima se parte', () => {
      renderHeader({ nombre: 'Superlargonombredelrestauranteparaprobarelcortedepalabras' })

      const nombre = screen.getByText('Superlargonombredelrestauranteparaprobarelcortedepalabras')
      expect(nombre).toHaveStyle({ overflowWrap: 'anywhere', overflow: 'hidden' })
      expect(nombre.getAttribute('style')).toContain('-webkit-line-clamp: 2')
    })
  })

  describe('en la carta', () => {
    it('no hay "Mozo" ni mesa, aunque el navegador tenga una sesión de mesa', () => {
      renderHeader({ modo: 'carta' })

      expect(screen.queryByRole('button', { name: /Mozo/ })).not.toBeInTheDocument()
      expect(screen.queryByText(/^Mesa /)).not.toBeInTheDocument()
      expect(screen.queryByText(/^PIN /)).not.toBeInTheDocument()
    })
  })

  describe('en la mesa', () => {
    it('"Mozo" llama al mozo de la mesa y avisa que está en camino', async () => {
      renderHeader()

      fireEvent.click(screen.getByRole('button', { name: /Mozo/ }))

      expect(await screen.findByRole('button', { name: '¡En camino!' })).toHaveAttribute('aria-disabled', 'true')
      expect(api.waiterCalls.llamar).toHaveBeenCalledWith('ses-1', 'jwt')
    })

    it('"Mozo" sigue con su tamaño y su texto: no se achica', () => {
      useSessionStore.setState({ modoSesion: 'seguro', codigoSesion: '731' })
      renderHeader()

      const mozo = screen.getByRole('button', { name: /Mozo/ })
      expect(mozo).toHaveTextContent('Mozo')
      expect(mozo).toHaveStyle({ padding: '7px 10px', fontSize: '11px' })
    })

    it('sin código (modo abierto) muestra solo "Mesa N", como siempre', () => {
      renderHeader()

      const mesa = screen.getByText('Mesa 5')
      expect(mesa).toHaveStyle({ padding: '6px 11px' })
      expect(screen.queryByText(/^PIN /)).not.toBeInTheDocument()
      // Sin apilar: la mesa va suelta, no dentro de una columna.
      expect(mesa.parentElement?.tagName).toBe('HEADER')
    })

    it('con código (modo seguro) pone "Mesa N" y "PIN xxx" en sus pills, uno arriba del otro', () => {
      useSessionStore.setState({ modoSesion: 'seguro', codigoSesion: '731' })
      renderHeader()

      const mesa = screen.getByText('Mesa 5')
      const pin = screen.getByText('PIN 731')
      expect(mesa.parentElement).toBe(pin.parentElement)
      expect(mesa.parentElement).toHaveStyle({ display: 'flex', flexDirection: 'column' })
      // La mesa arriba y el código abajo.
      expect(mesa.compareDocumentPosition(pin) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('apilados miden lo mismo entre sí y son más bajos que la mesa suelta, para no alargar el header', () => {
      useSessionStore.setState({ modoSesion: 'seguro', codigoSesion: '731' })
      renderHeader()

      const mesa = screen.getByText('Mesa 5')
      const pin = screen.getByText('PIN 731')
      for (const pill of [mesa, pin]) {
        expect(pill).toHaveStyle({ padding: '2px 11px', borderRadius: '999px' })
        expect(pill.getAttribute('style')).toContain('border: 1.5px solid')
      }
      // La mesa sigue naranja y el código con el borde claro.
      expect(mesa.getAttribute('style')).toContain('background: rgb(232, 86, 58)')
      expect(pin.getAttribute('style')).toContain('rgba(255, 255, 255, 0.5)')
    })

    it('un modo seguro sin código todavía no apila nada', () => {
      useSessionStore.setState({ modoSesion: 'seguro', codigoSesion: null })
      renderHeader()

      expect(screen.getByText('Mesa 5').parentElement?.tagName).toBe('HEADER')
      expect(screen.queryByText(/^PIN /)).not.toBeInTheDocument()
    })

    it('un código con el modo abierto no se muestra', () => {
      useSessionStore.setState({ modoSesion: 'abierto', codigoSesion: '042' })
      renderHeader()

      expect(screen.queryByText(/^PIN /)).not.toBeInTheDocument()
    })

    it('sin una sesión de mesa no hay botón del mozo ni número de mesa', () => {
      useSessionStore.setState({ sesionId: null, mesaId: null, jwt: null, numeroMesa: null })
      renderHeader()

      expect(screen.queryByRole('button', { name: /Mozo/ })).not.toBeInTheDocument()
      // Ni siquiera un pill vacío ("Mesa" a secas).
      expect(screen.queryByText(/^Mesa/)).not.toBeInTheDocument()
    })
  })

  describe('el nombre del restaurante es el título de la pantalla', () => {
    it('es el <h1> (en la mesa y en la carta), dentro del encabezado', () => {
      renderHeader()

      const titulo = screen.getByRole('heading', { level: 1, name: 'La Parrilla del Puerto' })
      expect(screen.getByRole('banner')).toContainElement(titulo)
    })

    it('en la carta también es el <h1>, y no hay botón del mozo', () => {
      renderHeader({ modo: 'carta' })

      expect(screen.getByRole('heading', { level: 1, name: 'La Parrilla del Puerto' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Mozo/ })).not.toBeInTheDocument()
    })
  })

  describe('el botón "Abrir el menú" y el menú lateral (accesibilidad)', () => {
    it('dice que abre un diálogo y que el menú está cerrado', () => {
      renderHeader()

      expect(botonDelMenu()).toHaveAttribute('aria-haspopup', 'dialog')
      expect(botonDelMenu()).toHaveAttribute('aria-expanded', 'false')
    })

    it('con el menú abierto dice que está expandido', () => {
      renderHeader({ menuAbierto: true })

      expect(botonDelMenu()).toHaveAttribute('aria-expanded', 'true')
    })

    it('el encabezado queda inerte mientras el menú está abierto, y no cuando está cerrado', () => {
      const { unmount } = renderHeader({ inerte: true })
      expect(screen.getByRole('banner')).toHaveAttribute('inert')
      unmount()

      renderHeader({ inerte: false })
      expect(screen.getByRole('banner')).not.toHaveAttribute('inert')
    })

    it('por defecto el menú está cerrado y el encabezado no es inerte', () => {
      renderHeader()

      expect(botonDelMenu()).toHaveAttribute('aria-expanded', 'false')
      expect(screen.getByRole('banner')).not.toHaveAttribute('inert')
    })
  })

  describe('el botón "Mozo" (accesibilidad)', () => {
    const anunciado = () => useAnunciadorStore.getState().mensaje
    const botonDelMozo = (nombre: string | RegExp = /Mozo/) => screen.getByRole('button', { name: nombre })

    beforeEach(() => {
      useAnunciadorStore.setState({ mensaje: '', numero: 0 })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('al llamar anuncia "Avisamos al mozo"', async () => {
      renderHeader()

      fireEvent.click(botonDelMozo())

      await screen.findByRole('button', { name: '¡En camino!' })
      expect(anunciado()).toBe('Avisamos al mozo')
    })

    it('si falla, anuncia el error', async () => {
      vi.mocked(api.waiterCalls.llamar).mockRejectedValue(new Error('sin conexión'))
      renderHeader()

      fireEvent.click(botonDelMozo())

      await screen.findByRole('button', { name: 'Error' })
      expect(anunciado()).toBe('No pudimos avisar al mozo. Probá de nuevo.')
    })

    it('no se deshabilita (`disabled`): se marca aria-disabled mientras no se puede volver a llamar', async () => {
      renderHeader()

      fireEvent.click(botonDelMozo())

      const enCamino = await screen.findByRole('button', { name: '¡En camino!' })
      expect(enCamino).not.toBeDisabled()
      expect(enCamino).toHaveAttribute('aria-disabled', 'true')
    })

    it('quien lo tocó no pierde el foco', async () => {
      const usuario = userEvent.setup()
      renderHeader()

      await usuario.click(botonDelMozo())

      expect(await screen.findByRole('button', { name: '¡En camino!' })).toHaveFocus()
    })

    it('un toque de más, con el pedido ya hecho, no vuelve a llamar ni a anunciar', async () => {
      renderHeader()
      fireEvent.click(botonDelMozo())
      const enCamino = await screen.findByRole('button', { name: '¡En camino!' })
      const anuncios = useAnunciadorStore.getState().numero

      fireEvent.click(enCamino)

      expect(api.waiterCalls.llamar).toHaveBeenCalledTimes(1)
      expect(useAnunciadorStore.getState().numero).toBe(anuncios)
    })

    it('a los 3 segundos vuelve a "Mozo" y se puede llamar de nuevo', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      renderHeader()
      fireEvent.click(botonDelMozo())
      await screen.findByRole('button', { name: '¡En camino!' })

      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })

      expect(botonDelMozo(/Mozo/)).toHaveAttribute('aria-disabled', 'false')
      fireEvent.click(botonDelMozo())
      await screen.findByRole('button', { name: '¡En camino!' })
      expect(api.waiterCalls.llamar).toHaveBeenCalledTimes(2)
    })

    it('el emoji de la campana es decorativo: el nombre es solo "Mozo"', () => {
      renderHeader()

      const boton = screen.getByRole('button', { name: 'Mozo' })
      expect(boton.querySelector('[aria-hidden="true"]')).toHaveTextContent('🔔')
    })

    it('no tiene violaciones de accesibilidad (axe)', async () => {
      const { container } = renderHeader()

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
