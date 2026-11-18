import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AperturaDeTurno, CajaDelRestaurante, PreparacionDeTurno, TurnoDeCaja } from '@menyu/types'
import { api, ApiError } from '../../services/api'
import { useCajasStore } from '../../store/cajasStore'
import { perfilDeJefeSalon, reiniciarSesionDePrueba } from '../../test/authClient'
import { montarContexto, reiniciarContexto } from '../../test/contexto'
import { CajaPage } from './CajaPage'

vi.mock('@menyu/auth-client', async () => (await import('../../test/authClient')).moduloSimulado())
vi.mock('@menyu/ui', () => ({ LogoMenYuOscuro: () => <span>MenYU</span> }))

vi.mock('../../services/api', async () => {
  const { ApiError } = await vi.importActual<typeof import('../../services/api')>('../../services/api')
  return {
    ApiError,
    api: {
      cajas: { todas: vi.fn(), abiertas: vi.fn() },
      turnos: { actual: vi.fn(), preparacion: vi.fn(), abrir: vi.fn(), reasignar: vi.fn() },
    },
  }
})

const cajasApi = vi.mocked(api.cajas)
const turnosApi = vi.mocked(api.turnos)

const caja = (id: string, nombre: string, activa = true): CajaDelRestaurante => ({
  id, restauranteId: 'rest-1', nombre, activa, createdAt: '2026-11-01T10:00:00.000Z',
})

const CAJAS = [caja('c-barra', 'Barra'), caja('c-principal', 'Principal'), caja('c-terraza', 'Terraza'), caja('c-vieja', 'Vieja', false)]

const PREPARACION: PreparacionDeTurno = {
  mozos: [{ id: 'ana', nombre: 'Ana' }, { id: 'beto', nombre: 'Beto' }],
  // Como la manda la API: ordenadas como texto.
  mesas: [{ id: 'm1', numero: '1' }, { id: 'm10', numero: '10' }, { id: 'm2', numero: '2' }],
  precarga: {
    asignaciones: [{ mesaId: 'm2', mozoId: 'beto' }],
    avisos: [{ mesaId: 'm10', mesaNumero: '10', motivo: 'varios-mozos' }],
  },
}

