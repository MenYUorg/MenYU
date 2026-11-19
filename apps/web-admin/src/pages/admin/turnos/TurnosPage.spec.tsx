import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import type { CajaDelHistorial, FilaDeArqueo, PaginaDeTurnos, TurnoDelHistorial } from '@menyu/types'
import { formatearFechaHoraCompleta } from '@menyu/ui/caja'
import { api, ApiError } from '../../../services/api'
import { TurnosPage } from './TurnosPage'

let restauranteActual: string | null = 'rest-1'

vi.mock('@menyu/auth-client', async () => (await import('../../../test/authClient')).moduloSimulado())
vi.mock('../../../store/contextStore', () => ({
  useContextStore: () => ({ selectedRestauranteId: restauranteActual }),
}))
// `ApiError` queda el real; solo se simula el objeto `api`.
vi.mock('../../../services/api', async () => ({
  ...(await vi.importActual<typeof import('../../../services/api')>('../../../services/api')),
  api: { turnos: { listar: vi.fn() } },
}))

const listar = vi.mocked(api.turnos.listar)

const ANA = { id: 'u-ana', nombre: 'Ana' }
const JUAN = { id: 'u-juan', nombre: 'Juan' }

const fila = (metodo: FilaDeArqueo['metodo'], diferencia = 0): FilaDeArqueo => ({ metodo, esperado: 1000, declarado: 1000 + diferencia, diferencia })
const SIN_DIFERENCIAS = [fila('efectivo'), fila('debito'), fila('credito'), fila('transferencia')]

const caja = (nombre: string, cambios: Partial<CajaDelHistorial> = {}): CajaDelHistorial => ({
  id: `tc-${nombre}`,
  cajaId: `c-${nombre}`,
  nombre,
  fondoInicial: 5000,
  arqueo: SIN_DIFERENCIAS,
  movimientos: { cantidad: 0, ingresos: 0, egresos: 0 },
  ...cambios,
})

const turno = (id: string, abiertoEn: string, cambios: Partial<TurnoDelHistorial> = {}): TurnoDelHistorial => ({
  id,
  abiertoEn,
  abiertoPor: ANA,
  cerradoEn: '2026-11-18T23:30:00.000Z',
  cerradoPor: JUAN,
  observaciones: null,
  cajas: [caja('Barra')],
  ...cambios,
})

// Del más nuevo al más viejo, como los manda el backend.
const T3 = turno('t3', '2026-11-18T12:00:00.000Z', { cerradoEn: null, cerradoPor: null, cajas: [caja('Barra', { arqueo: null, movimientos: { cantidad: 2, ingresos: 700, egresos: 100 } })] })
const T2 = turno('t2', '2026-11-17T12:00:00.000Z')
const T1 = turno('t1', '2025-12-31T12:00:00.000Z')

const pagina = (items: TurnoDelHistorial[], siguiente: string | null = null): PaginaDeTurnos => ({ items, siguiente })

function pendiente<T>() {
  let resolver!: (valor: T) => void
  let rechazar!: (error: unknown) => void
  const promesa = new Promise<T>((res, rej) => { resolver = res; rechazar = rej })
  return { promesa, resolver, rechazar }
}

function Detalle() {
  return <p>Detalle del turno {useParams().id}</p>
}

