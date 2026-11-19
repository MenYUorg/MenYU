import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import type { CajaDelDetalle, FilaDeArqueo, MovimientoDeCaja, ResumenDeTurno, TurnoDetalle } from '@menyu/types'
import { formatearFechaHoraCompleta } from '@menyu/ui/caja'
import { api, ApiError } from '../../../services/api'
import { TurnoDetallePage } from './TurnoDetallePage'

let restauranteActual: string | null = 'rest-1'

vi.mock('@menyu/auth-client', async () => (await import('../../../test/authClient')).moduloSimulado())
vi.mock('../../../store/contextStore', () => ({
  useContextStore: () => ({ selectedRestauranteId: restauranteActual }),
}))
// `ApiError` queda el real; solo se simula el objeto `api`.
vi.mock('../../../services/api', async () => ({
  ...(await vi.importActual<typeof import('../../../services/api')>('../../../services/api')),
  api: { turnos: { detalle: vi.fn(), resumen: vi.fn() } },
}))

const turnosApi = vi.mocked(api.turnos)

const ABIERTO_EN = '2026-11-18T12:00:00.000Z'
const CERRADO_EN = '2026-11-18T23:30:00.000Z'
const ANA = { id: 'u-ana', nombre: 'Ana' }
const JUAN = { id: 'u-juan', nombre: 'Juan' }

const fila = (metodo: FilaDeArqueo['metodo'], esperado: number, declarado: number): FilaDeArqueo => ({ metodo, esperado, declarado, diferencia: declarado - esperado })
const ARQUEO = [fila('efectivo', 6000, 5500), fila('debito', 2000, 2000), fila('credito', 1000, 1120.5), fila('transferencia', 0, 0)]

const movimiento = (id: string, tipo: MovimientoDeCaja['tipo'], monto: number, motivo: string, createdAt: string): MovimientoDeCaja => ({
  id, cajaId: 'c-barra', cajaNombre: 'Barra', tipo, monto, motivo, usuario: ANA, createdAt,
})
const MOVIMIENTOS = [
  movimiento('m1', 'INGRESO', 1000.5, 'Cambio', '2026-11-18T13:00:00.000Z'),
  movimiento('m2', 'EGRESO', 250, 'Hielo', '2026-11-18T14:05:00.000Z'),
]

const caja = (nombre: string, cambios: Partial<CajaDelDetalle> = {}): CajaDelDetalle => ({
  id: `tc-${nombre}`, cajaId: `c-${nombre}`, nombre, fondoInicial: 5000, arqueo: ARQUEO, movimientos: [], ...cambios,
})

const CERRADO: TurnoDetalle = {
  id: 't/1',
  abiertoEn: ABIERTO_EN,
  abiertoPor: ANA,
  cerradoEn: CERRADO_EN,
  cerradoPor: JUAN,
  observaciones: 'Faltó cambio\nSe avisó al gerente',
  cajas: [caja('Barra', { movimientos: MOVIMIENTOS }), caja('Terraza', { fondoInicial: 1000 })],
  asignaciones: [
    { mesaId: 'mesa-10', mesaNumero: '10', mozoId: 'm-zoe', mozoNombre: 'Zoe' },
    { mesaId: 'mesa-3', mesaNumero: '3', mozoId: 'm-ana', mozoNombre: 'Ana' },
    { mesaId: 'mesa-2', mesaNumero: '2', mozoId: 'm-zoe', mozoNombre: 'Zoe' },
  ],
}

const ABIERTO: TurnoDetalle = {
  ...CERRADO,
  cerradoEn: null,
  cerradoPor: null,
  observaciones: null,
  // Aunque la API mandara un arqueo, con el turno abierto no se muestra.
  cajas: [caja('Barra', { movimientos: MOVIMIENTOS })],
  asignaciones: [],
}

