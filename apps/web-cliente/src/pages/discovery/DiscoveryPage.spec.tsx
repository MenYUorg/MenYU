import type { DiscoveryBusquedaResponse, DiscoveryResponse } from '@menyu/types'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../services/api'
import { reiniciarDiscoveryStore } from '../../store/discoveryStore'
import { useSessionStore } from '../../store/sessionStore'
import { crearOferta, crearRestaurante, crearSesionAbierta } from '../../test/fixtures'
import { DiscoveryPage } from './DiscoveryPage'

vi.mock('../../services/api', () => ({
  api: {
    discovery: { listar: vi.fn(), buscar: vi.fn() },
    sessions: { open: vi.fn() },
  },
}))

// El escáner real usa la cámara y se prueba aparte: acá importa lo que la pantalla hace con lo que entrega.
vi.mock('../../components/QrScanner', () => ({
  QrScanner: ({ onDetected, onCancel, alternativa }: {
    onDetected: (raw: string) => void
    onCancel: () => void
    alternativa: { texto: string; ayuda?: string; onElegir: () => void }
  }) => (
    <div role="dialog" aria-label="Escáner de prueba">
      <button onClick={() => onDetected('https://menyu.app/check-in?restaurantId=rest-1&tableCode=qr-9')}>Leer QR de prueba</button>
      <button onClick={onCancel}>Cerrar escáner</button>
      <button onClick={alternativa.onElegir}>{alternativa.texto}</button>
      {alternativa.ayuda && <p>{alternativa.ayuda}</p>}
    </div>
  ),
}))

const listar = vi.mocked(api.discovery.listar)
const buscarEnApi = vi.mocked(api.discovery.buscar)
const abrirSesion = vi.mocked(api.sessions.open)

const LISTADO: DiscoveryResponse = {
  restaurantes: [
    crearRestaurante({ id: 'parrilla', nombre: 'La Parrilla del Puerto', cantidadOfertas: 2 }),
    crearRestaurante({ id: 'vito', nombre: 'Pizzería Don Vito', direccion: null, cantidadOfertas: 1 }),
  ],
  ofertas: [
    crearOferta({ id: 'o1', nombre: 'Pizza muzzarella grande', restaurante: { id: 'vito', nombre: 'Pizzería Don Vito' } }),
    crearOferta({ id: 'o2', nombre: 'Milanesa napolitana', restaurante: { id: 'parrilla', nombre: 'La Parrilla del Puerto' } }),
  ],
}

