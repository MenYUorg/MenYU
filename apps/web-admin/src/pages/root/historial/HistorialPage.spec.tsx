import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, api } from '../../../services/api'
import { cuenta, itemDeHistorial, paginaDeHistorial, promesaManual } from '../../../test/root'
import { HistorialPage } from './HistorialPage'

vi.mock('@menyu/auth', () => ({ TOKEN_KEY: 'menyu_access_token', REFRESH_KEY: 'menyu_refresh_token', resolveLoginUrl: vi.fn() }))
vi.mock('../../../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../services/api')>()
  const { apiFalsa } = await import('../../../test/root')
  return { ...original, api: apiFalsa }
})

const historial = vi.mocked(api.root.historial)
const cuentas = vi.mocked(api.root.cuentas)

// 15/10 12:30 y 15/10 23:30 (esta es del 16 en UTC) caen el mismo día en Buenos Aires; la de las 03:00 UTC ya es del 16.
const DEL_16 = itemDeHistorial({ id: 30, cuando: '2026-10-16T03:00:00.000Z', accion: 'RESTAURANTE_BAJA', entidadTipo: 'RESTAURANTE', entidadNombre: 'Centro', cambios: [] })
const NOCHE_DEL_15 = itemDeHistorial({ id: 20, cuando: '2026-10-16T02:30:00.000Z', accion: 'MARCA_EDITAR', cambios: [{ campo: 'nombre', antes: 'La Parrilla', despues: 'La Parrilla Grande' }] })
const MEDIODIA_DEL_15 = itemDeHistorial({ id: 10 })

const lista = () => screen.getByRole('region', { name: 'Acciones de ROOT' })

beforeEach(() => {
  vi.clearAllMocks()
  cuentas.listar.mockResolvedValue([cuenta(), cuenta({ id: 'root-2', email: 'otro@menyu.com', esPropia: false })])
  historial.listar.mockResolvedValue(paginaDeHistorial([DEL_16, NOCHE_DEL_15, MEDIODIA_DEL_15]))
})

async function cargada() {
  render(<HistorialPage />)
  await screen.findByRole('region', { name: 'Acciones de ROOT' })
}