const RESUMEN: ResumenDeTurno = {
  turno: { id: 't/1', abiertoEn: ABIERTO_EN, cerradoEn: CERRADO_EN },
  porMetodo: [
    { metodo: 'efectivo', cantidad: 3, monto: 4500, propina: 300 },
    { metodo: 'debito', cantidad: 1, monto: 2000, propina: 0 },
    { metodo: 'credito', cantidad: 0, monto: 0, propina: 0 },
    { metodo: 'transferencia', cantidad: 0, monto: 0, propina: 0 },
  ],
  porMozo: [
    { mozoId: 'm-zoe', mozoNombre: 'Zoe', cantidad: 3, monto: 5000, propina: 300 },
    { mozoId: null, mozoNombre: null, cantidad: 1, monto: 1500, propina: 0 },
  ],
  total: { cantidad: 4, monto: 6500, propina: 300 },
  mercadoPago: {
    desde: ABIERTO_EN,
    hasta: CERRADO_EN,
    cantidad: 2,
    monto: 3000,
    propina: 150,
    pagos: [
      { id: 'p1', mesaNumero: '7', cajaId: 'c-Barra', cajaNombre: 'Barra', monto: 2000, propina: 150, fechaCobro: '2026-11-18T20:00:00.000Z', requiereRevision: false },
      { id: 'p2', mesaNumero: '9', cajaId: null, cajaNombre: null, monto: 1000, propina: 0, fechaCobro: '2026-11-18T21:15:00.000Z', requiereRevision: true },
    ],
  },
}

function pendiente<T>() {
  let resolver!: (valor: T) => void
  let rechazar!: (error: unknown) => void
  const promesa = new Promise<T>((res, rej) => { resolver = res; rechazar = rej })
  return { promesa, resolver, rechazar }
}

