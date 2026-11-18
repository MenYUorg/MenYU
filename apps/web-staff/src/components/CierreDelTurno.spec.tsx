import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { CierreDeTurno, TurnoCajaApi, TurnoDeCaja } from '@menyu/types'
import { api, ApiError, type SesionActivaItem } from '../services/api'
import { useCajasStore } from '../store/cajasStore'
import { CierreDelTurno } from './CierreDelTurno'

vi.mock('../services/api', async () => {
  const { ApiError } = await vi.importActual<typeof import('../services/api')>('../services/api')
  return {
    ApiError,
    api: {
      cajas: { abiertas: vi.fn() },
      sesiones: { getActivas: vi.fn() },
      turnos: { cerrar: vi.fn(), actual: vi.fn(), detalle: vi.fn() },
    },
  }
})

const sesionesApi = vi.mocked(api.sesiones)
const turnosApi = vi.mocked(api.turnos)
const cajasApi = vi.mocked(api.cajas)

const ABIERTO = new Date(2026, 10, 18, 12, 0).toISOString()
const CERRADO = new Date(2026, 10, 18, 23, 30).toISOString()
const caja = (id: string, cajaId: string, nombre: string, fondoInicial = 0): TurnoCajaApi => ({ id, cajaId, nombre, fondoInicial, abiertoEn: ABIERTO })
const BARRA = caja('tc-barra', 'c-barra', 'Barra', 5000)
const TERRAZA = caja('tc-terraza', 'c-terraza', 'Terraza', 1000)

const turnoCon = (cajas: TurnoCajaApi[]): TurnoDeCaja => ({
  id: 'turno-1', restauranteId: 'rest-1', abiertoEn: ABIERTO, abiertoPor: { id: 'u-1', nombre: 'Julia' }, cerradoEn: null,
  observaciones: null, cajas, asignaciones: [],
})

const fila = (metodo: 'efectivo' | 'debito' | 'credito' | 'transferencia', esperado: number, declarado: number) => ({
  metodo, esperado, declarado, diferencia: declarado - esperado,
})
const RESPUESTA: CierreDeTurno = {
  turno: { ...turnoCon([BARRA, TERRAZA]), cerradoEn: CERRADO },
  arqueos: [
    { cajaId: 'c-barra', cajaNombre: 'Barra', fondoInicial: 5000, metodos: [fila('efectivo', 6350, 6300), fila('debito', 0, 0), fila('credito', 0, 0), fila('transferencia', 0, 0)] },
    { cajaId: 'c-terraza', cajaNombre: 'Terraza', fondoInicial: 1000, metodos: [fila('efectivo', 1000, 1000), fila('debito', 0, 0), fila('credito', 0, 0), fila('transferencia', 0, 0)] },
  ],
  avisos: { mesasAbiertas: [{ mesaId: 'm7', mesaNumero: '7', iniciadaEn: ABIERTO }] },
}

const sesion = (mesaId: string, mesaNumero: string, tiempoTranscurrido: number, quierePagar = false): SesionActivaItem => ({
  id: `s-${mesaId}-${tiempoTranscurrido}`, mesaId, mesaNumero, tiempoTranscurrido, cantidadItems: 1, cantidadPersonas: 2,
  totalAcumulado: 12000, quierePagar,
})

function pendiente<T>() {
  let resolver!: (valor: T) => void
  let rechazar!: (error: unknown) => void
  const promesa = new Promise<T>((res, rej) => { resolver = res; rechazar = rej })
  return { promesa, resolver, rechazar }
}

const onCerrado = vi.fn()
const onTurnoCambio = vi.fn()

function montar(cajas: TurnoCajaApi[] = [BARRA, TERRAZA]) {
  return render(<CierreDelTurno turno={turnoCon(cajas)} restauranteId="rest-1" onCerrado={onCerrado} onTurnoCambio={onTurnoCambio} />)
}

/** Monta, toca "Cerrar turno" y espera el formulario. */
async function declarar(cajas?: TurnoCajaApi[]) {
  montar(cajas)
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar turno' }))
  await screen.findByRole('button', { name: 'Continuar' })
}