describe('HistorialPage', () => {
  describe('la lista', () => {
    it('pide la primera página sin filtros', async () => {
      await cargada()

      expect(historial.listar).toHaveBeenCalledTimes(1)
      expect(historial.listar).toHaveBeenCalledWith({})
    })

    it('agrupa por día en hora de Buenos Aires, de lo más nuevo a lo más viejo', async () => {
      await cargada()

      const dias = Array.from(lista().querySelectorAll('.h-dia')).map((d) => d.textContent)
      expect(dias).toEqual(['16 de octubre de 2026', '15 de octubre de 2026'])
      expect(lista().querySelectorAll('.h-fila')).toHaveLength(3)
      // la de las 02:30 UTC del 16 se ve del 15, a las 23:30
      const filasDel15 = lista().querySelectorAll('.h-grupo')[1].querySelectorAll('.h-hora')
      expect(Array.from(filasDel15).map((h) => h.textContent)).toEqual(['23:30', '12:30'])
    })

    it('cada fila dice qué se hizo, quién y sobre qué', async () => {
      await cargada()

      expect(within(lista()).getByText('Creó la marca')).toBeInTheDocument()
      expect(within(lista()).getByText('Dio de baja el restaurante')).toBeInTheDocument()
      expect(within(lista()).getAllByText('root@menyu.com')).toHaveLength(3)
      expect(within(lista()).getByText('Restaurante')).toBeInTheDocument()
      expect(within(lista()).getByText('Centro')).toBeInTheDocument()
      expect(within(lista()).getAllByText('La Parrilla').length).toBeGreaterThan(0)
    })

    it('una acción hecha con el script se distingue de las de la consola', async () => {
      historial.listar.mockResolvedValue(
        paginaDeHistorial([itemDeHistorial({ id: 5, actorTipo: 'SCRIPT', actorNombre: 'margarita', accion: 'ROOT_CREAR', entidadTipo: 'ROOT', entidadNombre: 'nuevo@menyu.com', marcaId: null, marcaNombre: null })]),
      )
      await cargada()

      expect(within(lista()).getByText('Script')).toBeInTheDocument()
      expect(within(lista()).getByText('operador: margarita')).toBeInTheDocument()
      expect(within(lista()).getByText('Creó la cuenta ROOT')).toBeInTheDocument()
    })

    it('un código de acción que no conoce se muestra tal cual', async () => {
      historial.listar.mockResolvedValue(paginaDeHistorial([itemDeHistorial({ accion: 'INVITACION_ENVIAR', entidadTipo: 'OWNER' })]))
      await cargada()

      expect(within(lista()).getByText('INVITACION_ENVIAR')).toBeInTheDocument()
    })

    it('un registro sin marca no muestra una marca vacía', async () => {
      historial.listar.mockResolvedValue(paginaDeHistorial([itemDeHistorial({ marcaId: null, marcaNombre: null, entidadNombre: 'root2@menyu.com' })]))
      await cargada()

      expect(lista().querySelectorAll('.h-sobre small')).toHaveLength(0)
    })
  })

  describe('el detalle de los cambios', () => {
    it('arranca cerrado y se abre y se cierra con el botón', async () => {
      await cargada()
      const boton = screen.getByRole('button', { name: /Ver los cambios de «Editó la marca»/ })
      expect(boton).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText('Antes')).not.toBeInTheDocument()

      await userEvent.click(boton)

      expect(boton).toHaveAttribute('aria-expanded', 'true')
      expect(boton).toHaveAccessibleName(/Ocultar los cambios de «Editó la marca»/)
      expect(screen.getByText('nombre')).toBeInTheDocument()
      expect(screen.getByText('Antes').parentElement).toHaveTextContent('La Parrilla')
      expect(screen.getByText('Después').parentElement).toHaveTextContent('La Parrilla Grande')

      await userEvent.click(boton)
      expect(screen.queryByText('Antes')).not.toBeInTheDocument()
    })

    it('"no había nada" se ve como una raya', async () => {
      await cargada()

      await userEvent.click(screen.getByRole('button', { name: /Ver los cambios de «Creó la marca»/ }))

      expect(screen.getByText('Antes').parentElement).toHaveTextContent('—')
      expect(screen.getByText('Después').parentElement).toHaveTextContent('La Parrilla')
    })

    it('el pie dice el número de la acción y cuándo fue, en hora de Buenos Aires', async () => {
      await cargada()

      await userEvent.click(screen.getByRole('button', { name: /Ver los cambios de «Creó la marca»/ }))

      expect(screen.getByText('Acción 10 · 15 de octubre de 2026, 12:30 h')).toBeInTheDocument()
    })

    it('una acción sin cambios guardados lo aclara', async () => {
      await cargada()

      await userEvent.click(screen.getByRole('button', { name: /Ver los cambios de «Dio de baja el restaurante»/ }))

      expect(screen.getByText('Esta acción no guardó el detalle de los cambios.')).toBeInTheDocument()
    })

    it('se pueden abrir varias a la vez', async () => {
      await cargada()

      await userEvent.click(screen.getByRole('button', { name: /Ver los cambios de «Creó la marca»/ }))
      await userEvent.click(screen.getByRole('button', { name: /Ver los cambios de «Editó la marca»/ }))

      expect(screen.getAllByText('Antes')).toHaveLength(2)
    })
  })

  describe('los filtros', () => {
    it('"Quién" ofrece las cuentas ROOT (la propia marcada) y el script', async () => {
      await cargada()

      const opciones = within(screen.getByLabelText('Quién')).getAllByRole('option')
      expect(opciones.map((o) => o.textContent)).toEqual(['Todos', 'root@menyu.com (vos)', 'otro@menyu.com', 'Script (línea de comandos)'])
      expect(opciones.map((o) => (o as HTMLOptionElement).value)).toEqual(['', 'root@menyu.com', 'otro@menyu.com', 'script'])
    })

    it('si no se pueden cargar las cuentas, el filtro sigue con "Todos" y "Script"', async () => {
      cuentas.listar.mockRejectedValue(new ApiError(500, 'Error 500'))
      await cargada()

      const opciones = within(screen.getByLabelText('Quién')).getAllByRole('option')
      expect(opciones.map((o) => o.textContent)).toEqual(['Todos', 'Script (línea de comandos)'])
    })

    it('elegir una persona vuelve a pedir con su email', async () => {
      await cargada()

      await userEvent.selectOptions(screen.getByLabelText('Quién'), 'otro@menyu.com')

      await screen.findByRole('region', { name: 'Acciones de ROOT' })
      expect(historial.listar).toHaveBeenLastCalledWith({ actor: 'otro@menyu.com' })
    })

    it('elegir el script manda "script"', async () => {
      await cargada()

      await userEvent.selectOptions(screen.getByLabelText('Quién'), 'script')

      await screen.findByRole('region', { name: 'Acciones de ROOT' })
      expect(historial.listar).toHaveBeenLastCalledWith({ actor: 'script' })
    })

    it('"Sobre qué" filtra por tipo', async () => {
      await cargada()

      await userEvent.selectOptions(screen.getByLabelText('Sobre qué'), 'OWNER')

      await screen.findByRole('region', { name: 'Acciones de ROOT' })
      expect(historial.listar).toHaveBeenLastCalledWith({ entidad: 'OWNER' })
    })

    it('"Desde" y "Hasta" mandan los días tal como se eligieron', async () => {
      await cargada()

      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } })
      fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-15' } })

      await screen.findByRole('region', { name: 'Acciones de ROOT' })
      expect(historial.listar).toHaveBeenLastCalledWith({ desde: '2026-10-01', hasta: '2026-10-15' })
    })

    it('un solo día (desde = hasta) es válido', async () => {
      await cargada()

      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-15' } })
      fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-15' } })

      await screen.findByRole('region', { name: 'Acciones de ROOT' })
      expect(screen.queryByText(/No puede ser anterior/)).not.toBeInTheDocument()
      expect(historial.listar).toHaveBeenLastCalledWith({ desde: '2026-10-15', hasta: '2026-10-15' })
    })

    it('"Hasta" anterior a "Desde" se avisa sin llamar a la API con ese rango', async () => {
      await cargada()
      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-15' } })
      await screen.findByRole('region', { name: 'Acciones de ROOT' })
      const llamadasAntes = historial.listar.mock.calls.length

      fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } })

      expect(await screen.findByText('No puede ser anterior a «Desde».')).toBeInTheDocument()
      expect(screen.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true')
      expect(historial.listar).toHaveBeenCalledTimes(llamadasAntes)
      expect(screen.queryByText(/Ninguna acción coincide/)).not.toBeInTheDocument()
      expect(screen.queryByText('Todavía no hay acciones registradas')).not.toBeInTheDocument()
    })

    it('corregir el rango vuelve a pedir', async () => {
      await cargada()
      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-15' } })
      fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } })
      await screen.findByText('No puede ser anterior a «Desde».')

      fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-20' } })

      await screen.findByRole('region', { name: 'Acciones de ROOT' })
      expect(historial.listar).toHaveBeenLastCalledWith({ desde: '2026-10-15', hasta: '2026-10-20' })
    })

    it('"Limpiar filtros" aparece solo con filtros puestos y los saca todos', async () => {
      await cargada()
      expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
      await userEvent.selectOptions(screen.getByLabelText('Sobre qué'), 'MARCA')
      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } })
      await screen.findByRole('region', { name: 'Acciones de ROOT' })

      await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

      expect(screen.getByLabelText('Sobre qué')).toHaveValue('')
      expect(screen.getByLabelText('Desde')).toHaveValue('')
      await screen.findByRole('region', { name: 'Acciones de ROOT' })
      expect(historial.listar).toHaveBeenLastCalledWith({})
      expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
    })
  })

  describe('estados', () => {
    it('muestra la carga', () => {
      historial.listar.mockReturnValue(new Promise(() => {}))
      render(<HistorialPage />)

      expect(screen.getByLabelText('Cargando')).toBeInTheDocument()
    })

    it('sin ninguna acción registrada lo dice', async () => {
      historial.listar.mockResolvedValue(paginaDeHistorial([]))
      render(<HistorialPage />)

      expect(await screen.findByText('Todavía no hay acciones registradas')).toBeInTheDocument()
      expect(screen.queryByText(/Ninguna acción coincide/)).not.toBeInTheDocument()
    })

    it('con filtros y sin resultados lo dice y ofrece limpiarlos', async () => {
      await cargada()
      historial.listar.mockResolvedValue(paginaDeHistorial([]))

      await userEvent.selectOptions(screen.getByLabelText('Sobre qué'), 'ROOT')

      expect(await screen.findByText('Ninguna acción coincide con los filtros')).toBeInTheDocument()
      expect(screen.queryByText('Todavía no hay acciones registradas')).not.toBeInTheDocument()
      historial.listar.mockResolvedValue(paginaDeHistorial([MEDIODIA_DEL_15]))
      const botones = screen.getAllByRole('button', { name: 'Limpiar filtros' })
      await userEvent.click(botones[botones.length - 1])
      expect(await screen.findByRole('region', { name: 'Acciones de ROOT' })).toBeInTheDocument()
    })

    it('un error de carga permite reintentar', async () => {
      historial.listar.mockRejectedValueOnce(new ApiError(500, 'Error 500'))
      render(<HistorialPage />)

      expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los datos.')
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

      expect(await screen.findByRole('region', { name: 'Acciones de ROOT' })).toBeInTheDocument()
    })

    it('sin red lo dice', async () => {
      historial.listar.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      render(<HistorialPage />)

      expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión.')
    })

    it('siempre recuerda que el historial no se puede editar ni borrar', async () => {
      await cargada()

      expect(screen.getByText(/no se puede editar ni borrar/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /borrar|eliminar|editar/i })).not.toBeInTheDocument()
    })
  })

  describe('cargar más', () => {
    const PAGINA_2 = paginaDeHistorial([itemDeHistorial({ id: 5, accion: 'MARCA_REACTIVAR', cuando: '2026-10-14T15:00:00.000Z' })], null)

    it('con una sola página no hay botón ni cartel de final', async () => {
      await cargada()

      expect(screen.queryByRole('button', { name: /Cargar más/ })).not.toBeInTheDocument()
      expect(screen.queryByText('Llegaste al principio del historial.')).not.toBeInTheDocument()
    })

    it('pide las siguientes con el cursor y las suma al final', async () => {
      historial.listar.mockResolvedValueOnce(paginaDeHistorial([DEL_16, MEDIODIA_DEL_15], 10)).mockResolvedValueOnce(PAGINA_2)
      await cargada()

      await userEvent.click(screen.getByRole('button', { name: /Cargar más/ }))

      expect(await within(lista()).findByText('Reactivó la marca')).toBeInTheDocument()
      expect(historial.listar).toHaveBeenLastCalledWith({ cursor: 10 })
      expect(lista().querySelectorAll('.h-fila')).toHaveLength(3)
      expect(Array.from(lista().querySelectorAll('.h-dia')).map((d) => d.textContent)).toEqual([
        '16 de octubre de 2026',
        '15 de octubre de 2026',
        '14 de octubre de 2026',
      ])
    })

    it('al llegar al final desaparece el botón y avisa que no hay más', async () => {
      historial.listar.mockResolvedValueOnce(paginaDeHistorial([DEL_16], 30)).mockResolvedValueOnce(PAGINA_2)
      await cargada()

      await userEvent.click(screen.getByRole('button', { name: /Cargar más/ }))

      expect(await screen.findByText('Llegaste al principio del historial.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Cargar más/ })).not.toBeInTheDocument()
    })

    it('un día que sigue en la página siguiente no se parte en dos grupos', async () => {
      const otraDelMismoDia = itemDeHistorial({ id: 4, cuando: '2026-10-15T13:00:00.000Z' })
      historial.listar.mockResolvedValueOnce(paginaDeHistorial([MEDIODIA_DEL_15], 10)).mockResolvedValueOnce(paginaDeHistorial([otraDelMismoDia], null))
      await cargada()

      await userEvent.click(screen.getByRole('button', { name: /Cargar más/ }))

      await screen.findByText('Llegaste al principio del historial.')
      expect(lista().querySelectorAll('.h-dia')).toHaveLength(1)
      expect(lista().querySelectorAll('.h-fila')).toHaveLength(2)
    })

    it('mientras carga, el botón no se puede volver a tocar (una sola pedido)', async () => {
      const lenta = promesaManual<ReturnType<typeof paginaDeHistorial>>()
      historial.listar.mockResolvedValueOnce(paginaDeHistorial([DEL_16], 30)).mockReturnValueOnce(lenta.promesa)
      await cargada()

      await userEvent.click(screen.getByRole('button', { name: /Cargar más/ }))
      const cargando = screen.getByRole('button', { name: 'Cargando…' })
      await userEvent.click(cargando)

      expect(cargando).toBeDisabled()
      expect(historial.listar).toHaveBeenCalledTimes(2)
      lenta.resolver(PAGINA_2)
      expect(await screen.findByText('Llegaste al principio del historial.')).toBeInTheDocument()
    })

    it('si falla, avisa, conserva lo que ya se veía y deja reintentar', async () => {
      historial.listar
        .mockResolvedValueOnce(paginaDeHistorial([DEL_16], 30))
        .mockRejectedValueOnce(new ApiError(500, 'Error 500'))
        .mockResolvedValueOnce(PAGINA_2)
      await cargada()

      await userEvent.click(screen.getByRole('button', { name: /Cargar más/ }))

      expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar más.')
      expect(within(lista()).getByText('Dio de baja el restaurante')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /Cargar más/ }))
      expect(await screen.findByText('Llegaste al principio del historial.')).toBeInTheDocument()
      expect(screen.queryByText('No pudimos cargar más.')).not.toBeInTheDocument()
    })

    it('cambiar un filtro descarta lo acumulado y empieza de cero', async () => {
      historial.listar
        .mockResolvedValueOnce(paginaDeHistorial([DEL_16], 30))
        .mockResolvedValueOnce(PAGINA_2)
        .mockResolvedValueOnce(paginaDeHistorial([MEDIODIA_DEL_15], null))
      await cargada()
      await userEvent.click(screen.getByRole('button', { name: /Cargar más/ }))
      await screen.findByText('Llegaste al principio del historial.')

      await userEvent.selectOptions(screen.getByLabelText('Sobre qué'), 'MARCA')

      await within(lista()).findByText('Creó la marca')
      expect(lista().querySelectorAll('.h-fila')).toHaveLength(1)
      expect(screen.queryByText('Llegaste al principio del historial.')).not.toBeInTheDocument()
    })

    it('una página que llega tarde de los filtros anteriores no se suma a la lista nueva', async () => {
      const tarde = promesaManual<ReturnType<typeof paginaDeHistorial>>()
      historial.listar
        .mockResolvedValueOnce(paginaDeHistorial([DEL_16], 30))
        .mockReturnValueOnce(tarde.promesa)
        .mockResolvedValueOnce(paginaDeHistorial([MEDIODIA_DEL_15], null))
      await cargada()
      await userEvent.click(screen.getByRole('button', { name: /Cargar más/ }))

      await userEvent.selectOptions(screen.getByLabelText('Sobre qué'), 'MARCA')
      await within(lista()).findByText('Creó la marca')
      tarde.resolver(PAGINA_2)
      await new Promise((r) => setTimeout(r, 20))

      expect(within(lista()).queryByText('Reactivó la marca')).not.toBeInTheDocument()
      expect(lista().querySelectorAll('.h-fila')).toHaveLength(1)
      expect(screen.queryByText('Llegaste al principio del historial.')).not.toBeInTheDocument()
    })

    it('una respuesta tardía de los filtros anteriores no apaga el "Cargando…" del pedido nuevo', async () => {
      const tardeA = promesaManual<ReturnType<typeof paginaDeHistorial>>()
      const pedidoB = promesaManual<ReturnType<typeof paginaDeHistorial>>()
      historial.listar
        .mockResolvedValueOnce(paginaDeHistorial([DEL_16], 30))
        .mockReturnValueOnce(tardeA.promesa)
        .mockResolvedValueOnce(paginaDeHistorial([MEDIODIA_DEL_15], 10))
        .mockReturnValueOnce(pedidoB.promesa)
      await cargada()
      await userEvent.click(screen.getByRole('button', { name: /Cargar más/ }))
      await userEvent.selectOptions(screen.getByLabelText('Sobre qué'), 'MARCA')
      await within(lista()).findByText('Creó la marca')
      await userEvent.click(screen.getByRole('button', { name: /Cargar más/ }))
      expect(screen.getByRole('button', { name: 'Cargando…' })).toBeDisabled()

      tardeA.resolver(PAGINA_2)
      await new Promise((r) => setTimeout(r, 20))

      expect(screen.getByRole('button', { name: 'Cargando…' })).toBeDisabled()
      expect(historial.listar).toHaveBeenCalledTimes(4)
      pedidoB.resolver(paginaDeHistorial([itemDeHistorial({ id: 3, accion: 'MARCA_BAJA' })], null))
      expect(await screen.findByText('Llegaste al principio del historial.')).toBeInTheDocument()
      expect(within(lista()).queryByText('Reactivó la marca')).not.toBeInTheDocument()
    })

    it('un error que llega tarde de los filtros anteriores no ensucia la lista nueva', async () => {
      const tarde = promesaManual<ReturnType<typeof paginaDeHistorial>>()
      historial.listar
        .mockResolvedValueOnce(paginaDeHistorial([DEL_16], 30))
        .mockReturnValueOnce(tarde.promesa)
        .mockResolvedValueOnce(paginaDeHistorial([MEDIODIA_DEL_15], null))
      await cargada()
      await userEvent.click(screen.getByRole('button', { name: /Cargar más/ }))

      await userEvent.selectOptions(screen.getByLabelText('Sobre qué'), 'MARCA')
      await within(lista()).findByText('Creó la marca')
      tarde.rechazar(new ApiError(500, 'Error 500'))
      await new Promise((r) => setTimeout(r, 20))

      expect(screen.queryByText('No pudimos cargar más.')).not.toBeInTheDocument()
    })
  })
})