const vista = () => (
  <MemoryRouter initialEntries={['/admin/turnos']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/admin/turnos" element={<TurnosPage />} />
      <Route path="/admin/turnos/:id" element={<Detalle />} />
    </Routes>
  </MemoryRouter>
)

/** Monta la pantalla y espera, dentro de act, a que terminen las lecturas. */
async function abrir() {
  const montada = render(vista())
  await act(async () => {})
  return montada
}

const tarjetas = () => within(screen.getByRole('list', { name: 'Turnos de caja' })).getAllByRole('article')
const titulos = () => tarjetas().map((t) => within(t).getByRole('heading').textContent)
const tarjeta = (id: string) => screen.getByRole('article', { name: `Turno del ${formatearFechaHoraCompleta([T1, T2, T3].find((t) => t.id === id)!.abiertoEn)}` })
const boton = (nombre: string) => screen.getByRole('button', { name: nombre })
/** Hace click y espera, dentro de act, lo que haga la respuesta. */
const tocar = (elemento: HTMLElement) => act(async () => { fireEvent.click(elemento) })
const titulo = (t: TurnoDelHistorial) => `Turno del ${formatearFechaHoraCompleta(t.abiertoEn)}`

beforeEach(() => {
  // reset y no clear: una respuesta `mockReturnValueOnce` que un test no usó no pasa al siguiente.
  vi.resetAllMocks()
  restauranteActual = 'rest-1'
  listar.mockResolvedValue(pagina([T3, T2, T1]))
})

describe('TurnosPage', () => {
  describe('la lectura', () => {
    it('sin restaurante elegido no lee nada ni muestra un error', async () => {
      restauranteActual = null
      await abrir()

      expect(screen.getByText('Seleccioná un restaurante para ver los turnos de caja')).toBeInTheDocument()
      expect(listar).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('mientras lee lo dice; después muestra los turnos en el orden de la API, sin pedir otra página', async () => {
      render(vista())
      expect(screen.getByRole('status', { name: 'Cargando los turnos' })).toBeInTheDocument()
      await act(async () => {})

      expect(listar).toHaveBeenCalledTimes(1)
      expect(listar).toHaveBeenCalledWith('rest-1')
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(titulos()).toEqual([titulo(T3), titulo(T2), titulo(T1)])
      expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument()
    })

    it('sin turnos lo dice', async () => {
      listar.mockResolvedValue(pagina([]))
      await abrir()

      expect(screen.getByText('Todavía no hubo turnos. Se abren desde la app del personal, en Caja.')).toBeInTheDocument()
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
    })

    it('si la lectura falla muestra el error con "Reintentar", que la vuelve a leer', async () => {
      listar.mockRejectedValueOnce(new ApiError(403, 'Sin acceso'))
      await abrir()

      const alerta = screen.getByRole('alert')
      expect(alerta).toHaveTextContent('Sin acceso')
      await tocar(within(alerta).getByRole('button', { name: 'Reintentar' }))

      expect(tarjetas()).toHaveLength(3)
      expect(listar).toHaveBeenCalledTimes(2)
    })

    it('un error de lectura sin mensaje muestra uno genérico', async () => {
      listar.mockRejectedValueOnce('se cortó')
      await abrir()

      expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron leer los turnos')
    })
  })

  describe('"Cargar más"', () => {
    it('pide la página con el cursor `siguiente` y AGREGA sus turnos a los ya cargados; sin más páginas, el botón desaparece', async () => {
      listar.mockResolvedValueOnce(pagina([T3, T2], 't1')).mockResolvedValueOnce(pagina([T1]))
      await abrir()
      expect(titulos()).toEqual([titulo(T3), titulo(T2)])

      await tocar(boton('Cargar más'))

      expect(listar).toHaveBeenLastCalledWith('rest-1', 't1')
      expect(titulos()).toEqual([titulo(T3), titulo(T2), titulo(T1)])
      expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument()
    })

    it('mientras carga queda deshabilitado; si la página trae otro cursor, el siguiente pedido lo usa', async () => {
      const segunda = pendiente<PaginaDeTurnos>()
      listar.mockResolvedValueOnce(pagina([T3], 't2')).mockReturnValueOnce(segunda.promesa).mockResolvedValueOnce(pagina([T1]))
      await abrir()

      await tocar(boton('Cargar más'))
      expect(boton('Cargar más')).toBeDisabled()

      await act(async () => segunda.resolver(pagina([T2], 't1')))
      expect(boton('Cargar más')).toBeEnabled()
      await tocar(boton('Cargar más'))

      expect(listar.mock.calls).toEqual([['rest-1'], ['rest-1', 't2'], ['rest-1', 't1']])
      expect(titulos()).toEqual([titulo(T3), titulo(T2), titulo(T1)])
    })

    it('un error conserva lo ya cargado y ofrece "Reintentar", que vuelve a pedir la misma página', async () => {
      listar
        .mockResolvedValueOnce(pagina([T3, T2], 't1'))
        .mockRejectedValueOnce(new ApiError(400, 'El cursor no es un turno de este restaurante'))
        .mockResolvedValueOnce(pagina([T1]))
      await abrir()

      await tocar(boton('Cargar más'))

      const alerta = screen.getByRole('alert')
      expect(alerta).toHaveTextContent('El cursor no es un turno de este restaurante')
      expect(titulos()).toEqual([titulo(T3), titulo(T2)])
      expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument()

      await tocar(within(alerta).getByRole('button', { name: 'Reintentar' }))

      expect(listar).toHaveBeenLastCalledWith('rest-1', 't1')
      expect(titulos()).toEqual([titulo(T3), titulo(T2), titulo(T1)])
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('un error sin mensaje muestra uno genérico', async () => {
      listar.mockResolvedValueOnce(pagina([T3], 't2')).mockRejectedValueOnce(undefined)
      await abrir()

      await tocar(boton('Cargar más'))

      expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron leer más turnos')
    })
  })

  describe('"Actualizar"', () => {
    it('descarta lo cargado y vuelve a leer la primera página', async () => {
      const primera = pendiente<PaginaDeTurnos>()
      listar.mockResolvedValueOnce(pagina([T3], 't2')).mockResolvedValueOnce(pagina([T2], 't1')).mockReturnValueOnce(primera.promesa)
      await abrir()
      await tocar(boton('Cargar más'))
      expect(titulos()).toEqual([titulo(T3), titulo(T2)])

      await tocar(boton('Actualizar'))

      expect(screen.getByRole('status', { name: 'Cargando los turnos' })).toBeInTheDocument()
      expect(screen.queryByRole('list', { name: 'Turnos de caja' })).not.toBeInTheDocument()
      expect(listar).toHaveBeenLastCalledWith('rest-1')

      await act(async () => primera.resolver(pagina([T3], 't2')))
      expect(titulos()).toEqual([titulo(T3)])
    })

    it('una página de "Cargar más" que llega después de "Actualizar" no se agrega', async () => {
      const mas = pendiente<PaginaDeTurnos>()
      listar.mockResolvedValueOnce(pagina([T3], 't2')).mockReturnValueOnce(mas.promesa).mockResolvedValueOnce(pagina([T3], 't2'))
      await abrir()
      await tocar(boton('Cargar más'))

      await tocar(boton('Actualizar'))
      await act(async () => mas.resolver(pagina([T2], 't1')))

      expect(titulos()).toEqual([titulo(T3)])
      expect(boton('Cargar más')).toBeEnabled()
    })

    it('un error de "Cargar más" que llega después de "Actualizar" no se muestra', async () => {
      const mas = pendiente<PaginaDeTurnos>()
      listar.mockResolvedValueOnce(pagina([T3], 't2')).mockReturnValueOnce(mas.promesa).mockResolvedValueOnce(pagina([T3], 't2'))
      await abrir()
      await tocar(boton('Cargar más'))

      await tocar(boton('Actualizar'))
      await act(async () => mas.rechazar(new Error('Se cortó')))

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(titulos()).toEqual([titulo(T3)])
    })

    it('una lectura vieja que llega tarde no pisa a la nueva', async () => {
      const vieja = pendiente<PaginaDeTurnos>()
      listar.mockReturnValueOnce(vieja.promesa).mockResolvedValueOnce(pagina([T2]))
      render(vista())

      await tocar(boton('Actualizar'))
      expect(titulos()).toEqual([titulo(T2)])

      await act(async () => vieja.resolver(pagina([T3, T1])))
      expect(titulos()).toEqual([titulo(T2)])
    })
  })

  describe('el cambio de restaurante', () => {
    it('lo del anterior no vale: se lee el nuevo desde la primera página y la respuesta del anterior no pisa', async () => {
      const delAnterior = pendiente<PaginaDeTurnos>()
      listar.mockResolvedValueOnce(pagina([T3], 't2')).mockReturnValueOnce(delAnterior.promesa).mockResolvedValueOnce(pagina([T1]))
      const { rerender } = await abrir()
      await tocar(boton('Cargar más'))

      restauranteActual = 'rest-2'
      rerender(vista())
      expect(screen.getByRole('status', { name: 'Cargando los turnos' })).toBeInTheDocument()
      await act(async () => {})

      expect(listar).toHaveBeenLastCalledWith('rest-2')
      expect(titulos()).toEqual([titulo(T1)])

      await act(async () => delAnterior.resolver(pagina([T2])))
      expect(titulos()).toEqual([titulo(T1)])
      expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument()
    })

    it('una lectura del restaurante anterior que llega tarde no pisa la del nuevo', async () => {
      const delAnterior = pendiente<PaginaDeTurnos>()
      listar.mockReturnValueOnce(delAnterior.promesa).mockResolvedValueOnce(pagina([T1]))
      const { rerender } = render(vista())

      restauranteActual = 'rest-2'
      rerender(vista())
      await act(async () => {})
      await act(async () => delAnterior.resolver(pagina([T3])))

      expect(titulos()).toEqual([titulo(T1)])
    })
  })

  describe('cada turno', () => {
    it('cerrado: cuándo y quién lo abrió y lo cerró, el badge "Cerrado" y, por caja, el fondo, las diferencias con palabras y los movimientos', async () => {
      const cerrado = turno('t2', T2.abiertoEn, {
        observaciones: 'Faltó cambio\nSe avisó al gerente',
        cajas: [
          caja('Terraza', { fondoInicial: 1000, arqueo: [fila('efectivo', -500), fila('debito'), fila('credito', 120.5), fila('transferencia')], movimientos: { cantidad: 3, ingresos: 1500.5, egresos: 200 } }),
          caja('Barra'),
        ],
      })
      listar.mockResolvedValue(pagina([cerrado]))
      await abrir()

      const t = tarjeta('t2')
      expect(within(t).getByText(`Abierto el ${formatearFechaHoraCompleta(T2.abiertoEn)} por Ana`)).toBeInTheDocument()
      expect(within(t).getByText(`Cerrado el ${formatearFechaHoraCompleta(T2.cerradoEn!)} por Juan`)).toBeInTheDocument()
      expect(within(t).getByText('Cerrado')).toBeInTheDocument()
      expect(within(t).queryByText('Abierto')).not.toBeInTheDocument()
      expect(within(t).getByText(/Faltó cambio/)).toHaveTextContent('Observaciones: Faltó cambio Se avisó al gerente')

      const [terraza, barra] = Array.from(within(t).getByRole('list', { name: 'Cajas del turno' }).children) as HTMLElement[]
      expect(terraza).toHaveTextContent('Terraza · Fondo inicial $1.000')
      expect(within(within(terraza).getByRole('list', { name: 'Diferencias del arqueo de Terraza' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Efectivo: Faltan $500', 'Crédito: Sobran $120,50'])
      expect(terraza).toHaveTextContent('3 movimientos: ingresos $1.500,50, egresos $200')
      expect(barra).toHaveTextContent('Barra · Fondo inicial $5.000')
      expect(within(barra).getByText('Sin diferencias')).toBeInTheDocument()
      expect(within(barra).getByText('Sin movimientos')).toBeInTheDocument()
      expect(within(t).queryByText('El arqueo se ve cuando el turno se cierra')).not.toBeInTheDocument()
    })

    it('abierto: el badge "Abierto" y, por caja, solo el fondo; ni arqueo ni totales de movimientos (arqueo ciego)', async () => {
      const abierto = turno('t3', T3.abiertoEn, {
        cerradoEn: null,
        cerradoPor: null,
        // Aunque la API mandara un arqueo, con el turno abierto no se muestra.
        cajas: [caja('Barra', { arqueo: [fila('efectivo', -500)], movimientos: { cantidad: 2, ingresos: 700, egresos: 100 } })],
      })
      listar.mockResolvedValue(pagina([abierto]))
      await abrir()

      const t = tarjeta('t3')
      expect(within(t).getByText('Abierto')).toBeInTheDocument()
      expect(within(t).queryByText('Cerrado')).not.toBeInTheDocument()
      expect(within(t).queryByText(/^Cerrado el/)).not.toBeInTheDocument()
      expect(within(t).getByRole('list', { name: 'Cajas del turno' })).toHaveTextContent('Barra · Fondo inicial $5.000El arqueo se ve cuando el turno se cierra')
      expect(within(t).getByText('El arqueo se ve cuando el turno se cierra')).toBeInTheDocument()
      expect(t).not.toHaveTextContent(/Faltan|Sobran|Sin diferencias|movimiento|ingresos|egresos|\$700|\$100/)
      expect(within(t).queryByText(/Observaciones/)).not.toBeInTheDocument()
    })

    it('cerrado sin quién lo cerró dice solo cuándo; una caja cerrada sin arqueo lo dice sin romper', async () => {
      const raro = turno('t1', T1.abiertoEn, { cerradoPor: null, cajas: [caja('Barra', { arqueo: null })] })
      listar.mockResolvedValue(pagina([raro]))
      await abrir()

      const t = tarjeta('t1')
      expect(within(t).getByText(`Cerrado el ${formatearFechaHoraCompleta(T1.cerradoEn!)}`)).toBeInTheDocument()
      expect(within(t).getByText('No hay arqueo de esta caja')).toBeInTheDocument()
      expect(within(t).getByText('Sin movimientos')).toBeInTheDocument()
    })

    it('"Ver detalle" lleva al detalle del turno, con la fecha de apertura en su nombre accesible', async () => {
      const raro = turno('t/1', T1.abiertoEn)
      listar.mockResolvedValue(pagina([raro]))
      await abrir()

      const enlace = screen.getByRole('link', { name: `Ver detalle del turno del ${formatearFechaHoraCompleta(T1.abiertoEn)}` })
      expect(enlace).toHaveTextContent('Ver detalle')
      expect(enlace).toHaveAttribute('href', '/admin/turnos/t%2F1')

      await tocar(enlace)

      expect(screen.getByText('Detalle del turno t/1')).toBeInTheDocument()
    })
  })
})