const grupo = (nombre: string) => screen.getByRole('group', { name: nombre })
const campo = (cajaNombre: string, etiqueta: string) => within(grupo(cajaNombre)).getByLabelText(etiqueta) as HTMLInputElement
const escribir = (cajaNombre: string, etiqueta: string, texto: string) => fireEvent.change(campo(cajaNombre, etiqueta), { target: { value: texto } })

function completar(cajaNombre: string, efectivo = '0', debito = '0', credito = '0', transferencia = '0') {
  escribir(cajaNombre, 'Efectivo', efectivo)
  escribir(cajaNombre, 'Débito', debito)
  escribir(cajaNombre, 'Crédito', credito)
  escribir(cajaNombre, 'Transferencia', transferencia)
}

/** Declara las dos cajas y pasa a la confirmación. */
async function confirmar(observaciones = '') {
  await declarar()
  completar('Barra', '6300', '0', '1200,5', '0')
  completar('Terraza', '1000')
  fireEvent.change(screen.getByLabelText('Observaciones del cierre (opcional)'), { target: { value: observaciones } })
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  await screen.findByRole('heading', { name: 'Confirmá el cierre' })
}

const botonCerrar = () => screen.getByRole('button', { name: /^(Cerrar turno|Cerrando…)$/ })
/** "Cerrar turno" en la confirmación, esperando dentro de act lo que haga la respuesta. */
const enviar = () => act(async () => { fireEvent.click(botonCerrar()) })

beforeEach(() => {
  // reset y no clear: una respuesta `mockReturnValueOnce` que un test no usó no pasa al siguiente.
  vi.resetAllMocks()
  useCajasStore.setState({ restauranteId: null, cajas: null })
  sesionesApi.getActivas.mockResolvedValue([])
  turnosApi.cerrar.mockResolvedValue(RESPUESTA)
  cajasApi.abiertas.mockResolvedValue({ cajas: [] })
})

