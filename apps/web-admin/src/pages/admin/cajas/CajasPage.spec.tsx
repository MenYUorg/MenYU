import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { CajaDelRestaurante } from '@menyu/types'
import { api, ApiError } from '../../../services/api'
import { CajasPage } from './CajasPage'

let restauranteActual: string | null = 'rest-1'

vi.mock('@menyu/auth-client', async () => (await import('../../../test/authClient')).moduloSimulado())
vi.mock('../../../store/contextStore', () => ({
  useContextStore: () => ({ selectedRestauranteId: restauranteActual }),
}))
// `ApiError` queda el real; solo se simula el objeto `api`.
vi.mock('../../../services/api', async () => ({
  ...(await vi.importActual<typeof import('../../../services/api')>('../../../services/api')),
  api: { cajas: { listar: vi.fn(), abiertas: vi.fn(), crear: vi.fn(), actualizar: vi.fn() } },
}))

const cajasApi = vi.mocked(api.cajas)

const caja = (id: string, nombre: string, activa = true): CajaDelRestaurante => ({
  id, restauranteId: 'rest-1', nombre, activa, createdAt: '2026-11-01T10:00:00.000Z',
})
// Como las manda el backend: por nombre, activas e inactivas juntas.
const BARRA = caja('c-barra', 'Barra')
const PRINCIPAL = caja('c-principal', 'Principal')
const VIEJA = caja('c-vieja', 'Terraza vieja', false)
const CAJAS = [BARRA, PRINCIPAL, VIEJA]

const REPETIDO = 'Ya hay una caja con ese nombre en este restaurante'
const SIMULTANEA = 'Otra operación modificó esto al mismo tiempo; probá de nuevo'
const ABIERTA = 'No se puede desactivar una caja con el turno abierto'

function pendiente<T>() {
  let resolver!: (valor: T) => void
  let rechazar!: (error: unknown) => void
  const promesa = new Promise<T>((res, rej) => { resolver = res; rechazar = rej })
  return { promesa, resolver, rechazar }
}

/** Monta la pantalla y espera, dentro de act, a que terminen las lecturas. */
async function abrir() {
  const vista = render(<CajasPage />)
  await act(async () => {})
  return vista
}

const filas = () => within(screen.getByRole('list', { name: 'Cajas del restaurante' })).getAllByRole('listitem')
/** La fila de una caja de CAJAS por su posición (en edición la fila no muestra el nombre como texto). */
const fila = (nombre: string) => filas()[CAJAS.findIndex((c) => c.nombre === nombre)]
const boton = (nombre: string) => screen.getByRole('button', { name: nombre })
const campoDeAlta = () => screen.getByLabelText('Nombre de la caja') as HTMLInputElement
/** Hace click y espera, dentro de act, lo que haga la respuesta. */
const tocar = (elemento: HTMLElement) => act(async () => { fireEvent.click(elemento) })

beforeEach(() => {
  // reset y no clear: una respuesta `mockReturnValueOnce` que un test no usó no pasa al siguiente.
  vi.resetAllMocks()
  restauranteActual = 'rest-1'
  cajasApi.listar.mockResolvedValue(CAJAS)
  cajasApi.abiertas.mockResolvedValue({ cajas: [] })
  cajasApi.crear.mockResolvedValue(caja('c-nueva', 'Nueva'))
  cajasApi.actualizar.mockResolvedValue(BARRA)
})

