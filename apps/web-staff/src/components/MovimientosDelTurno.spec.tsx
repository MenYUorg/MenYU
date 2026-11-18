import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { MovimientoDeCaja, MovimientoRegistrado, TipoDeMovimiento, TurnoCajaApi, TurnoDeCaja, TurnoDetalle } from '@menyu/types'
import { api, ApiError } from '../services/api'
import { MovimientosDelTurno } from './MovimientosDelTurno'

vi.mock('../services/api', async () => {
  const { ApiError } = await vi.importActual<typeof import('../services/api')>('../services/api')
  return { ApiError, api: { turnos: { detalle: vi.fn(), registrarMovimiento: vi.fn() } } }
})

const turnosApi = vi.mocked(api.turnos)

const ABIERTO = new Date(2026, 10, 18, 9, 0).toISOString()
const BARRA: TurnoCajaApi = { id: 'tc-barra', cajaId: 'c-barra', nombre: 'Barra', fondoInicial: 0, abiertoEn: ABIERTO }
const TERRAZA: TurnoCajaApi = { id: 'tc-terraza', cajaId: 'c-terraza', nombre: 'Terraza', fondoInicial: 1000, abiertoEn: ABIERTO }

const turnoCon = (cajas: TurnoCajaApi[]): TurnoDeCaja => ({
  id: 'turno-1',
  restauranteId: 'rest-1',
  abiertoEn: ABIERTO,
  abiertoPor: { id: 'u-1', nombre: 'Julia Gómez' },
  cerradoEn: null,
  observaciones: null,
  cajas,
  asignaciones: [],
})

const movimiento = (id: string, caja: TurnoCajaApi, tipo: TipoDeMovimiento, monto: number, motivo: string, minuto: number, quien = 'Ana'): MovimientoDeCaja => ({
  id, cajaId: caja.cajaId, cajaNombre: caja.nombre, tipo, monto, motivo,
  usuario: { id: `u-${quien}`, nombre: quien },
  createdAt: new Date(2026, 10, 18, 10, minuto).toISOString(),
})

/** El detalle con los movimientos de cada caja, en el orden en que se pasan las cajas. */
const detalleCon = (...cajas: [TurnoCajaApi, MovimientoDeCaja[]][]): TurnoDetalle => ({
  id: 'turno-1',
  abiertoEn: ABIERTO,
  abiertoPor: { id: 'u-1', nombre: 'Julia Gómez' },
  cerradoEn: null,
  cerradoPor: null,
  observaciones: null,
  cajas: cajas.map(([c, movimientos]) => ({ id: c.id, cajaId: c.cajaId, nombre: c.nombre, fondoInicial: c.fondoInicial, arqueo: null, movimientos })),
  asignaciones: [],
})

const SIN_MOVIMIENTOS = detalleCon([BARRA, []], [TERRAZA, []])
const REGISTRADO: MovimientoRegistrado = { movimiento: movimiento('mov-n', TERRAZA, 'EGRESO', 1500.5, 'Compra de hielo', 30) }

function pendiente<T>() {
  let resolver!: (valor: T) => void
  let rechazar!: (error: unknown) => void
  const promesa = new Promise<T>((res, rej) => { resolver = res; rechazar = rej })
  return { promesa, resolver, rechazar }
}

const onTurnoCambio = vi.fn()

/** Monta la sección y espera a que termine la primera lectura. */
async function montar(cajas: TurnoCajaApi[] = [BARRA, TERRAZA]) {
  render(<MovimientosDelTurno turno={turnoCon(cajas)} onTurnoCambio={onTurnoCambio} />)
  expect(screen.getByText('Cargando los movimientos…')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByText('Cargando los movimientos…')).not.toBeInTheDocument())
}