const SIN_RESULTADOS: DiscoveryBusquedaResponse = { ofertas: [], restaurantes: [], restaurantesConPlatos: [] }

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<DiscoveryPage />} />
        <Route path="/restaurante/:id" element={<p>pantalla del restaurante</p>} />
        <Route path="/menu" element={<p>pantalla del menú</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Deja que corran los timers y las promesas pendientes. */
const esperar = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

const buscador = () => screen.getByRole('textbox', { name: 'Buscar restaurantes o platos' })
const escribir = (texto: string) => fireEvent.change(buscador(), { target: { value: texto } })
const titulosDeSeccion = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

describe('DiscoveryPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    reiniciarDiscoveryStore()
    listar.mockReset().mockResolvedValue(LISTADO)
    buscarEnApi.mockReset().mockResolvedValue(SIN_RESULTADOS)
    abrirSesion.mockReset()
    sessionStorage.clear()
    localStorage.clear()
    useSessionStore.getState().clear()
    useSessionStore.setState({ loading: false, error: null })
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => vi.useRealTimers())

  describe('la home', () => {
    it('al abrirse pide el listado y muestra el título y el buscador', async () => {
      renderPagina()
      await esperar()

      expect(listar).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('heading', { level: 1, name: 'Descubrí dónde comer' })).toBeInTheDocument()
      expect(buscador()).toBeInTheDocument()
    })

    it('mientras llega el listado muestra esqueletos y no una pantalla vacía', async () => {
      listar.mockReturnValue(new Promise(() => {}))

      renderPagina()
      await esperar()

      expect(screen.getByLabelText('Cargando restaurantes y ofertas')).toHaveAttribute('aria-busy', 'true')
      expect(screen.queryByText('Todavía no hay restaurantes')).not.toBeInTheDocument()
    })

    it('muestra primero las ofertas y después los restaurantes', async () => {
      renderPagina()
      await esperar()

      expect(titulosDeSeccion().slice(0, 2)).toEqual(['Ofertas', 'Restaurantes'])
      expect(screen.getByText('Pizza muzzarella grande')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 3, name: 'La Parrilla del Puerto' })).toBeInTheDocument()
      expect(screen.getByText('Dirección no cargada')).toBeInTheDocument()
    })

    it('sin ofertas la sección desaparece (no queda un bloque vacío)', async () => {
      listar.mockResolvedValue({ ...LISTADO, ofertas: [] })

      renderPagina()
      await esperar()

      expect(screen.queryByRole('heading', { name: 'Ofertas' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Restaurantes' })).toBeInTheDocument()
    })

    it('sin restaurantes lo dice', async () => {
      listar.mockResolvedValue({ restaurantes: [], ofertas: [] })

      renderPagina()
      await esperar()

      expect(screen.getByText('Todavía no hay restaurantes')).toBeInTheDocument()
    })

    it('si falla la carga avisa y "Reintentar" vuelve a pedir', async () => {
      listar.mockRejectedValueOnce(new Error('sin conexión'))

      renderPagina()
      await esperar()
      expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los restaurantes')
      expect(buscador()).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      await esperar()

      expect(listar).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 3, name: 'Pizzería Don Vito' })).toBeInTheDocument()
    })

    it('tocar un restaurante abre su pantalla', async () => {
      renderPagina()
      await esperar()

      // (la oferta de la parrilla también nombra al restaurante: se toca la tarjeta del restaurante)
      fireEvent.click(screen.getByRole('heading', { level: 3, name: 'La Parrilla del Puerto' }).closest('a') as HTMLElement)

      expect(screen.getByText('pantalla del restaurante')).toBeInTheDocument()
    })

    it('tocar una oferta abre la pantalla de su restaurante', async () => {
      renderPagina()
      await esperar()

      expect(screen.getByRole('link', { name: /Pizza muzzarella grande/ })).toHaveAttribute('href', '/restaurante/vito')
    })

    it('tiene el header con Ingresar y Registrarme', async () => {
      renderPagina()
      await esperar()

      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Registrarme' })).toBeInTheDocument()
    })
  })

  describe('buscador', () => {
    beforeEach(() => {
      renderPagina()
    })

    it('con una sola letra avisa que hacen falta dos y no busca', async () => {
      await esperar()

      escribir('c')
      await esperar(1000)

      expect(screen.getByText('Escribí al menos 2 letras para buscar.')).toBeInTheDocument()
      expect(buscarEnApi).not.toHaveBeenCalled()
      expect(titulosDeSeccion()[0]).toBe('Ofertas')
    })

    it('espera un instante a que termines de escribir y busca una sola vez', async () => {
      await esperar()

      escribir('ca')
      await esperar(200)
      escribir('caf')
      await esperar(200)
      escribir('cafe')
      expect(buscarEnApi).not.toHaveBeenCalled()
      await esperar(300)

      expect(buscarEnApi).toHaveBeenCalledTimes(1)
      expect(buscarEnApi).toHaveBeenCalledWith('cafe')
    })

    it('Enter busca enseguida', async () => {
      await esperar()
      escribir('cafe')

      fireEvent.submit(buscador().closest('form') as HTMLFormElement)
      await esperar()

      expect(buscarEnApi).toHaveBeenCalledWith('cafe')
    })

    it('muestra los tres grupos en orden: ofertas, restaurantes y restaurantes con platos', async () => {
      buscarEnApi.mockResolvedValue({
        ofertas: [crearOferta({ id: 'o9', nombre: 'Café + medialuna' })],
        restaurantes: [crearRestaurante({ id: 'almendra', nombre: 'Café Almendra' })],
        restaurantesConPlatos: [crearRestaurante({ id: 'verde', nombre: 'Verde Vivo' })],
      })
      await esperar()

      escribir('cafe')
      await esperar(300)

      expect(titulosDeSeccion()).toEqual(['Ofertas', 'Restaurantes', 'Con platos que coinciden'])
      expect(screen.getByText(/Resultados para/)).toHaveTextContent('Resultados para “cafe”')
      // los restaurantes con platos son restaurantes comunes: sin decir qué platos coincidieron
      const conPlatos = screen.getByRole('heading', { name: 'Con platos que coinciden' }).closest('section') as HTMLElement
      expect(within(conPlatos).getByRole('heading', { level: 3, name: 'Verde Vivo' })).toBeInTheDocument()
      expect(within(conPlatos).getByRole('link').textContent).not.toMatch(/plato/i)
    })

    it('un grupo sin resultados no se muestra', async () => {
      buscarEnApi.mockResolvedValue({ ofertas: [], restaurantes: [crearRestaurante({ id: 'a', nombre: 'Café Almendra' })], restaurantesConPlatos: [] })
      await esperar()

      escribir('cafe')
      await esperar(300)

      expect(titulosDeSeccion()).toEqual(['Restaurantes'])
    })

    it('mientras llega la respuesta muestra "Buscando…" y atenúa los resultados anteriores en vez de vaciar la pantalla', async () => {
      buscarEnApi.mockResolvedValueOnce({ ofertas: [], restaurantes: [crearRestaurante({ id: 'a', nombre: 'Café Almendra' })], restaurantesConPlatos: [] })
      await esperar()
      escribir('cafe')
      await esperar(300)
      buscarEnApi.mockReturnValueOnce(new Promise(() => {}))

      escribir('cafeteria')
      await esperar(300)

      expect(screen.getByText('Buscando…')).toBeInTheDocument()
      expect(screen.getByTestId('resultados-atenuados')).toHaveTextContent('Café Almendra')
      // atenuados y sin poder tocarse mientras llegan los nuevos
      expect(screen.getByTestId('resultados-atenuados')).toHaveStyle({ opacity: '0.45', pointerEvents: 'none' })
    })

    it('la primera búsqueda muestra solo "Buscando…" hasta que llega', async () => {
      buscarEnApi.mockReturnValue(new Promise(() => {}))
      await esperar()

      escribir('cafe')
      await esperar(300)

      expect(screen.getByText('Buscando…')).toBeInTheDocument()
      expect(screen.queryByText('Todavía no hay restaurantes')).not.toBeInTheDocument()
      expect(screen.queryByText(/No encontramos nada/)).not.toBeInTheDocument()
    })

    it('sin resultados lo dice con la palabra buscada y "Borrar búsqueda" vuelve a la home', async () => {
      await esperar()

      escribir('xyz')
      await esperar(300)
      expect(screen.getByText('No encontramos nada para “xyz”')).toBeInTheDocument()

      // hay dos "Borrar búsqueda": la cruz del buscador y el botón de este bloque (el último)
      const borrar = screen.getAllByRole('button', { name: 'Borrar búsqueda' })
      fireEvent.click(borrar[borrar.length - 1] as HTMLElement)
      await esperar()

      expect(buscador()).toHaveValue('')
      expect(titulosDeSeccion()[0]).toBe('Ofertas')
    })

    it('la cruz del buscador borra el texto y vuelve a la home', async () => {
      await esperar()
      escribir('cafe')
      await esperar(300)

      fireEvent.click(screen.getAllByRole('button', { name: 'Borrar búsqueda' })[0] as HTMLElement)
      await esperar()

      expect(buscador()).toHaveValue('')
      expect(screen.queryByText(/No encontramos nada/)).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 3, name: 'La Parrilla del Puerto' })).toBeInTheDocument()
    })

    it('la cruz solo aparece cuando hay texto', async () => {
      await esperar()
      expect(screen.queryByRole('button', { name: 'Borrar búsqueda' })).not.toBeInTheDocument()

      escribir('c')

      expect(screen.getByRole('button', { name: 'Borrar búsqueda' })).toBeInTheDocument()
    })

    it('si falla la búsqueda avisa y "Reintentar" busca de nuevo', async () => {
      buscarEnApi.mockRejectedValueOnce(new Error('sin conexión'))
      await esperar()

      escribir('cafe')
      await esperar(300)
      expect(screen.getByRole('alert')).toHaveTextContent('No pudimos buscar')

      buscarEnApi.mockResolvedValueOnce({ ofertas: [], restaurantes: [crearRestaurante({ id: 'a', nombre: 'Café Almendra' })], restaurantesConPlatos: [] })
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      await esperar()

      expect(buscarEnApi).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('heading', { level: 3, name: 'Café Almendra' })).toBeInTheDocument()
    })

    it('borrar el texto hasta una letra vuelve a la home sin esperar', async () => {
      buscarEnApi.mockResolvedValue({ ofertas: [], restaurantes: [crearRestaurante({ id: 'a', nombre: 'Café Almendra' })], restaurantesConPlatos: [] })
      await esperar()
      escribir('cafe')
      await esperar(300)

      escribir('c')

      expect(titulosDeSeccion()[0]).toBe('Ofertas')
    })
  })

  describe('"Escanear el QR de mi mesa"', () => {
    beforeEach(() => {
      renderPagina()
    })

    const escanear = () => fireEvent.click(screen.getByRole('button', { name: 'Escanear el QR de mi mesa' }))

    it('está debajo del buscador y abre el escáner', async () => {
      await esperar()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      escanear()

      expect(screen.getByRole('dialog', { name: 'Escáner de prueba' })).toBeInTheDocument()
    })

    it('"Cancelar" cierra el escáner', async () => {
      await esperar()
      escanear()

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar escáner' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('al leer el QR abre la sesión con el código de la mesa y va al menú', async () => {
      abrirSesion.mockResolvedValue(crearSesionAbierta())
      await esperar()
      escanear()

      fireEvent.click(screen.getByRole('button', { name: 'Leer QR de prueba' }))
      await esperar()

      expect(abrirSesion).toHaveBeenCalledWith({ qrToken: 'qr-9' })
      expect(screen.getByText('pantalla del menú')).toBeInTheDocument()
    })

    it('mientras abre la mesa lo dice y no se puede volver a tocar', async () => {
      abrirSesion.mockReturnValue(new Promise(() => {}))
      await esperar()
      escanear()

      fireEvent.click(screen.getByRole('button', { name: 'Leer QR de prueba' }))
      await esperar()

      const boton = screen.getByRole('button', { name: 'Abriendo tu mesa…' })
      expect(boton).toBeDisabled()
    })

    it('si el QR no abre una mesa avisa y el aviso se va al volver a escanear', async () => {
      abrirSesion.mockRejectedValue(new Error('Mesa no encontrada'))
      await esperar()
      escanear()
      fireEvent.click(screen.getByRole('button', { name: 'Leer QR de prueba' }))
      await esperar()

      expect(screen.getByRole('alert')).toHaveTextContent('No pudimos abrir tu mesa con ese QR')

      escanear()

      expect(screen.queryByText(/No pudimos abrir tu mesa con ese QR/)).not.toBeInTheDocument()
    })

    it('una mesa en modo seguro muestra primero la pantalla del anfitrión', async () => {
      abrirSesion.mockResolvedValue(crearSesionAbierta({ esAnfitrion: true, modoSesion: 'seguro', codigoSesion: '731' }))
      await esperar()
      escanear()

      fireEvent.click(screen.getByRole('button', { name: 'Leer QR de prueba' }))
      await esperar()

      expect(screen.getByText('¡Sos el anfitrión de la mesa!')).toBeInTheDocument()
      expect(screen.getByText('731')).toBeInTheDocument()
    })

    it('si la cámara falla, la salida es "Elegir mi restaurante": cierra el escáner, vuelve a la lista y sube a ella', async () => {
      await esperar()
      escribir('cafe')
      await esperar(300)
      escanear()
      expect(screen.getByText('Elegí tu restaurante en la lista e ingresá con el PIN de tu mesa.')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Elegir mi restaurante' }))
      await esperar()

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(buscador()).toHaveValue('')
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
      const lista = screen.getByRole('heading', { name: 'Restaurantes' }).closest('section')
      expect(lista).toHaveAttribute('id', 'restaurantes')
    })
  })
})