const TURNO: TurnoDeCaja = {
  id: 'turno-1',
  restauranteId: 'rest-1',
  abiertoEn: new Date(2026, 10, 18, 9, 5).toISOString(),
  abiertoPor: { id: 'u-1', nombre: 'Julia Gómez' },
  cerradoEn: null,
  observaciones: null,
  cajas: [{ id: 'tc-1', cajaId: 'c-barra', nombre: 'Barra', fondoInicial: 0, abiertoEn: new Date(2026, 10, 18, 9, 5).toISOString() }],
  asignaciones: [],
}

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/mozo/caja']}>
      <Routes>
        <Route path="/mozo/caja" element={<CajaPage />} />
        <Route path="/mozo" element={<p>panel del mozo</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Abre la pantalla sin turno y espera el formulario. */
async function abrirFormulario() {
  abrir()
  await screen.findByRole('button', { name: 'Abrir turno' })
}

const casilla = (nombre: string) => screen.getByRole('checkbox', { name: nombre })
const fondo = (nombre: string) => screen.getByLabelText(`Fondo inicial de ${nombre}`)
const mozoDeLaMesa = (numero: string) => screen.getByRole('combobox', { name: `Mozo de la mesa ${numero}` }) as HTMLSelectElement
const botonAbrir = () => screen.getByRole('button', { name: /Abrir turno|Abriendo…/ })
const enviado = () => turnosApi.abrir.mock.calls[0]?.[0]

function marcarConFondo(nombre: string, texto: string) {
  fireEvent.click(casilla(nombre))
  fireEvent.change(fondo(nombre), { target: { value: texto } })
}

/** Una promesa que el test resuelve o rechaza cuando quiere. */
function pendiente<T>() {
  let resolver!: (valor: T) => void
  let rechazar!: (error: unknown) => void
  const promesa = new Promise<T>((res, rej) => { resolver = res; rechazar = rej })
  return { promesa, resolver, rechazar }
}

beforeEach(() => {
  vi.clearAllMocks()
  reiniciarSesionDePrueba()
  reiniciarContexto()
  montarContexto(perfilDeJefeSalon())
  useCajasStore.setState({ restauranteId: null, cajas: null })
  turnosApi.actual.mockResolvedValue({ turno: null })
  cajasApi.todas.mockResolvedValue(CAJAS)
  cajasApi.abiertas.mockResolvedValue({ cajas: [{ cajaId: 'c-barra', nombre: 'Barra' }] })
  turnosApi.preparacion.mockResolvedValue(PREPARACION)
  turnosApi.abrir.mockResolvedValue({ turno: TURNO, avisos: [] })
})

describe('CajaPage', () => {
  describe('el encabezado', () => {
    it('muestra la caja con quién está y vuelve al panel', async () => {
      abrir()

      expect(screen.getByText('Caja')).toBeInTheDocument()
      expect(screen.getByText('PANEL › CAJA')).toBeInTheDocument()
      expect(screen.getByText('Jefe de Salón de Prueba')).toBeInTheDocument()
      expect(screen.getByText('Jefe de salón')).toBeInTheDocument()
      await screen.findByRole('button', { name: 'Abrir turno' })

      fireEvent.click(screen.getAllByRole('button')[0])

      expect(screen.getByText('panel del mozo')).toBeInTheDocument()
    })

    it('sin nombre en el perfil usa el email', async () => {
      montarContexto({ ...perfilDeJefeSalon(), nombre: '' })
      abrir()

      expect(screen.getByText('jefe-salon@menyu.com')).toBeInTheDocument()
      await screen.findByRole('button', { name: 'Abrir turno' })
    })
  })

  describe('el turno actual', () => {
    it('mientras lee el turno muestra que está cargando, y lo pide por el restaurante elegido', async () => {
      abrir()

      expect(screen.getByRole('status')).toHaveTextContent('Cargando el turno…')
      expect(turnosApi.actual).toHaveBeenCalledWith('rest-1')
      await screen.findByRole('button', { name: 'Abrir turno' })
    })

    it('sin restaurante elegido no pide nada', () => {
      reiniciarContexto()
      abrir()

      expect(screen.getByRole('status')).toHaveTextContent('Cargando el turno…')
      expect(turnosApi.actual).not.toHaveBeenCalled()
    })

    it('con un turno abierto lo muestra y no pide las cajas ni la preparación', async () => {
      turnosApi.actual.mockResolvedValue({ turno: TURNO })
      abrir()

      expect(await screen.findByText('Turno abierto')).toBeInTheDocument()
      expect(screen.getByText('Desde 18/11 09:05 · abrió Julia Gómez')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Abrir turno' })).not.toBeInTheDocument()
      expect(cajasApi.todas).not.toHaveBeenCalled()
      expect(turnosApi.preparacion).not.toHaveBeenCalled()
    })

    it('si falla muestra el error y "Reintentar" lo vuelve a leer', async () => {
      turnosApi.actual.mockRejectedValueOnce(new ApiError('Sin conexión con el servidor', 500))
      abrir()

      const alerta = await screen.findByRole('alert')
      expect(alerta).toHaveTextContent('Sin conexión con el servidor')

      fireEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }))

      expect(await screen.findByRole('button', { name: 'Abrir turno' })).toBeInTheDocument()
      expect(turnosApi.actual).toHaveBeenCalledTimes(2)
    })

    it('un error sin mensaje muestra uno genérico', async () => {
      turnosApi.actual.mockRejectedValueOnce('se cortó')
      abrir()

      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo leer el turno')
    })

    it('"Actualizar" vuelve a leer el turno: si se abrió en otro lado, lo muestra', async () => {
      await abrirFormulario()
      turnosApi.actual.mockResolvedValue({ turno: TURNO })

      fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))

      expect(await screen.findByText('Turno abierto')).toBeInTheDocument()
      expect(turnosApi.actual).toHaveBeenCalledTimes(2)
    })

    it('una lectura vieja que llega tarde no pisa a la más nueva', async () => {
      const vieja = pendiente<{ turno: TurnoDeCaja | null }>()
      turnosApi.actual.mockReturnValueOnce(vieja.promesa).mockResolvedValueOnce({ turno: TURNO })
      abrir()

      fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
      expect(await screen.findByText('Turno abierto')).toBeInTheDocument()

      await act(async () => { vieja.resolver({ turno: null }) })

      expect(screen.getByText('Turno abierto')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Abrir turno' })).not.toBeInTheDocument()
    })

    it('un error viejo que llega tarde tampoco la pisa', async () => {
      const vieja = pendiente<{ turno: TurnoDeCaja | null }>()
      turnosApi.actual.mockReturnValueOnce(vieja.promesa).mockResolvedValueOnce({ turno: TURNO })
      abrir()

      fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
      expect(await screen.findByText('Turno abierto')).toBeInTheDocument()

      await act(async () => { vieja.rechazar(new Error('tarde')) })

      expect(screen.getByText('Turno abierto')).toBeInTheDocument()
      expect(screen.queryByText('tarde')).not.toBeInTheDocument()
    })
  })

  describe('sin turno: el formulario de apertura', () => {
    it('pide las cajas y la preparación del restaurante', async () => {
      await abrirFormulario()

      expect(cajasApi.todas).toHaveBeenCalledWith('rest-1')
      expect(turnosApi.preparacion).toHaveBeenCalledWith('rest-1')
    })

    it('mientras las lee muestra que está cargando', async () => {
      const cajas = pendiente<CajaDelRestaurante[]>()
      cajasApi.todas.mockReturnValueOnce(cajas.promesa)
      abrir()

      expect(await screen.findByText('Cargando las cajas y las mesas…')).toBeInTheDocument()

      await act(async () => { cajas.resolver(CAJAS) })
      expect(screen.getByRole('button', { name: 'Abrir turno' })).toBeInTheDocument()
    })

    it.each([
      ['las cajas', () => cajasApi.todas.mockRejectedValueOnce(new Error('No se pudieron leer las cajas'))],
      ['la preparación', () => turnosApi.preparacion.mockRejectedValueOnce(new Error('No se pudieron leer las cajas'))],
    ])('si falla la lectura de %s, no se puede abrir y "Reintentar" las vuelve a pedir', async (_que, fallar) => {
      fallar()
      abrir()

      const alerta = await screen.findByRole('alert')
      expect(alerta).toHaveTextContent('No se pudieron leer las cajas')
      expect(screen.queryByRole('button', { name: 'Abrir turno' })).not.toBeInTheDocument()

      fireEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }))

      expect(await screen.findByRole('button', { name: 'Abrir turno' })).toBeInTheDocument()
      expect(cajasApi.todas).toHaveBeenCalledTimes(2)
      expect(turnosApi.preparacion).toHaveBeenCalledTimes(2)
    })

    it('un error de lectura sin mensaje muestra uno genérico', async () => {
      cajasApi.todas.mockRejectedValueOnce(undefined)
      abrir()

      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las cajas y las mesas')
    })

    describe('las cajas', () => {
      it('muestra solo las activas, en un grupo con su leyenda', async () => {
        await abrirFormulario()

        const grupo = screen.getByRole('group', { name: 'Cajas del turno (hasta 2)' })
        expect(within(grupo).getAllByRole('checkbox').map((c) => c.closest('label')?.textContent))
          .toEqual(['Barra', 'Principal', 'Terraza'])
        expect(screen.queryByText('Vieja')).not.toBeInTheDocument()
      })

      it('al marcar una aparece su fondo inicial, con su label y teclado decimal; al desmarcarla se va', async () => {
        await abrirFormulario()
        expect(screen.queryByLabelText('Fondo inicial de Barra')).not.toBeInTheDocument()

        fireEvent.click(casilla('Barra'))

        expect(fondo('Barra')).toHaveAttribute('inputMode', 'decimal')
        fireEvent.click(casilla('Barra'))
        expect(screen.queryByLabelText('Fondo inicial de Barra')).not.toBeInTheDocument()
      })

      it('con dos marcadas, las demás se deshabilitan; al desmarcar una se habilitan', async () => {
        await abrirFormulario()

        fireEvent.click(casilla('Barra'))
        expect(casilla('Terraza')).toBeEnabled()
        fireEvent.click(casilla('Principal'))

        expect(casilla('Terraza')).toBeDisabled()
        expect(casilla('Barra')).toBeEnabled()
        expect(casilla('Principal')).toBeEnabled()

        fireEvent.click(casilla('Barra'))
        expect(casilla('Terraza')).toBeEnabled()
      })

      it('sin cajas activas lo explica y no deja abrir', async () => {
        cajasApi.todas.mockResolvedValue([caja('c-vieja', 'Vieja', false)])
        abrir()

        expect(await screen.findByText(
          'Todavía no hay cajas activas en este restaurante. Se crean desde el panel de administración.',
        )).toBeInTheDocument()
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
        expect(botonAbrir()).toBeDisabled()
      })

      it('sin ninguna caja marcada no abre y pide elegir una', async () => {
        await abrirFormulario()

        fireEvent.click(botonAbrir())

        expect(await screen.findByRole('alert')).toHaveTextContent('Elegí al menos una caja')
        expect(turnosApi.abrir).not.toHaveBeenCalled()
      })

      it('el fondo vacío es un error recién al intentar abrir, asociado al campo', async () => {
        await abrirFormulario()
        fireEvent.click(casilla('Barra'))
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(fondo('Barra')).toHaveAttribute('aria-invalid', 'false')

        fireEvent.click(botonAbrir())

        const error = await screen.findByRole('alert')
        expect(error).toHaveTextContent('Ingresá el fondo inicial (0 si no hay)')
        expect(fondo('Barra')).toHaveAttribute('aria-describedby', error.id)
        expect(fondo('Barra')).toHaveAttribute('aria-invalid', 'true')
        expect(turnosApi.abrir).not.toHaveBeenCalled()
      })

      it('un fondo mal escrito avisa enseguida y no deja abrir', async () => {
        await abrirFormulario()

        marcarConFondo('Barra', '1.000,50')

        expect(screen.getByRole('alert')).toHaveTextContent(
          'Escribí el fondo inicial solo con números, con coma o punto para los decimales',
        )
        expect(fondo('Barra')).toHaveAccessibleDescription(
          'Escribí el fondo inicial solo con números, con coma o punto para los decimales',
        )

        fireEvent.click(botonAbrir())
        expect(turnosApi.abrir).not.toHaveBeenCalled()

        fireEvent.change(fondo('Barra'), { target: { value: '1000,50' } })
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      })
    })

    describe('las mesas por mozo', () => {
      it('una fila por mesa en orden natural, arrancando desde la precarga, con su ayuda', async () => {
        await abrirFormulario()

        expect(screen.getAllByRole('combobox').map((s) => s.getAttribute('aria-label')))
          .toEqual(['Mozo de la mesa 1', 'Mozo de la mesa 2', 'Mozo de la mesa 10'])
        expect(mozoDeLaMesa('1').value).toBe('')
        expect(mozoDeLaMesa('2').value).toBe('beto')
        expect(mozoDeLaMesa('10').value).toBe('')
        expect(within(mozoDeLaMesa('1')).getAllByRole('option').map((o) => o.textContent))
          .toEqual(['Sin asignar', 'Ana', 'Beto'])
        expect(screen.getByText('Con el turno abierto, cada mozo ve sus mesas y las que no tienen mozo asignado.'))
          .toBeInTheDocument()
      })

      it('muestra los avisos de la precarga', async () => {
        await abrirFormulario()

        expect(within(screen.getByRole('list', { name: 'Avisos de la precarga' })).getByRole('listitem'))
          .toHaveTextContent('Mesa 10: tiene varios mozos en su plantilla; elegí uno.')
      })

      it('sin avisos no muestra la lista; sin mesas, lo dice', async () => {
        turnosApi.preparacion.mockResolvedValue({ ...PREPARACION, mesas: [], precarga: { asignaciones: [], avisos: [] } })
        await abrirFormulario()

        expect(screen.queryByRole('list', { name: 'Avisos de la precarga' })).not.toBeInTheDocument()
        expect(screen.getByText('No hay mesas activas en este restaurante.')).toBeInTheDocument()
      })
    })

    describe('abrir', () => {
      it('manda las cajas con su fondo (0 incluido) en el orden de la lista, las asignaciones que se ven y las observaciones', async () => {
        await abrirFormulario()
        marcarConFondo('Terraza', '2500,5')
        marcarConFondo('Barra', '0')
        fireEvent.change(mozoDeLaMesa('10'), { target: { value: 'ana' } })
        fireEvent.change(screen.getByLabelText('Observaciones (opcional)'), { target: { value: '  Turno noche  ' } })

        fireEvent.click(botonAbrir())

        await waitFor(() => expect(turnosApi.abrir).toHaveBeenCalledTimes(1))
        expect(enviado()).toEqual({
          restauranteId: 'rest-1',
          cajas: [{ cajaId: 'c-barra', fondoInicial: 0 }, { cajaId: 'c-terraza', fondoInicial: 2500.5 }],
          asignaciones: expect.arrayContaining([{ mesaId: 'm2', mozoId: 'beto' }, { mesaId: 'm10', mozoId: 'ana' }]),
          observaciones: 'Turno noche',
        })
        expect(enviado()?.asignaciones).toHaveLength(2)
      })

      it('sin ninguna mesa asignada manda la lista vacía, y sin observaciones no las manda', async () => {
        await abrirFormulario()
        marcarConFondo('Barra', '100')
        fireEvent.change(mozoDeLaMesa('2'), { target: { value: '' } })
        fireEvent.change(screen.getByLabelText('Observaciones (opcional)'), { target: { value: '   ' } })

        fireEvent.click(botonAbrir())

        await waitFor(() => expect(turnosApi.abrir).toHaveBeenCalledTimes(1))
        expect(enviado()).toEqual({ restauranteId: 'rest-1', cajas: [{ cajaId: 'c-barra', fondoInicial: 100 }], asignaciones: [] })
      })

      it('las observaciones admiten hasta 500 caracteres', async () => {
        await abrirFormulario()

        expect(screen.getByLabelText('Observaciones (opcional)')).toHaveAttribute('maxLength', '500')
      })

      it('mientras envía, el botón dice "Abriendo…" y queda deshabilitado', async () => {
        const apertura = pendiente<AperturaDeTurno>()
        turnosApi.abrir.mockReturnValueOnce(apertura.promesa)
        await abrirFormulario()
        marcarConFondo('Barra', '0')

        fireEvent.click(botonAbrir())

        expect(await screen.findByRole('button', { name: 'Abriendo…' })).toBeDisabled()
        expect(casilla('Barra')).toBeDisabled()
        expect(mozoDeLaMesa('1')).toBeDisabled()

        await act(async () => { apertura.resolver({ turno: TURNO, avisos: [] }) })
      })

      it('al abrir, muestra el turno de la respuesta y refresca las cajas abiertas para Pagos', async () => {
        await abrirFormulario()
        marcarConFondo('Barra', '0')

        fireEvent.click(botonAbrir())

        expect(await screen.findByText('Turno abierto')).toBeInTheDocument()
        expect(screen.getByText('Desde 18/11 09:05 · abrió Julia Gómez')).toBeInTheDocument()
        expect(cajasApi.abiertas).toHaveBeenCalledWith('rest-1')
        await waitFor(() => expect(useCajasStore.getState().cajas).toEqual([{ cajaId: 'c-barra', nombre: 'Barra' }]))
        // No vuelve a leer el turno: usa el de la respuesta.
        expect(turnosApi.actual).toHaveBeenCalledTimes(1)
      })

      it.each([
        ['Ya hay un turno abierto en este restaurante'],
        ['La caja ya está abierta'],
      ])('un 409 "%s" muestra el mensaje y vuelve a leer el turno', async (mensaje) => {
        turnosApi.abrir.mockRejectedValueOnce(new ApiError(mensaje, 409))
        await abrirFormulario()
        marcarConFondo('Barra', '0')
        turnosApi.actual.mockResolvedValue({ turno: TURNO })

        fireEvent.click(botonAbrir())

        expect(await screen.findByText('Turno abierto')).toBeInTheDocument()
        expect(screen.getByRole('alert')).toHaveTextContent(mensaje)
        expect(turnosApi.actual).toHaveBeenCalledTimes(2)
      })

      it('el aviso del 409 se va con "Actualizar"', async () => {
        turnosApi.abrir.mockRejectedValueOnce(new ApiError('Ya hay un turno abierto en este restaurante', 409))
        await abrirFormulario()
        marcarConFondo('Barra', '0')
        turnosApi.actual.mockResolvedValue({ turno: TURNO })
        fireEvent.click(botonAbrir())
        await screen.findByText('Turno abierto')

        fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))

        await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
      })

      it('el 409 de operación simultánea es un error común: no recarga y se puede reintentar', async () => {
        turnosApi.abrir.mockRejectedValueOnce(
          new ApiError('Otra operación modificó esto al mismo tiempo; probá de nuevo', 409),
        )
        await abrirFormulario()
        marcarConFondo('Barra', '0')

        fireEvent.click(botonAbrir())

        expect(await screen.findByRole('alert')).toHaveTextContent('Otra operación modificó esto al mismo tiempo; probá de nuevo')
        expect(turnosApi.actual).toHaveBeenCalledTimes(1)
        expect(botonAbrir()).toBeEnabled()

        fireEvent.click(botonAbrir())

        expect(await screen.findByText('Turno abierto')).toBeInTheDocument()
        expect(turnosApi.abrir).toHaveBeenCalledTimes(2)
      })

      it('un 400 muestra el texto del backend y no recarga', async () => {
        turnosApi.abrir.mockRejectedValueOnce(new ApiError('La caja «Barra» está dada de baja', 400))
        await abrirFormulario()
        marcarConFondo('Barra', '0')

        fireEvent.click(botonAbrir())

        expect(await screen.findByRole('alert')).toHaveTextContent('La caja «Barra» está dada de baja')
        expect(turnosApi.actual).toHaveBeenCalledTimes(1)
        expect(botonAbrir()).toHaveTextContent('Abrir turno')
      })

      it('un 409 con el mismo texto pero otro status no recarga', async () => {
        turnosApi.abrir.mockRejectedValueOnce(new ApiError('Ya hay un turno abierto en este restaurante', 400))
        await abrirFormulario()
        marcarConFondo('Barra', '0')

        fireEvent.click(botonAbrir())

        expect(await screen.findByRole('alert')).toHaveTextContent('Ya hay un turno abierto en este restaurante')
        expect(turnosApi.actual).toHaveBeenCalledTimes(1)
      })

      it('un error que no es de la API muestra uno genérico', async () => {
        turnosApi.abrir.mockRejectedValueOnce('se cortó')
        await abrirFormulario()
        marcarConFondo('Barra', '0')

        fireEvent.click(botonAbrir())

        expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo abrir el turno')
      })
    })
  })
})