describe('CajasPage', () => {
  describe('la lista', () => {
    it('sin restaurante elegido no lee nada ni muestra un error', async () => {
      restauranteActual = null
      await abrir()

      expect(screen.getByText('Seleccioná un restaurante para ver las cajas')).toBeInTheDocument()
      expect(cajasApi.listar).not.toHaveBeenCalled()
      expect(cajasApi.abiertas).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('mientras lee lo dice; después muestra activas e inactivas en el orden del backend', async () => {
      render(<CajasPage />)
      expect(screen.getByRole('status', { name: 'Cargando las cajas' })).toBeInTheDocument()
      await act(async () => {})

      expect(cajasApi.listar).toHaveBeenCalledWith('rest-1')
      expect(cajasApi.abiertas).toHaveBeenCalledWith('rest-1')
      expect(screen.getByText('Un turno puede abrir hasta 2 cajas. Una caja no se borra: se desactiva.')).toBeInTheDocument()
      expect(filas().map((f) => f.querySelector('span')?.textContent)).toEqual(['Barra', 'Principal', 'Terraza vieja'])
      expect(within(fila('Terraza vieja')).getByText('Inactiva')).toBeInTheDocument()
      expect(within(fila('Barra')).queryByText('Inactiva')).not.toBeInTheDocument()
      expect(boton('Activar «Terraza vieja»')).toBeEnabled()
      expect(boton('Desactivar «Barra»')).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Desactivar «Terraza vieja»' })).not.toBeInTheDocument()
    })

    it('sin cajas lo dice', async () => {
      cajasApi.listar.mockResolvedValue([])
      await abrir()

      expect(screen.getByText('Todavía no hay cajas. Creá la primera para poder abrir un turno desde la app del personal.')).toBeInTheDocument()
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
    })

    it('si la lectura falla muestra el error con "Reintentar", que la vuelve a leer', async () => {
      cajasApi.listar.mockRejectedValueOnce(new ApiError(403, 'Sin acceso'))
      await abrir()

      const alerta = screen.getByRole('alert')
      expect(alerta).toHaveTextContent('Sin acceso')
      await tocar(within(alerta).getByRole('button', { name: 'Reintentar' }))

      expect(filas()).toHaveLength(3)
      expect(cajasApi.listar).toHaveBeenCalledTimes(2)
    })

    it('un error de lectura sin mensaje muestra uno genérico', async () => {
      cajasApi.listar.mockRejectedValueOnce('se cortó')
      await abrir()

      expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron leer las cajas')
    })
  })

  describe('las cajas abiertas en el turno', () => {
    it('la abierta tiene su etiqueta y no se puede desactivar, con el porqué asociado; las demás sí', async () => {
      cajasApi.abiertas.mockResolvedValue({ cajas: [{ cajaId: 'c-principal', nombre: 'Principal' }] })
      await abrir()

      expect(within(fila('Principal')).getByText('Abierta en el turno')).toBeInTheDocument()
      expect(within(fila('Barra')).queryByText('Abierta en el turno')).not.toBeInTheDocument()
      expect(boton('Desactivar «Principal»')).toBeDisabled()
      expect(boton('Desactivar «Principal»')).toHaveAccessibleDescription(
        'No se puede desactivar con el turno abierto: se cierra desde la app del personal, en Caja',
      )
      expect(boton('Desactivar «Barra»')).toBeEnabled()
      expect(boton('Desactivar «Barra»')).not.toHaveAccessibleDescription()
    })

    it('si no se pudieron leer, no hay etiquetas y desactivar queda habilitado: el 409 del backend se muestra en la fila y relee', async () => {
      cajasApi.abiertas.mockRejectedValue(new Error('Sin conexión'))
      cajasApi.actualizar.mockRejectedValueOnce(new ApiError(409, ABIERTA))
      await abrir()
      expect(screen.queryByText('Abierta en el turno')).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()

      fireEvent.click(boton('Desactivar «Principal»'))
      await tocar(within(fila('Principal')).getByRole('button', { name: 'Confirmar' }))

      expect(within(fila('Principal')).getByRole('alert')).toHaveTextContent(ABIERTA)
      expect(within(fila('Principal')).queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
      expect(cajasApi.listar).toHaveBeenCalledTimes(2)
    })
  })

  describe('el alta', () => {
    it('crea con el nombre recortado, vacía el campo y vuelve a leer la lista', async () => {
      await abrir()

      fireEvent.change(campoDeAlta(), { target: { value: '  Caja nueva  ' } })
      await tocar(boton('Agregar caja'))

      expect(cajasApi.crear).toHaveBeenCalledWith('rest-1', 'Caja nueva')
      expect(campoDeAlta().value).toBe('')
      expect(cajasApi.listar).toHaveBeenCalledTimes(2)
      expect(cajasApi.abiertas).toHaveBeenCalledTimes(2)
    })

    it('el campo tiene su etiqueta y admite hasta 60 caracteres', async () => {
      await abrir()

      expect(campoDeAlta()).toHaveAttribute('maxLength', '60')
    })

    it('vacío avisa junto al campo y no llama a la API; escribir limpia el error', async () => {
      await abrir()

      fireEvent.change(campoDeAlta(), { target: { value: '   ' } })
      await tocar(boton('Agregar caja'))

      expect(campoDeAlta()).toHaveAttribute('aria-invalid', 'true')
      expect(campoDeAlta()).toHaveAccessibleDescription('Escribí el nombre de la caja')
      expect(screen.getByRole('alert')).toHaveTextContent('Escribí el nombre de la caja')
      expect(cajasApi.crear).not.toHaveBeenCalled()

      fireEvent.change(campoDeAlta(), { target: { value: 'B' } })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('60 caracteres se crea; 61 (pegados, sin pasar por el maxLength) avisa y no llama a la API', async () => {
      await abrir()

      fireEvent.change(campoDeAlta(), { target: { value: 'a'.repeat(61) } })
      await tocar(boton('Agregar caja'))
      expect(screen.getByRole('alert')).toHaveTextContent('El nombre admite hasta 60 caracteres')
      expect(cajasApi.crear).not.toHaveBeenCalled()

      fireEvent.change(campoDeAlta(), { target: { value: 'a'.repeat(60) } })
      await tocar(boton('Agregar caja'))
      expect(cajasApi.crear).toHaveBeenCalledWith('rest-1', 'a'.repeat(60))
    })

    it('el 409 de nombre repetido va junto al campo, con el texto del backend, y no relee', async () => {
      cajasApi.crear.mockRejectedValueOnce(new ApiError(409, REPETIDO))
      await abrir()

      fireEvent.change(campoDeAlta(), { target: { value: 'Barra' } })
      await tocar(boton('Agregar caja'))

      expect(campoDeAlta()).toHaveAccessibleDescription(REPETIDO)
      expect(campoDeAlta().value).toBe('Barra')
      expect(cajasApi.listar).toHaveBeenCalledTimes(1)
    })

    it('el 409 de operación simultánea es un error común y se puede reintentar', async () => {
      cajasApi.crear.mockRejectedValueOnce(new ApiError(409, SIMULTANEA))
      await abrir()

      fireEvent.change(campoDeAlta(), { target: { value: 'Nueva' } })
      await tocar(boton('Agregar caja'))

      expect(screen.getByRole('alert')).toHaveTextContent(SIMULTANEA)
      expect(campoDeAlta()).toHaveAttribute('aria-invalid', 'false')
      expect(boton('Agregar caja')).toBeEnabled()

      await tocar(boton('Agregar caja'))
      expect(cajasApi.crear).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('sin respuesta del servidor dice que no se pudo crear', async () => {
      cajasApi.crear.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      await abrir()

      fireEvent.change(campoDeAlta(), { target: { value: 'Nueva' } })
      await tocar(boton('Agregar caja'))

      expect(screen.getByRole('alert')).toHaveTextContent('No se pudo crear la caja')
    })

    it('mientras crea, "Agregar caja" queda deshabilitado', async () => {
      const alta = pendiente<CajaDelRestaurante>()
      cajasApi.crear.mockReturnValueOnce(alta.promesa)
      await abrir()

      fireEvent.change(campoDeAlta(), { target: { value: 'Nueva' } })
      fireEvent.click(boton('Agregar caja'))

      expect(boton('Agregar caja')).toBeDisabled()
      await act(async () => { alta.resolver(caja('c-nueva', 'Nueva')) })
      expect(boton('Agregar caja')).toBeEnabled()
    })
  })

  describe('renombrar', () => {
    const campoDeLaFila = (nombre: string) => within(fila(nombre)).getByLabelText('Nombre de la caja') as HTMLInputElement

    it('se edita en la fila con el foco en el campo; guarda recortado, relee y el foco vuelve a "Renombrar"', async () => {
      await abrir()

      fireEvent.click(boton('Renombrar «Barra»'))
      expect(campoDeLaFila('Barra')).toHaveFocus()
      expect(campoDeLaFila('Barra').value).toBe('Barra')
      expect(campoDeLaFila('Barra')).toHaveAttribute('maxLength', '60')

      fireEvent.change(campoDeLaFila('Barra'), { target: { value: '  Barra nueva ' } })
      await tocar(within(fila('Barra')).getByRole('button', { name: 'Guardar' }))

      expect(cajasApi.actualizar).toHaveBeenCalledWith('c-barra', { nombre: 'Barra nueva' })
      expect(cajasApi.listar).toHaveBeenCalledTimes(2)
      expect(boton('Renombrar «Barra»')).toHaveFocus()
    })

    it('sin cambios (aunque tenga espacios) se cierra sin llamar a la API', async () => {
      await abrir()

      fireEvent.click(boton('Renombrar «Barra»'))
      fireEvent.change(campoDeLaFila('Barra'), { target: { value: ' Barra  ' } })
      await tocar(within(fila('Barra')).getByRole('button', { name: 'Guardar' }))

      expect(cajasApi.actualizar).not.toHaveBeenCalled()
      expect(cajasApi.listar).toHaveBeenCalledTimes(1)
      expect(boton('Renombrar «Barra»')).toHaveFocus()
    })

    it('"Cancelar" cierra sin llamar a la API, limpia el error y devuelve el foco', async () => {
      await abrir()

      fireEvent.click(boton('Renombrar «Barra»'))
      fireEvent.change(campoDeLaFila('Barra'), { target: { value: '' } })
      await tocar(within(fila('Barra')).getByRole('button', { name: 'Guardar' }))
      expect(within(fila('Barra')).getByRole('alert')).toHaveTextContent('Escribí el nombre de la caja')

      fireEvent.click(within(fila('Barra')).getByRole('button', { name: 'Cancelar' }))

      expect(cajasApi.actualizar).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(boton('Renombrar «Barra»')).toHaveFocus()
    })

    it('el 409 de nombre repetido va junto al campo de la fila; la edición sigue abierta y escribir lo limpia', async () => {
      cajasApi.actualizar.mockRejectedValueOnce(new ApiError(409, REPETIDO))
      await abrir()

      fireEvent.click(boton('Renombrar «Barra»'))
      fireEvent.change(campoDeLaFila('Barra'), { target: { value: 'Principal' } })
      await tocar(within(fila('Barra')).getByRole('button', { name: 'Guardar' }))

      expect(campoDeLaFila('Barra')).toHaveAccessibleDescription(REPETIDO)
      expect(campoDeLaFila('Barra')).toHaveAttribute('aria-invalid', 'true')
      expect(cajasApi.listar).toHaveBeenCalledTimes(1)

      fireEvent.change(campoDeLaFila('Barra'), { target: { value: 'Principal 2' } })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('un 404 dice "Caja no encontrada" y relee la lista', async () => {
      cajasApi.actualizar.mockRejectedValueOnce(new ApiError(404, 'Caja no encontrada'))
      await abrir()

      fireEvent.click(boton('Renombrar «Barra»'))
      fireEvent.change(campoDeLaFila('Barra'), { target: { value: 'Otra' } })
      await tocar(within(fila('Barra')).getByRole('button', { name: 'Guardar' }))

      expect(within(fila('Barra')).getByRole('alert')).toHaveTextContent('Caja no encontrada')
      expect(cajasApi.listar).toHaveBeenCalledTimes(2)
    })

    it('mientras guarda, los botones de la fila quedan deshabilitados', async () => {
      const cambio = pendiente<CajaDelRestaurante>()
      cajasApi.actualizar.mockReturnValueOnce(cambio.promesa)
      await abrir()

      fireEvent.click(boton('Renombrar «Barra»'))
      fireEvent.change(campoDeLaFila('Barra'), { target: { value: 'Otra' } })
      fireEvent.click(within(fila('Barra')).getByRole('button', { name: 'Guardar' }))

      expect(within(fila('Barra')).getByRole('button', { name: 'Guardar' })).toBeDisabled()
      expect(within(fila('Barra')).getByRole('button', { name: 'Cancelar' })).toBeDisabled()
      await act(async () => { cambio.resolver(BARRA) })
    })
  })

  describe('activar y desactivar', () => {
    it('activar va directo, manda activa: true y relee', async () => {
      await abrir()

      await tocar(boton('Activar «Terraza vieja»'))

      expect(cajasApi.actualizar).toHaveBeenCalledWith('c-vieja', { activa: true })
      expect(cajasApi.listar).toHaveBeenCalledTimes(2)
    })

    it('desactivar pide confirmación en la fila; "Confirmar" manda activa: false y relee', async () => {
      await abrir()

      fireEvent.click(boton('Desactivar «Barra»'))
      expect(within(fila('Barra')).getByText('¿Desactivar «Barra»? No se va a poder abrir en turnos nuevos. Podés volver a activarla.')).toBeInTheDocument()
      expect(cajasApi.actualizar).not.toHaveBeenCalled()

      await tocar(within(fila('Barra')).getByRole('button', { name: 'Confirmar' }))

      expect(cajasApi.actualizar).toHaveBeenCalledWith('c-barra', { activa: false })
      expect(cajasApi.listar).toHaveBeenCalledTimes(2)
      expect(within(fila('Barra')).queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
    })

    it('"Cancelar" de la confirmación no desactiva', async () => {
      await abrir()

      fireEvent.click(boton('Desactivar «Barra»'))
      fireEvent.click(within(fila('Barra')).getByRole('button', { name: 'Cancelar' }))

      expect(cajasApi.actualizar).not.toHaveBeenCalled()
      expect(within(fila('Barra')).queryByText(/¿Desactivar/)).not.toBeInTheDocument()
    })

    it('el 409 de operación simultánea se muestra en la fila, no relee y se puede reintentar; "Cancelar" lo limpia', async () => {
      cajasApi.actualizar.mockRejectedValueOnce(new ApiError(409, SIMULTANEA))
      await abrir()

      fireEvent.click(boton('Desactivar «Barra»'))
      await tocar(within(fila('Barra')).getByRole('button', { name: 'Confirmar' }))

      expect(within(fila('Barra')).getByRole('alert')).toHaveTextContent(SIMULTANEA)
      expect(within(fila('Barra')).getByRole('button', { name: 'Confirmar' })).toBeEnabled()
      expect(cajasApi.listar).toHaveBeenCalledTimes(1)

      fireEvent.click(within(fila('Barra')).getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('un error al activar se muestra en la fila; sin respuesta, uno genérico', async () => {
      cajasApi.actualizar.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      await abrir()

      await tocar(boton('Activar «Terraza vieja»'))

      expect(within(fila('Terraza vieja')).getByRole('alert')).toHaveTextContent('No se pudo activar la caja')
    })

    it('mientras desactiva, los botones de la fila quedan deshabilitados', async () => {
      const cambio = pendiente<CajaDelRestaurante>()
      cajasApi.actualizar.mockReturnValueOnce(cambio.promesa)
      await abrir()

      fireEvent.click(boton('Desactivar «Barra»'))
      fireEvent.click(within(fila('Barra')).getByRole('button', { name: 'Confirmar' }))

      expect(within(fila('Barra')).getByRole('button', { name: 'Confirmar' })).toBeDisabled()
      expect(within(fila('Barra')).getByRole('button', { name: 'Cancelar' })).toBeDisabled()
      expect(boton('Renombrar «Barra»')).toBeDisabled()
      expect(boton('Desactivar «Barra»')).toBeDisabled()
      expect(boton('Renombrar «Principal»')).toBeEnabled()
      await act(async () => { cambio.resolver(BARRA) })
    })
  })

  describe('lecturas que se cruzan', () => {
    it('una lectura vieja que llega tarde no pisa a la nueva', async () => {
      const vieja = pendiente<CajaDelRestaurante[]>()
      cajasApi.listar.mockReturnValueOnce(vieja.promesa).mockResolvedValueOnce([BARRA])
      await abrir()

      // Se crea una caja mientras la primera lectura sigue en vuelo: la segunda sale después.
      cajasApi.listar.mockResolvedValue([BARRA])
      fireEvent.change(campoDeAlta(), { target: { value: 'Nueva' } })
      await tocar(boton('Agregar caja'))
      expect(filas()).toHaveLength(1)

      await act(async () => { vieja.resolver(CAJAS) })

      expect(filas()).toHaveLength(1)
    })

    it('al cambiar de restaurante, lo del anterior no vale: se lee el nuevo y la respuesta del anterior no pisa', async () => {
      const delAnterior = pendiente<CajaDelRestaurante[]>()
      const delNuevo = pendiente<CajaDelRestaurante[]>()
      cajasApi.listar.mockResolvedValueOnce(CAJAS).mockReturnValueOnce(delAnterior.promesa).mockReturnValueOnce(delNuevo.promesa)
      const { rerender } = await abrir()
      expect(filas()).toHaveLength(3)

      // Una relectura del restaurante 1 queda en vuelo y se cambia al 2.
      fireEvent.click(boton('Activar «Terraza vieja»'))
      await act(async () => {})
      restauranteActual = 'rest-2'
      rerender(<CajasPage />)

      expect(cajasApi.listar).toHaveBeenLastCalledWith('rest-2')
      expect(screen.getByRole('status', { name: 'Cargando las cajas' })).toBeInTheDocument()
      await act(async () => { delAnterior.resolver(CAJAS) })
      expect(screen.getByRole('status', { name: 'Cargando las cajas' })).toBeInTheDocument()

      await act(async () => { delNuevo.resolver([caja('c-otra', 'Del restaurante 2')]) })
      expect(filas().map((f) => f.querySelector('span')?.textContent)).toEqual(['Del restaurante 2'])
    })
  })
})