describe('CierreDelTurno', () => {
  describe('antes de empezar', () => {
    it('es una sección "Cerrar turno" con su botón, sin pedir nada', () => {
      montar()

      expect(screen.getByRole('region', { name: 'Cerrar turno' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cerrar turno' })).toBeInTheDocument()
      expect(screen.queryByRole('group')).not.toBeInTheDocument()
      expect(sesionesApi.getActivas).not.toHaveBeenCalled()
    })
  })

  describe('la revisión de las mesas abiertas', () => {
    it('mientras revisa lo dice; después pasa al formulario', async () => {
      const activas = pendiente<SesionActivaItem[]>()
      sesionesApi.getActivas.mockReturnValueOnce(activas.promesa)
      montar()

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar turno' }))

      expect(screen.getByRole('status')).toHaveTextContent('Revisando las mesas abiertas…')
      expect(sesionesApi.getActivas).toHaveBeenCalledWith('rest-1')
      expect(screen.queryByRole('button', { name: 'Cerrar turno' })).not.toBeInTheDocument()

      await act(async () => { activas.resolver([]) })

      expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('"Cancelar" mientras revisa vuelve al botón, y la respuesta tardía no reabre el formulario', async () => {
      const activas = pendiente<SesionActivaItem[]>()
      sesionesApi.getActivas.mockReturnValueOnce(activas.promesa)
      montar()
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar turno' }))

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.getByRole('button', { name: 'Cerrar turno' })).toBeInTheDocument()

      await act(async () => { activas.resolver([sesion('m7', '7', 12)]) })

      expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cerrar turno' })).toBeInTheDocument()
    })

    it('un error tardío de una revisión cancelada tampoco reabre el formulario', async () => {
      const activas = pendiente<SesionActivaItem[]>()
      sesionesApi.getActivas.mockReturnValueOnce(activas.promesa)
      montar()
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar turno' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

      await act(async () => { activas.rechazar(new Error('tarde')) })

      expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument()
    })

    it('sin mesas abiertas no avisa nada', async () => {
      await declarar()

      expect(screen.queryByText(/mesas? abiertas?/)).not.toBeInTheDocument()
    })

    it('con mesas abiertas avisa cuáles, una vez cada una, en orden natural, desde hace cuánto y si pidieron pagar', async () => {
      sesionesApi.getActivas.mockResolvedValueOnce([sesion('m10', '10', 30), sesion('m2', '2', 75, true), sesion('m10', '10', 45)])
      await declarar()

      expect(screen.getByText(/Hay 2 mesas abiertas\. Podés cerrar igual, pero sin un turno abierto no se van a poder cobrar/)).toBeInTheDocument()
      const mesas = within(screen.getByRole('list', { name: 'Mesas abiertas' })).getAllByRole('listitem').map((m) => m.textContent)
      expect(mesas).toEqual(['Mesa 2 (hace 1 h 15 min, pidió pagar)', 'Mesa 10 (hace 45 min)'])
    })

    it('con una sola mesa abierta lo dice en singular', async () => {
      sesionesApi.getActivas.mockResolvedValueOnce([sesion('m7', '7', 12)])
      await declarar()

      expect(screen.getByText(/^Hay 1 mesa abierta\./)).toBeInTheDocument()
    })

    it('si no se puede revisar, avisa y deja cerrar igual', async () => {
      sesionesApi.getActivas.mockRejectedValueOnce(new Error('Sin conexión'))
      await declarar()

      expect(screen.getByText('No se pudo revisar si hay mesas abiertas. Podés cerrar igual.')).toBeInTheDocument()
      expect(screen.queryByRole('list', { name: 'Mesas abiertas' })).not.toBeInTheDocument()
    })
  })

  describe('lo declarado', () => {
    it('un grupo por caja en el orden del turno, con los 4 métodos, la ayuda y sin ningún esperado (arqueo ciego)', async () => {
      await declarar()

      expect(screen.getAllByRole('group').map((g) => g.querySelector('legend')?.textContent)).toEqual(['Barra', 'Terraza'])
      for (const nombre of ['Barra', 'Terraza']) {
        const etiquetas = within(grupo(nombre)).getAllByRole('textbox').map((c) => (c as HTMLInputElement).labels?.[0]?.textContent)
        expect(etiquetas).toEqual(['Efectivo', 'Débito', 'Crédito', 'Transferencia'])
        expect(campo(nombre, 'Efectivo')).toHaveAttribute('inputmode', 'decimal')
      }
      expect(campo('Barra', 'Efectivo').id).not.toBe(campo('Terraza', 'Efectivo').id)
      expect(screen.getByText('Contá lo que hay en cada caja y cargalo sin mirar el sistema. Escribí 0 en los métodos sin movimiento.')).toBeInTheDocument()
      expect(screen.queryByText(/esperado|saldo|total|\$/i)).not.toBeInTheDocument()
    })

    it('las observaciones admiten hasta 500 caracteres', async () => {
      await declarar()

      expect(screen.getByLabelText('Observaciones del cierre (opcional)')).toHaveAttribute('maxLength', '500')
    })

    it('los errores aparecen recién al tocar "Continuar", junto a cada campo, y el foco va al primero', async () => {
      await declarar()
      escribir('Barra', 'Efectivo', '-5')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

      expect(campo('Barra', 'Efectivo')).toHaveAccessibleDescription('Lo que contaste no puede ser negativo')
      expect(campo('Barra', 'Efectivo')).toHaveAttribute('aria-invalid', 'true')
      expect(campo('Terraza', 'Transferencia')).toHaveAccessibleDescription('Ingresá lo que contaste (0 si no hubo)')
      expect(screen.getAllByRole('alert')).toHaveLength(8)
      expect(campo('Barra', 'Efectivo')).toHaveFocus()
      expect(screen.queryByRole('heading', { name: 'Confirmá el cierre' })).not.toBeInTheDocument()
    })

    it('el foco va al primer campo inválido en el orden del formulario', async () => {
      await declarar()
      completar('Barra')
      escribir('Terraza', 'Efectivo', '10')
      escribir('Terraza', 'Crédito', '5')

      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

      expect(campo('Terraza', 'Débito')).toHaveFocus()
      expect(screen.getAllByRole('alert')).toHaveLength(2)
    })

    it('al corregir un campo después de intentar, su error se va', async () => {
      await declarar([BARRA])
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

      escribir('Barra', 'Efectivo', '0')

      expect(campo('Barra', 'Efectivo')).toHaveAttribute('aria-invalid', 'false')
      expect(campo('Barra', 'Efectivo')).not.toHaveAccessibleDescription()
      expect(screen.getAllByRole('alert')).toHaveLength(3)
    })

    it('"Cancelar" vuelve al botón y descarta lo escrito', async () => {
      await declarar()
      escribir('Barra', 'Efectivo', '100')
      fireEvent.change(screen.getByLabelText('Observaciones del cierre (opcional)'), { target: { value: 'Algo' } })
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByRole('group')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar turno' }))
      await screen.findByRole('button', { name: 'Continuar' })

      expect(campo('Barra', 'Efectivo').value).toBe('')
      expect((screen.getByLabelText('Observaciones del cierre (opcional)') as HTMLTextAreaElement).value).toBe('')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('la confirmación', () => {
    it('muestra lo declarado por caja y método, sin esperado ni diferencia, con el foco en su encabezado', async () => {
      await confirmar()

      expect(screen.getByRole('heading', { name: 'Confirmá el cierre' })).toHaveFocus()
      const barra = within(screen.getByRole('table', { name: 'Lo declarado en Barra' })).getAllByRole('row').map((r) => r.textContent)
      expect(barra).toEqual(['Efectivo$6.300', 'Débito$0', 'Crédito$1.200,50', 'Transferencia$0'])
      expect(screen.getByRole('table', { name: 'Lo declarado en Terraza' })).toHaveTextContent('Efectivo$1.000')
      expect(screen.getByText('Vas a cerrar el turno y todas sus cajas. No se puede deshacer.')).toBeInTheDocument()
      expect(screen.queryByText(/esperado|diferencia|sobran|faltan/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Observaciones:/)).not.toBeInTheDocument()
      expect(turnosApi.cerrar).not.toHaveBeenCalled()
    })

    it('muestra las observaciones recortadas si hay', async () => {
      await confirmar('  Faltó cambio  ')

      expect(screen.getByText('Observaciones: Faltó cambio')).toBeInTheDocument()
    })

    it('"Volver a corregir" vuelve al formulario con lo escrito', async () => {
      await confirmar('Faltó cambio')

      fireEvent.click(screen.getByRole('button', { name: 'Volver a corregir' }))

      expect(campo('Barra', 'Crédito').value).toBe('1200,5')
      expect(campo('Terraza', 'Efectivo').value).toBe('1000')
      expect((screen.getByLabelText('Observaciones del cierre (opcional)') as HTMLTextAreaElement).value).toBe('Faltó cambio')
      expect(turnosApi.cerrar).not.toHaveBeenCalled()
    })
  })

  describe('al cerrar', () => {
    it('manda una entrada por caja con el cajaId de la Caja, en el orden del turno, y las observaciones recortadas', async () => {
      await confirmar('  Faltó cambio  ')

      await enviar()

      expect(turnosApi.cerrar).toHaveBeenCalledWith('turno-1', {
        cajas: [
          { cajaId: 'c-barra', declarado: { efectivo: 6300, debito: 0, credito: 1200.5, transferencia: 0 } },
          { cajaId: 'c-terraza', declarado: { efectivo: 1000, debito: 0, credito: 0, transferencia: 0 } },
        ],
        observaciones: 'Faltó cambio',
      })
    })

    it('sin observaciones no las manda', async () => {
      await confirmar('   ')

      await enviar()

      expect(turnosApi.cerrar.mock.calls[0][1]).not.toHaveProperty('observaciones')
    })

    it('mientras envía dice "Cerrando…" con los dos botones deshabilitados: no hay doble envío', async () => {
      const cierre = pendiente<CierreDeTurno>()
      turnosApi.cerrar.mockReturnValueOnce(cierre.promesa)
      await confirmar()

      await enviar()

      expect(botonCerrar()).toHaveTextContent('Cerrando…')
      expect(botonCerrar()).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Volver a corregir' })).toBeDisabled()
      fireEvent.click(botonCerrar())
      expect(turnosApi.cerrar).toHaveBeenCalledTimes(1)

      await act(async () => { cierre.resolver(RESPUESTA) })
      expect(onCerrado).toHaveBeenCalledTimes(1)
    })

    it('pasa el resultado a la pantalla y refresca las cajas abiertas para el cobro', async () => {
      await confirmar()

      await enviar()

      expect(onCerrado).toHaveBeenCalledWith({
        turnoId: 'turno-1', cerradoEn: CERRADO, arqueos: RESPUESTA.arqueos, mesasAbiertas: RESPUESTA.avisos.mesasAbiertas,
      })
      await waitFor(() => expect(cajasApi.abiertas).toHaveBeenCalledWith('rest-1'))
      expect(onTurnoCambio).not.toHaveBeenCalled()
    })
  })

  describe('si el cierre falla', () => {
    it('el 409 "El turno está cerrado" se lo pasa a la pantalla, sin mostrar el error acá', async () => {
      turnosApi.cerrar.mockRejectedValueOnce(new ApiError('El turno está cerrado', 409))
      await confirmar()

      await enviar()

      expect(onTurnoCambio).toHaveBeenCalledWith('El turno está cerrado')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(onCerrado).not.toHaveBeenCalled()
      expect(turnosApi.actual).not.toHaveBeenCalled()
    })

    it.each([
      ['el 409 de operación simultánea', new ApiError('Otra operación modificó esto al mismo tiempo; probá de nuevo', 409), 'Otra operación modificó esto al mismo tiempo; probá de nuevo'],
      ['un 409 que solo empieza como el de turno cerrado', new ApiError('El turno está cerrado por otra persona', 409), 'El turno está cerrado por otra persona'],
      ['"El turno está cerrado" que no es 409', new ApiError('El turno está cerrado', 400), 'El turno está cerrado'],
      ['el 400 de una caja que no está abierta', new ApiError('La caja no está abierta en este turno', 400), 'La caja no está abierta en este turno'],
      ['el 400 del máximo, tal cual lo manda el backend', new ApiError('El arqueo de efectivo de la caja «Barra» supera el máximo que se puede registrar', 400), 'El arqueo de efectivo de la caja «Barra» supera el máximo que se puede registrar'],
      ['un 403', new ApiError('No tenés permiso', 403), 'No tenés permiso'],
      ['un 4xx sin mensaje', new ApiError('', 404), 'No se pudo cerrar el turno'],
    ])('%s se queda en la confirmación con el mensaje, sin releer nada', async (_caso, error, mensaje) => {
      turnosApi.cerrar.mockRejectedValueOnce(error)
      await confirmar()

      await enviar()

      expect(screen.getByRole('alert')).toHaveTextContent(mensaje)
      expect(botonCerrar()).toBeEnabled()
      expect(onTurnoCambio).not.toHaveBeenCalled()
      expect(onCerrado).not.toHaveBeenCalled()
      expect(turnosApi.actual).not.toHaveBeenCalled()
    })

    it('reintentar después de un error manda de nuevo y, si sale bien, cierra', async () => {
      turnosApi.cerrar.mockRejectedValueOnce(new ApiError('Otra operación modificó esto al mismo tiempo; probá de nuevo', 409))
      await confirmar()
      await enviar()

      await enviar()

      expect(turnosApi.cerrar).toHaveBeenCalledTimes(2)
      expect(onCerrado).toHaveBeenCalledTimes(1)
    })

    it('un 400 se queda en la confirmación con el mensaje y los botones habilitados para reintentar', async () => {
      turnosApi.cerrar.mockRejectedValueOnce(new ApiError('Falta el arqueo de la caja «Terraza»', 400))
      await confirmar()

      await enviar()

      expect(screen.getByRole('alert')).toHaveTextContent('Falta el arqueo de la caja «Terraza»')
      expect(botonCerrar()).toHaveTextContent('Cerrar turno')
      expect(botonCerrar()).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Volver a corregir' })).toBeEnabled()
      expect(onCerrado).not.toHaveBeenCalled()
      expect(onTurnoCambio).not.toHaveBeenCalled()
    })
  })
})