const radio = (nombre: string) => screen.getByRole('radio', { name: nombre }) as HTMLInputElement
const monto = () => screen.getByLabelText('Monto') as HTMLInputElement
const motivo = () => screen.getByLabelText('Motivo') as HTMLInputElement
const registrar = () => fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }))
const filas = (caja: string) => within(screen.getByRole('list', { name: `Movimientos de ${caja}` })).getAllByRole('listitem').map((f) => f.textContent)
const textoDeConfirmacion = () => screen.getByText(/^Vas a registrar/)
/** "Confirmar", esperando dentro de act lo que haga la respuesta (que puede quedar pendiente). */
const confirmar = () => act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar' })) })

function completar({ caja, tipo = 'Egreso', importe = '1500,5', texto = '  Compra de hielo ' }: { caja?: string; tipo?: string; importe?: string; texto?: string } = {}) {
  if (caja) fireEvent.click(radio(caja))
  fireEvent.click(radio(tipo))
  fireEvent.change(monto(), { target: { value: importe } })
  fireEvent.change(motivo(), { target: { value: texto } })
}

/** Completa con la Terraza, pasa a la confirmación y confirma. */
async function confirmarEgresoEnTerraza() {
  completar({ caja: 'Terraza' })
  registrar()
  await confirmar()
}

beforeEach(() => {
  // reset y no clear: una respuesta `mockReturnValueOnce` que un test no usó no pasa al siguiente.
  vi.resetAllMocks()
  turnosApi.detalle.mockResolvedValue(SIN_MOVIMIENTOS)
  turnosApi.registrarMovimiento.mockResolvedValue(REGISTRADO)
})