const vista = (ruta = '/admin/turnos/t%2F1') => (
  <MemoryRouter initialEntries={[ruta]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/admin/turnos" element={<p>Lista de turnos</p>} />
      <Route path="/admin/turnos/:id" element={<><TurnoDetallePage /><Link to="/admin/turnos/t2">Ir a otro turno</Link></>} />
    </Routes>
  </MemoryRouter>
)

/** Monta la pantalla y espera, dentro de act, a que terminen las lecturas. */
async function abrir(ruta?: string) {
  const montada = render(vista(ruta))
  await act(async () => {})
  return montada
}

/** Hace click y espera, dentro de act, lo que haga la respuesta. */
const tocar = (elemento: HTMLElement) => act(async () => { fireEvent.click(elemento) })
const seccion = (nombre: string) => screen.getByRole('region', { name: nombre })
const tabla = (nombre: string) => screen.getByRole('table', { name: nombre })
/** Las filas de una tabla como texto de sus celdas (la primera, el encabezado). */
const filasDe = (t: HTMLElement) => within(t).getAllByRole('row').map((tr) => Array.from(tr.children).map((celda) => celda.textContent))
const volver = () => screen.getAllByRole('link', { name: 'Volver a turnos de caja' })

beforeEach(() => {
  // reset y no clear: una respuesta `mockReturnValueOnce` que un test no usó no pasa al siguiente.
  vi.resetAllMocks()
  restauranteActual = 'rest-1'
  turnosApi.detalle.mockResolvedValue(CERRADO)
  turnosApi.resumen.mockResolvedValue(RESUMEN)
})

describe('TurnoDetallePage', () => {
  describe('la lectura', () => {
    it('mientras lee lo dice, con "Volver a turnos de caja" arriba; lee el turno por su id y, cerrado, después el resumen', async () => {
      render(vista())
      expect(screen.getByRole('status', { name: 'Cargando el turno' })).toBeInTheDocument()
      expect(volver()).toHaveLength(1)
      expect(volver()[0]).toHaveAttribute('href', '/admin/turnos')
      await act(async () => {})

      expect(turnosApi.detalle).toHaveBeenCalledWith('t/1')
      expect(turnosApi.resumen).toHaveBeenCalledWith('t/1')
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(screen.getByRole('article', { name: `Turno del ${formatearFechaHoraCompleta(ABIERTO_EN)}` })).toBeInTheDocument()
      expect(volver()).toHaveLength(1)
    })

    it('el turno se lee primero y el resumen después; mientras llega el resumen, el resto ya se ve', async () => {
      const resumen = pendiente<ResumenDeTurno>()
      turnosApi.resumen.mockReturnValue(resumen.promesa)
      await abrir()

      expect(seccion('Cajas')).toBeInTheDocument()
      expect(within(seccion('Resumen de cobros')).getByRole('status', { name: 'Cargando el resumen de cobros' })).toBeInTheDocument()

      await act(async () => resumen.resolver(RESUMEN))
      expect(tabla('Cobrado por método')).toBeInTheDocument()
    })

    it.each([
      [404, 'Turno no encontrado'],
      [403, 'No tenés acceso a este restaurante'],
    ])('un %s muestra el mensaje del backend con "Volver a turnos de caja", sin "Reintentar" ni resumen', async (status, mensaje) => {
      turnosApi.detalle.mockRejectedValue(new ApiError(status, mensaje))
      await abrir()

      const alerta = screen.getByRole('alert')
      expect(alerta).toHaveTextContent(mensaje)
      expect(within(alerta).getByRole('link', { name: 'Volver a turnos de caja' })).toHaveAttribute('href', '/admin/turnos')
      expect(within(alerta).queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
      expect(turnosApi.resumen).not.toHaveBeenCalled()

      await tocar(within(alerta).getByRole('link', { name: 'Volver a turnos de caja' }))
      expect(screen.getByText('Lista de turnos')).toBeInTheDocument()
    })

    it('cualquier otro error muestra el mensaje con "Reintentar", que vuelve a leer el turno y su resumen', async () => {
      turnosApi.detalle.mockRejectedValueOnce(new ApiError(500, 'Error interno'))
      await abrir()

      const alerta = screen.getByRole('alert')
      expect(alerta).toHaveTextContent('Error interno')
      expect(within(alerta).queryByRole('link')).not.toBeInTheDocument()
      await tocar(within(alerta).getByRole('button', { name: 'Reintentar' }))

      expect(turnosApi.detalle).toHaveBeenCalledTimes(2)
      expect(turnosApi.resumen).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(seccion('Cajas')).toBeInTheDocument()
    })

    it('mientras reintenta vuelve a decir que está cargando', async () => {
      const segunda = pendiente<TurnoDetalle>()
      turnosApi.detalle.mockRejectedValueOnce(new Error('Se cortó')).mockReturnValueOnce(segunda.promesa)
      await abrir()

      await tocar(within(screen.getByRole('alert')).getByRole('button', { name: 'Reintentar' }))

      expect(screen.getByRole('status', { name: 'Cargando el turno' })).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('un error sin mensaje muestra uno genérico', async () => {
      turnosApi.detalle.mockRejectedValueOnce('se cortó')
      await abrir()

      expect(screen.getByRole('alert')).toHaveTextContent('No se pudo leer el turno')
    })
  })

  describe('el resumen, independiente del turno', () => {
    it('si falla, el resto se ve y el resumen lleva su error con "Reintentar", que lee solo el resumen', async () => {
      turnosApi.resumen.mockRejectedValueOnce(new ApiError(500, 'No se pudo calcular'))
      await abrir()

      expect(seccion('Cajas')).toBeInTheDocument()
      expect(seccion('Mesas asignadas')).toBeInTheDocument()
      const alerta = within(seccion('Resumen de cobros')).getByRole('alert')
      expect(alerta).toHaveTextContent('No se pudo calcular')

      await tocar(within(alerta).getByRole('button', { name: 'Reintentar' }))

      expect(turnosApi.detalle).toHaveBeenCalledTimes(1)
      expect(turnosApi.resumen).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(tabla('Cobrado por método')).toBeInTheDocument()
    })

    it('mientras reintenta el resumen dice que lo está cargando; un error sin mensaje muestra uno genérico', async () => {
      const segunda = pendiente<ResumenDeTurno>()
      turnosApi.resumen.mockRejectedValueOnce(undefined).mockReturnValueOnce(segunda.promesa)
      await abrir()

      const alerta = screen.getByRole('alert')
      expect(alerta).toHaveTextContent('No se pudo leer el resumen de cobros')
      await tocar(within(alerta).getByRole('button', { name: 'Reintentar' }))

      expect(screen.getByRole('status', { name: 'Cargando el resumen de cobros' })).toBeInTheDocument()
    })
  })

  describe('las respuestas viejas', () => {
    it('el turno y el resumen de un turno anterior que llegan tarde no pisan los del nuevo', async () => {
      const detalleViejo = pendiente<TurnoDetalle>()
      const otro: TurnoDetalle = { ...CERRADO, id: 't2', abiertoEn: '2026-11-17T08:00:00.000Z' }
      turnosApi.detalle.mockReturnValueOnce(detalleViejo.promesa).mockResolvedValueOnce(otro)
      await abrir()

      await tocar(screen.getByRole('link', { name: 'Ir a otro turno' }))
      expect(turnosApi.detalle).toHaveBeenLastCalledWith('t2')
      await act(async () => detalleViejo.resolver(CERRADO))

      expect(screen.getByRole('heading', { name: `Turno del ${formatearFechaHoraCompleta(otro.abiertoEn)}` })).toBeInTheDocument()
      expect(turnosApi.resumen.mock.calls).toEqual([['t2']])
    })

    it('un resumen del turno anterior que llega tarde no pisa el del nuevo', async () => {
      const resumenViejo = pendiente<ResumenDeTurno>()
      const otro: TurnoDetalle = { ...CERRADO, id: 't2' }
      turnosApi.detalle.mockResolvedValueOnce(CERRADO).mockResolvedValueOnce(otro)
      turnosApi.resumen.mockReturnValueOnce(resumenViejo.promesa).mockResolvedValueOnce({ ...RESUMEN, total: { cantidad: 1, monto: 99, propina: 0 } })
      await abrir()

      await tocar(screen.getByRole('link', { name: 'Ir a otro turno' }))
      await act(async () => resumenViejo.resolver(RESUMEN))

      expect(filasDe(tabla('Cobrado por método')).pop()).toEqual(['Total', '1', '$99', '$0'])
    })
  })

  describe('el cambio de restaurante', () => {
    it('si el restaurante elegido pasa a ser otro, vuelve a la lista', async () => {
      const { rerender } = await abrir()

      restauranteActual = 'rest-2'
      rerender(vista())

      expect(screen.getByText('Lista de turnos')).toBeInTheDocument()
    })

    it.each([
      ['al hidratarse (de ninguno a uno)', null, 'rest-1'],
      ['al quedar sin restaurante', 'rest-1', null],
      ['si sigue siendo el mismo', 'rest-1', 'rest-1'],
    ])('%s se queda en el detalle', async (_caso, antes, despues) => {
      restauranteActual = antes
      const { rerender } = await abrir()

      restauranteActual = despues
      rerender(vista())
      await act(async () => {})

      expect(screen.queryByText('Lista de turnos')).not.toBeInTheDocument()
      expect(seccion('Cajas')).toBeInTheDocument()
    })
  })

  describe('un turno cerrado', () => {
    it('el encabezado: cuándo y quién lo abrió y lo cerró, el badge "Cerrado" y las observaciones', async () => {
      await abrir()

      const turno = screen.getByRole('article')
      expect(within(turno).getByText(`Abierto el ${formatearFechaHoraCompleta(ABIERTO_EN)} por Ana`)).toBeInTheDocument()
      expect(within(turno).getByText(`Cerrado el ${formatearFechaHoraCompleta(CERRADO_EN)} por Juan`)).toBeInTheDocument()
      expect(within(turno).getByText('Cerrado')).toBeInTheDocument()
      expect(within(turno).getByText(/Faltó cambio/)).toHaveTextContent('Observaciones: Faltó cambio Se avisó al gerente')
      expect(screen.queryByText('El arqueo y el resumen de cobros se ven cuando el turno se cierra')).not.toBeInTheDocument()
    })

    it('cada caja en el orden de la API, con su fondo y la tabla del arqueo: diferencias con palabras', async () => {
      await abrir()

      const cajas = within(seccion('Cajas')).getAllByRole('region')
      expect(cajas.map((c) => c.getAttribute('aria-label'))).toEqual(['Caja Barra', 'Caja Terraza'])
      expect(within(cajas[0]).getByText(/Fondo inicial/).closest('p')).toHaveTextContent('Barra · Fondo inicial $5.000')
      expect(within(cajas[1]).getByText(/Fondo inicial/).closest('p')).toHaveTextContent('Terraza · Fondo inicial $1.000')

      const arqueo = within(cajas[0]).getByRole('table', { name: 'Arqueo de Barra' })
      expect(filasDe(arqueo)).toEqual([
        ['Método', 'Esperado', 'Declarado', 'Diferencia'],
        ['Efectivo', '$6.000', '$5.500', 'Faltan $500'],
        ['Débito', '$2.000', '$2.000', 'Sin diferencia'],
        ['Crédito', '$1.000', '$1.120,50', 'Sobran $120,50'],
        ['Transferencia', '$0', '$0', 'Sin diferencia'],
      ])
      expect(within(arqueo).getAllByRole('columnheader').map((th) => th.getAttribute('scope'))).toEqual(['col', 'col', 'col', 'col'])
      expect(within(arqueo).getAllByRole('rowheader').map((th) => th.textContent)).toEqual(['Efectivo', 'Débito', 'Crédito', 'Transferencia'])
      expect(within(arqueo).getAllByRole('rowheader').every((th) => th.getAttribute('scope') === 'row')).toBe(true)
    })

    it('los movimientos de cada caja con fecha, tipo con palabras, monto, motivo y quién; y sus totales', async () => {
      await abrir()

      const barra = seccion('Caja Barra')
      expect(filasDe(within(barra).getByRole('table', { name: 'Movimientos de Barra' }))).toEqual([
        ['Fecha', 'Tipo', 'Monto', 'Motivo', 'Cargó'],
        [formatearFechaHoraCompleta('2026-11-18T13:00:00.000Z'), 'Ingreso', '$1.000,50', 'Cambio', 'Ana'],
        [formatearFechaHoraCompleta('2026-11-18T14:05:00.000Z'), 'Egreso', '$250', 'Hielo', 'Ana'],
      ])
      expect(within(barra).getByText('Total de ingresos: $1.000,50 · Total de egresos: $250')).toBeInTheDocument()

      const terraza = seccion('Caja Terraza')
      expect(within(terraza).getByText('Sin movimientos')).toBeInTheDocument()
      expect(within(terraza).queryByText(/Total de ingresos/)).not.toBeInTheDocument()
    })

    it('una caja cerrada sin arqueo lo dice, sin romper', async () => {
      turnosApi.detalle.mockResolvedValue({ ...CERRADO, cajas: [caja('Barra', { arqueo: null })] })
      await abrir()

      expect(within(seccion('Caja Barra')).getByText('No hay arqueo de esta caja')).toBeInTheDocument()
      expect(screen.queryByRole('table', { name: 'Arqueo de Barra' })).not.toBeInTheDocument()
    })

    it('el resumen: cobrado por método con el total y por mozo ("Sin mozo"), con la propina siempre en su columna', async () => {
      await abrir()

      expect(filasDe(tabla('Cobrado por método'))).toEqual([
        ['Método', 'Cantidad', 'Monto', 'Propina'],
        ['Efectivo', '3', '$4.500', '$300'],
        ['Débito', '1', '$2.000', '$0'],
        ['Crédito', '0', '$0', '$0'],
        ['Transferencia', '0', '$0', '$0'],
        ['Total', '4', '$6.500', '$300'],
      ])
      expect(filasDe(tabla('Cobrado por mozo'))).toEqual([
        ['Mozo', 'Cantidad', 'Monto', 'Propina'],
        ['Zoe', '3', '$5.000', '$300'],
        ['Sin mozo', '1', '$1.500', '$0'],
      ])
    })

    it('Mercado Pago aparte, con la aclaración, desde–hasta, cantidad, monto, propina y los pagos ("Requiere revisión", "Sin caja")', async () => {
      await abrir()

      const mp = seccion('Mercado Pago')
      expect(within(mp).getByText('Informativo: lo cobrado con Mercado Pago se acredita en la cuenta y no entra al arqueo.')).toBeInTheDocument()
      expect(within(mp).getByText(
        `Del ${formatearFechaHoraCompleta(ABIERTO_EN)} al ${formatearFechaHoraCompleta(CERRADO_EN)}: 2 cobros, monto $3.000, propina $150`,
      )).toBeInTheDocument()
      expect(filasDe(within(mp).getByRole('table', { name: 'Pagos de Mercado Pago' }))).toEqual([
        ['Fecha', 'Mesa', 'Caja', 'Monto', 'Propina', 'Revisión'],
        [formatearFechaHoraCompleta('2026-11-18T20:00:00.000Z'), '7', 'Barra', '$2.000', '$150', ''],
        [formatearFechaHoraCompleta('2026-11-18T21:15:00.000Z'), '9', 'Sin caja', '$1.000', '$0', 'Requiere revisión'],
      ])
    })

    it('sin cobros por mozo no hay tabla por mozo; un solo cobro de Mercado Pago y sin pagos en la lista se dicen así', async () => {
      turnosApi.resumen.mockResolvedValue({ ...RESUMEN, porMozo: [], mercadoPago: { ...RESUMEN.mercadoPago, cantidad: 1, pagos: [] } })
      await abrir()

      expect(screen.queryByRole('table', { name: 'Cobrado por mozo' })).not.toBeInTheDocument()
      const mp = seccion('Mercado Pago')
      expect(within(mp).getByText(/: 1 cobro, monto/)).toBeInTheDocument()
      expect(within(mp).getByText('Sin pagos de Mercado Pago en el turno.')).toBeInTheDocument()
      expect(within(mp).queryByRole('table')).not.toBeInTheDocument()
    })

    it('las mesas asignadas por mozo, los mozos por nombre y las mesas en orden natural', async () => {
      await abrir()

      expect(within(seccion('Mesas asignadas')).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ana: mesa 3', 'Zoe: mesas 2, 10'])
    })
  })

  describe('un turno abierto (arqueo ciego)', () => {
    it('no pide el resumen y lo avisa', async () => {
      turnosApi.detalle.mockResolvedValue(ABIERTO)
      await abrir()

      expect(turnosApi.resumen).not.toHaveBeenCalled()
      expect(screen.getByText('El arqueo y el resumen de cobros se ven cuando el turno se cierra')).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Resumen de cobros' })).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Mercado Pago' })).not.toBeInTheDocument()
    })

    it('muestra el encabezado con "Abierto", las cajas con su fondo y los movimientos sin sumas ni arqueo, y las mesas', async () => {
      turnosApi.detalle.mockResolvedValue(ABIERTO)
      await abrir()

      const turno = screen.getByRole('article')
      expect(within(turno).getByText('Abierto')).toBeInTheDocument()
      expect(within(turno).queryByText(/^Cerrado/)).not.toBeInTheDocument()
      expect(within(turno).queryByText(/Observaciones/)).not.toBeInTheDocument()

      const barra = seccion('Caja Barra')
      expect(within(barra).getByText(/Fondo inicial/).closest('p')).toHaveTextContent('Barra · Fondo inicial $5.000')
      expect(within(barra).getByRole('table', { name: 'Movimientos de Barra' })).toBeInTheDocument()
      expect(within(barra).queryByRole('table', { name: 'Arqueo de Barra' })).not.toBeInTheDocument()
      expect(barra).not.toHaveTextContent(/Total de|Faltan|Sobran|Sin diferencia|No hay arqueo/)

      expect(within(seccion('Mesas asignadas')).getByText('Sin mesas asignadas: todas las ven todos los mozos.')).toBeInTheDocument()
    })
  })
})