describe('MovimientosDelTurno', () => {
  describe('la lista', () => {
    it('mientras lee muestra que está cargando, y pide el detalle del turno', async () => {
      render(<MovimientosDelTurno turno={turnoCon([BARRA])} onTurnoCambio={onTurnoCambio} />)

      expect(screen.getByRole('heading', { name: 'Movimientos de caja' })).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Cargando los movimientos…')
      expect(turnosApi.detalle).toHaveBeenCalledWith('turno-1')
      expect(await screen.findByText('Todavía no hay movimientos en este turno.')).toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('con una caja, sin subtítulo: cada fila con la hora, el tipo escrito, el monto, el motivo y quién lo cargó, en el orden de la API', async () => {
      turnosApi.detalle.mockResolvedValue(detalleCon([BARRA, [
        movimiento('m-1', BARRA, 'INGRESO', 5000, 'Cambio del banco', 5),
        movimiento('m-2', BARRA, 'EGRESO', 1200.5, 'Compra de hielo', 1, 'Beto'),
      ]]))
      await montar([BARRA])

      expect(filas('Barra')).toEqual([
        '18/11 10:05 · Ingreso · $5.000 · Cambio del banco · cargó Ana',
        '18/11 10:01 · Egreso · $1.200,50 · Compra de hielo · cargó Beto',
      ])
      expect(screen.queryByRole('heading', { name: 'Barra' })).not.toBeInTheDocument()
      // Arqueo ciego: ni saldos ni totales.
      expect(screen.queryByText(/saldo|total|esperado/i)).not.toBeInTheDocument()
    })

    it('con dos cajas, un grupo por caja con su nombre, en el orden de las cajas del turno', async () => {
      // El detalle las trae al revés: manda el orden del turno.
      turnosApi.detalle.mockResolvedValue(detalleCon(
        [TERRAZA, [movimiento('m-2', TERRAZA, 'INGRESO', 300, 'Propina en efectivo', 2)]],
        [BARRA, [movimiento('m-1', BARRA, 'EGRESO', 100, 'Hielo', 1)]],
      ))
      await montar()

      expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Barra', 'Terraza'])
      expect(filas('Barra')).toEqual(['18/11 10:01 · Egreso · $100 · Hielo · cargó Ana'])
      expect(filas('Terraza')).toEqual(['18/11 10:02 · Ingreso · $300 · Propina en efectivo · cargó Ana'])
    })

    it('con dos cajas, la que no tiene movimientos lo dice (también si el detalle no la trae)', async () => {
      turnosApi.detalle.mockResolvedValue(detalleCon([TERRAZA, [movimiento('m-2', TERRAZA, 'INGRESO', 300, 'Propina', 2)]]))
      await montar()

      expect(screen.getByRole('heading', { name: 'Barra' })).toBeInTheDocument()
      expect(screen.getByText('Sin movimientos en esta caja.')).toBeInTheDocument()
      expect(filas('Terraza')).toHaveLength(1)
    })

    it('sin movimientos en ninguna caja lo dice, sin subtítulos', async () => {
      await montar()

      expect(screen.getByText('Todavía no hay movimientos en este turno.')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
    })

    it('si falla muestra el error con "Reintentar", que muestra "Cargando…" y después la lista; el formulario sigue usable', async () => {
      turnosApi.detalle.mockRejectedValueOnce(new ApiError('Turno no encontrado', 404))
      await montar()

      const alerta = screen.getByRole('alert')
      expect(alerta).toHaveTextContent('Turno no encontrado')
      completar({ caja: 'Barra' })
      registrar()
      expect(textoDeConfirmacion()).toBeInTheDocument()

      fireEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }))

      expect(screen.getByText('Cargando los movimientos…')).toBeInTheDocument()
      expect(screen.queryByText('Turno no encontrado')).not.toBeInTheDocument()
      expect(await screen.findByText('Todavía no hay movimientos en este turno.')).toBeInTheDocument()
      expect(turnosApi.detalle).toHaveBeenCalledTimes(2)
    })

    it('al releer después de registrar, la lista anterior sigue a la vista y no aparece "Cargando…"', async () => {
      turnosApi.detalle.mockResolvedValueOnce(detalleCon([BARRA, [movimiento('m-1', BARRA, 'EGRESO', 100, 'Hielo', 1)]]))
      await montar()
      const relectura = pendiente<TurnoDetalle>()
      turnosApi.detalle.mockReturnValueOnce(relectura.promesa)

      await confirmarEgresoEnTerraza()

      expect(turnosApi.detalle).toHaveBeenCalledTimes(2)
      expect(filas('Barra')).toEqual(['18/11 10:01 · Egreso · $100 · Hielo · cargó Ana'])
      expect(screen.queryByText('Cargando los movimientos…')).not.toBeInTheDocument()

      await act(async () => { relectura.resolver(detalleCon([BARRA, [movimiento('m-1', BARRA, 'EGRESO', 100, 'Hielo', 1)]], [TERRAZA, [REGISTRADO.movimiento]])) })

      expect(filas('Terraza')).toEqual(['18/11 10:30 · Egreso · $1.500,50 · Compra de hielo · cargó Ana'])
    })

    it('si esa relectura falla, el error reemplaza a la lista', async () => {
      turnosApi.detalle
        .mockResolvedValueOnce(detalleCon([BARRA, [movimiento('m-1', BARRA, 'EGRESO', 100, 'Hielo', 1)]]))
        .mockRejectedValueOnce(new ApiError('Sin conexión', 503))
      await montar()

      await confirmarEgresoEnTerraza()

      expect(await screen.findByText('Sin conexión')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
      expect(screen.queryByRole('list', { name: 'Movimientos de Barra' })).not.toBeInTheDocument()
    })

    it('un error sin mensaje muestra uno genérico', async () => {
      turnosApi.detalle.mockRejectedValueOnce('se cortó')
      await montar()

      expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron leer los movimientos')
    })

    it('una lectura vieja que llega tarde no pisa a la nueva', async () => {
      const vieja = pendiente<TurnoDetalle>()
      const nueva = detalleCon([BARRA, []], [TERRAZA, [REGISTRADO.movimiento]])
      turnosApi.detalle.mockReturnValueOnce(vieja.promesa).mockResolvedValueOnce(nueva)
      render(<MovimientosDelTurno turno={turnoCon([BARRA, TERRAZA])} onTurnoCambio={onTurnoCambio} />)

      // Se registra antes de que llegue la primera lectura: la segunda sale después del registro.
      await confirmarEgresoEnTerraza()
      expect(await screen.findByRole('list', { name: 'Movimientos de Terraza' })).toBeInTheDocument()

      await act(async () => { vieja.resolver(SIN_MOVIMIENTOS) })

      expect(filas('Terraza')).toHaveLength(1)
      expect(screen.queryByText('Todavía no hay movimientos en este turno.')).not.toBeInTheDocument()
    })

    it('un error viejo que llega tarde tampoco la pisa', async () => {
      const vieja = pendiente<TurnoDetalle>()
      turnosApi.detalle.mockReturnValueOnce(vieja.promesa).mockResolvedValueOnce(detalleCon([TERRAZA, [REGISTRADO.movimiento]]))
      render(<MovimientosDelTurno turno={turnoCon([BARRA, TERRAZA])} onTurnoCambio={onTurnoCambio} />)

      await confirmarEgresoEnTerraza()
      expect(await screen.findByRole('list', { name: 'Movimientos de Terraza' })).toBeInTheDocument()

      await act(async () => { vieja.rechazar(new Error('tarde')) })

      expect(screen.queryByText('tarde')).not.toBeInTheDocument()
      expect(filas('Terraza')).toHaveLength(1)
    })
  })

  describe('el formulario', () => {
    it('va en un grupo con su leyenda y la ayuda de que no se edita ni se borra', async () => {
      await montar()

      expect(screen.getByRole('group', { name: 'Registrar movimiento' })).toBeInTheDocument()
      expect(screen.getByText('Los movimientos no se pueden editar ni borrar. Si te equivocás, cargá uno del tipo contrario con el motivo.')).toBeInTheDocument()
      expect(monto()).toHaveAttribute('inputmode', 'decimal')
      expect(motivo()).toHaveAttribute('maxlength', '200')
    })

    it('con dos cajas, la caja y el tipo son radios sin ninguno elegido', async () => {
      await montar()

      expect(screen.getByRole('radiogroup', { name: 'Caja' })).toBeInTheDocument()
      expect(screen.getByRole('radiogroup', { name: 'Tipo' })).toBeInTheDocument()
      expect(screen.getAllByRole('radio').map((r) => [(r as HTMLInputElement).value, (r as HTMLInputElement).checked])).toEqual([
        ['c-barra', false], ['c-terraza', false], ['INGRESO', false], ['EGRESO', false],
      ])
    })

    it('con una caja no se elige: se muestra su nombre', async () => {
      await montar([BARRA])

      expect(screen.getByText('Caja: Barra')).toBeInTheDocument()
      expect(screen.queryByRole('radiogroup', { name: 'Caja' })).not.toBeInTheDocument()
      expect(screen.getAllByRole('radio')).toHaveLength(2)
    })

    it('los errores aparecen al intentar, asociados a cada campo, y no pasa a la confirmación', async () => {
      await montar()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()

      registrar()

      expect(screen.getByRole('radiogroup', { name: 'Caja' })).toHaveAccessibleDescription('Elegí la caja')
      expect(screen.getByRole('radiogroup', { name: 'Caja' })).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByRole('radiogroup', { name: 'Tipo' })).toHaveAccessibleDescription('Elegí si es un ingreso o un egreso')
      expect(monto()).toHaveAccessibleDescription('Ingresá el monto')
      expect(monto()).toHaveAttribute('aria-invalid', 'true')
      expect(motivo()).toHaveAccessibleDescription('Escribí el motivo')
      expect(screen.getAllByRole('alert')).toHaveLength(4)
      expect(screen.queryByText(/^Vas a registrar/)).not.toBeInTheDocument()
    })

    it('al corregir un campo su error se va', async () => {
      await montar()
      registrar()

      fireEvent.click(radio('Terraza'))
      fireEvent.change(motivo(), { target: { value: 'Hielo' } })

      expect(screen.getByRole('radiogroup', { name: 'Caja' })).not.toHaveAccessibleDescription()
      expect(screen.getByRole('radiogroup', { name: 'Caja' })).toHaveAttribute('aria-invalid', 'false')
      expect(motivo()).not.toHaveAccessibleDescription()
      expect(screen.getAllByRole('alert')).toHaveLength(2)
    })

    it.each([
      ['mal escrito', 'mil', 'Escribí el monto solo con números, con coma o punto para los decimales'],
      ['en 0', '0', 'El monto tiene que ser mayor a 0'],
      ['negativo', '-5', 'El monto no puede ser negativo'],
    ])('un monto %s avisa enseguida, sin intentar', async (_caso, texto, mensaje) => {
      await montar()

      fireEvent.change(monto(), { target: { value: texto } })

      expect(monto()).toHaveAccessibleDescription(mensaje)
      expect(screen.getAllByRole('alert')).toHaveLength(1)
    })

    it('un motivo en blanco es un error', async () => {
      await montar()
      completar({ caja: 'Barra', texto: '    ' })

      registrar()

      expect(motivo()).toHaveAccessibleDescription('Escribí el motivo')
      expect(screen.queryByText(/^Vas a registrar/)).not.toBeInTheDocument()
    })
  })

  describe('la confirmación', () => {
    it('muestra lo que se va a mandar, con el monto en pesos y el motivo recortado, y le lleva el foco', async () => {
      await montar()
      completar({ caja: 'Terraza' })

      registrar()

      expect(textoDeConfirmacion()).toHaveTextContent(
        'Vas a registrar un egreso de $1.500,50 en Terraza: «Compra de hielo». No se puede editar ni borrar.',
      )
      expect(textoDeConfirmacion()).toHaveFocus()
      expect(screen.queryByRole('group', { name: 'Registrar movimiento' })).not.toBeInTheDocument()
      expect(turnosApi.registrarMovimiento).not.toHaveBeenCalled()
    })

    it('un ingreso se lee como ingreso, y con una caja usa esa', async () => {
      await montar([BARRA])
      completar({ tipo: 'Ingreso', importe: '20', texto: 'Cambio' })

      registrar()

      expect(textoDeConfirmacion()).toHaveTextContent('Vas a registrar un ingreso de $20 en Barra: «Cambio». No se puede editar ni borrar.')
    })

    it('"Volver" regresa al formulario con lo escrito y lleva el foco al monto, sin mandar nada', async () => {
      await montar()
      completar({ caja: 'Terraza' })
      registrar()

      fireEvent.click(screen.getByRole('button', { name: 'Volver' }))

      expect(radio('Terraza').checked).toBe(true)
      expect(radio('Egreso').checked).toBe(true)
      expect(monto().value).toBe('1500,5')
      expect(motivo().value).toBe('  Compra de hielo ')
      expect(monto()).toHaveFocus()
      expect(turnosApi.registrarMovimiento).not.toHaveBeenCalled()
    })

    it('"Confirmar" manda la caja, el tipo, el monto como número y el motivo recortado al turno', async () => {
      await montar()

      await confirmarEgresoEnTerraza()

      expect(turnosApi.registrarMovimiento).toHaveBeenCalledWith('turno-1', {
        cajaId: 'c-terraza', tipo: 'EGRESO', monto: 1500.5, motivo: 'Compra de hielo',
      })
      expect(await screen.findByText('Movimiento registrado')).toBeInTheDocument()
    })

    it('con una caja manda esa caja', async () => {
      await montar([BARRA])
      completar({ tipo: 'Ingreso', importe: '20', texto: 'Cambio' })
      registrar()

      await confirmar()

      expect(turnosApi.registrarMovimiento).toHaveBeenCalledWith('turno-1', { cajaId: 'c-barra', tipo: 'INGRESO', monto: 20, motivo: 'Cambio' })
      expect(await screen.findByText('Movimiento registrado')).toBeInTheDocument()
    })

    it('mientras envía dice "Registrando…" con los dos botones deshabilitados: no hay doble envío', async () => {
      const envio = pendiente<MovimientoRegistrado>()
      turnosApi.registrarMovimiento.mockReturnValueOnce(envio.promesa)
      await montar()

      await confirmarEgresoEnTerraza()

      const enviando = screen.getByRole('button', { name: 'Registrando…' })
      expect(enviando).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Volver' })).toBeDisabled()
      fireEvent.click(enviando)
      expect(turnosApi.registrarMovimiento).toHaveBeenCalledTimes(1)

      await act(async () => { envio.resolver(REGISTRADO) })
      expect(screen.getByText('Movimiento registrado')).toBeInTheDocument()
    })
  })

  describe('al registrar', () => {
    it('vacía el formulario, avisa con el foco en el mensaje y vuelve a leer la lista', async () => {
      await montar()
      turnosApi.detalle.mockResolvedValue(detalleCon([BARRA, []], [TERRAZA, [REGISTRADO.movimiento]]))

      await confirmarEgresoEnTerraza()

      const aviso = await screen.findByRole('status')
      expect(aviso).toHaveTextContent('Movimiento registrado')
      expect(aviso).toHaveFocus()
      expect(screen.getAllByRole('radio').some((r) => (r as HTMLInputElement).checked)).toBe(false)
      expect(monto().value).toBe('')
      expect(motivo().value).toBe('')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(await screen.findByRole('list', { name: 'Movimientos de Terraza' })).toBeInTheDocument()
      expect(turnosApi.detalle).toHaveBeenCalledTimes(2)
    })

    it('el aviso se va al intentar registrar otro', async () => {
      await montar()
      await confirmarEgresoEnTerraza()
      await screen.findByText('Movimiento registrado')

      registrar()

      expect(screen.queryByText('Movimiento registrado')).not.toBeInTheDocument()
    })

    it('el 409 de turno cerrado se lo pasa a la pantalla, sin mostrar el error acá', async () => {
      turnosApi.registrarMovimiento.mockRejectedValueOnce(new ApiError('El turno está cerrado', 409))
      await montar()

      await confirmarEgresoEnTerraza()

      await waitFor(() => expect(onTurnoCambio).toHaveBeenCalledWith('El turno está cerrado'))
      expect(screen.queryByText('El turno está cerrado')).not.toBeInTheDocument()
      expect(turnosApi.detalle).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['el 409 de operación simultánea', new ApiError('Otra operación modificó esto al mismo tiempo; probá de nuevo', 409), 'Otra operación modificó esto al mismo tiempo; probá de nuevo'],
      ['el 400 de caja no abierta', new ApiError('La caja no está abierta en este turno', 400), 'La caja no está abierta en este turno'],
      ['un error sin mensaje', new ApiError('', 500), 'No se pudo registrar el movimiento'],
      ['un "El turno está cerrado" que no es 409', new ApiError('El turno está cerrado', 400), 'El turno está cerrado'],
    ])('%s vuelve al formulario con lo escrito y el foco en el error, sin releer ni pasar a la pantalla', async (_caso, error, mensaje) => {
      turnosApi.registrarMovimiento.mockRejectedValueOnce(error)
      await montar()

      await confirmarEgresoEnTerraza()

      const alerta = await screen.findByText(mensaje)
      expect(alerta).toHaveAttribute('role', 'alert')
      expect(alerta).toHaveFocus()
      expect(radio('Terraza').checked).toBe(true)
      expect(radio('Egreso').checked).toBe(true)
      expect(monto().value).toBe('1500,5')
      expect(motivo().value).toBe('  Compra de hielo ')
      expect(onTurnoCambio).not.toHaveBeenCalled()
      expect(turnosApi.detalle).toHaveBeenCalledTimes(1)
    })

    it('sin respuesta del servidor avisa que no se sabe si se registró, vuelve a leer la lista y no reintenta', async () => {
      turnosApi.registrarMovimiento.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      await montar()

      await confirmarEgresoEnTerraza()

      const alerta = await screen.findByText('No se pudo confirmar si el movimiento se registró. Revisá la lista antes de volver a intentar.')
      expect(alerta).toHaveFocus()
      expect(monto().value).toBe('1500,5')
      await waitFor(() => expect(turnosApi.detalle).toHaveBeenCalledTimes(2))
      expect(turnosApi.registrarMovimiento).toHaveBeenCalledTimes(1)
      expect(onTurnoCambio).not.toHaveBeenCalled()
    })
  })
})
