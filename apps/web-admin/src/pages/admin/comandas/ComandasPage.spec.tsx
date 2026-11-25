import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { Comanda } from '@menyu/types'
import { api, ApiError } from '../../../services/api'
import { ComandasPage } from './ComandasPage'

let restauranteActual: string | null = 'rest-1'

vi.mock('@menyu/auth-client', async () => (await import('../../../test/authClient')).moduloSimulado())
vi.mock('../../../store/contextStore', () => ({
  useContextStore: () => ({ selectedRestauranteId: restauranteActual }),
}))
// `ApiError` queda el real; solo se simula el objeto `api`.
vi.mock('../../../services/api', async () => ({
  ...(await vi.importActual<typeof import('../../../services/api')>('../../../services/api')),
  api: { comandas: { listar: vi.fn(), crear: vi.fn(), actualizar: vi.fn() } },
}))

const comandasApi = vi.mocked(api.comandas)

const comanda = (id: string, nombre: string, activa = true): Comanda => ({ id, restauranteId: 'rest-1', nombre, activa })
// Como las manda el backend: por nombre, activas e inactivas juntas.
const BARRA = comanda('k-barra', 'Barra')
const COCINA = comanda('k-cocina', 'Cocina')
const VIEJA = comanda('k-vieja', 'Parrilla vieja', false)
const COMANDAS = [BARRA, COCINA, VIEJA]

const REPETIDO = 'Ya hay una comanda con ese nombre en este restaurante'
const SIMULTANEA = 'Otra operación modificó esto al mismo tiempo; probá de nuevo'
const PLATOS_PLURAL = 'La comanda tiene 3 platos asignados: cambialos de comanda antes de desactivarla'
const PLATOS_SINGULAR = 'La comanda tiene 1 plato asignado: cambialo de comanda antes de desactivarla'

function pendiente<T>() {
  let resolver!: (valor: T) => void
  const promesa = new Promise<T>((res) => { resolver = res })
  return { promesa, resolver }
}

/** Monta la pantalla y espera, dentro de act, a que terminen las lecturas. */
async function abrir() {
  const vista = render(<ComandasPage />)
  await act(async () => {})
  return vista
}

const filas = () => within(screen.getByRole('list', { name: 'Comandas del restaurante' })).getAllByRole('listitem')
/** La fila de una comanda de COMANDAS por su posición (en edición la fila no muestra el nombre como texto). */
const fila = (nombre: string) => filas()[COMANDAS.findIndex((c) => c.nombre === nombre)]
const boton = (nombre: string) => screen.getByRole('button', { name: nombre })
const campoDeAlta = () => screen.getByLabelText('Nombre de la comanda') as HTMLInputElement
/** Hace click y espera, dentro de act, lo que haga la respuesta. */
const tocar = (elemento: HTMLElement) => act(async () => { fireEvent.click(elemento) })

beforeEach(() => {
  vi.resetAllMocks()
  restauranteActual = 'rest-1'
  comandasApi.listar.mockResolvedValue(COMANDAS)
  comandasApi.crear.mockResolvedValue(comanda('k-nueva', 'Nueva'))
  comandasApi.actualizar.mockResolvedValue(BARRA)
})

describe('ComandasPage', () => {
  describe('la lista', () => {
    it('sin restaurante elegido no lee nada ni muestra un error', async () => {
      restauranteActual = null
      await abrir()

      expect(screen.getByText('Seleccioná un restaurante para ver las comandas')).toBeInTheDocument()
      expect(comandasApi.listar).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('mientras lee lo dice; después muestra activas e inactivas en el orden del backend, sin bloqueos', async () => {
      render(<ComandasPage />)
      expect(screen.getByRole('status', { name: 'Cargando las comandas' })).toBeInTheDocument()
      await act(async () => {})

      expect(comandasApi.listar).toHaveBeenCalledWith('rest-1')
      expect(filas().map((f) => f.querySelector('span')?.textContent)).toEqual(['Barra', 'Cocina', 'Parrilla vieja'])
      expect(within(fila('Parrilla vieja')).getByText('Inactiva')).toBeInTheDocument()
      expect(within(fila('Barra')).queryByText('Inactiva')).not.toBeInTheDocument()
      expect(screen.queryByText('Abierta en el turno')).not.toBeInTheDocument()
      expect(boton('Activar «Parrilla vieja»')).toBeEnabled()
      expect(boton('Desactivar «Barra»')).toBeEnabled()
      expect(boton('Desactivar «Barra»')).not.toHaveAccessibleDescription()
      expect(screen.queryByRole('button', { name: 'Desactivar «Parrilla vieja»' })).not.toBeInTheDocument()
    })

    it('sin comandas lo dice', async () => {
      comandasApi.listar.mockResolvedValue([])
      await abrir()

      expect(screen.getByText(/^Todavía no hay comandas\. Creá la primera/)).toBeInTheDocument()
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
    })

    it('si la lectura falla muestra el error con "Reintentar", que la vuelve a leer', async () => {
      comandasApi.listar.mockRejectedValueOnce(new ApiError(403, 'Sin acceso'))
      await abrir()

      const alerta = screen.getByRole('alert')
      expect(alerta).toHaveTextContent('Sin acceso')
      await tocar(within(alerta).getByRole('button', { name: 'Reintentar' }))

      expect(filas()).toHaveLength(3)
      expect(comandasApi.listar).toHaveBeenCalledTimes(2)
    })

    it('un error de lectura sin mensaje muestra uno genérico', async () => {
      comandasApi.listar.mockRejectedValueOnce('se cortó')
      await abrir()

      expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron leer las comandas')
    })
  })

  describe('el alta', () => {
    it('crea con el nombre recortado, vacía el campo y vuelve a leer la lista', async () => {
      await abrir()

      fireEvent.change(campoDeAlta(), { target: { value: '  Barra 2  ' } })
      await tocar(boton('Agregar comanda'))

      expect(comandasApi.crear).toHaveBeenCalledWith('rest-1', 'Barra 2')
      expect(campoDeAlta().value).toBe('')
      expect(comandasApi.listar).toHaveBeenCalledTimes(2)
    })

    it('el campo tiene su etiqueta y admite hasta 40 caracteres', async () => {
      await abrir()

      expect(campoDeAlta()).toHaveAttribute('maxLength', '40')
    })

    it('vacío avisa junto al campo y no llama a la API', async () => {
      await abrir()

      fireEvent.change(campoDeAlta(), { target: { value: '   ' } })
      await tocar(boton('Agregar comanda'))

      expect(campoDeAlta()).toHaveAttribute('aria-invalid', 'true')
      expect(campoDeAlta()).toHaveAccessibleDescription('Escribí el nombre de la comanda')
      expect(comandasApi.crear).not.toHaveBeenCalled()
    })

    it('40 caracteres se crea; 41 (pegados, sin pasar por el maxLength) avisa y no llama a la API', async () => {
      await abrir()

      fireEvent.change(campoDeAlta(), { target: { value: 'a'.repeat(41) } })
      await tocar(boton('Agregar comanda'))
      expect(screen.getByRole('alert')).toHaveTextContent('El nombre admite hasta 40 caracteres')
      expect(comandasApi.crear).not.toHaveBeenCalled()

      fireEvent.change(campoDeAlta(), { target: { value: 'a'.repeat(40) } })
      await tocar(boton('Agregar comanda'))
      expect(comandasApi.crear).toHaveBeenCalledWith('rest-1', 'a'.repeat(40))
    })

    it('el 409 de nombre repetido va junto al campo, con el texto del backend, y no relee', async () => {
      comandasApi.crear.mockRejectedValueOnce(new ApiError(409, REPETIDO))
      await abrir()

      fireEvent.change(campoDeAlta(), { target: { value: 'Barra' } })
      await tocar(boton('Agregar comanda'))

      expect(campoDeAlta()).toHaveAccessibleDescription(REPETIDO)
      expect(campoDeAlta().value).toBe('Barra')
      expect(comandasApi.listar).toHaveBeenCalledTimes(1)
    })

    it('sin respuesta del servidor dice que no se pudo crear', async () => {
      comandasApi.crear.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      await abrir()

      fireEvent.change(campoDeAlta(), { target: { value: 'Nueva' } })
      await tocar(boton('Agregar comanda'))

      expect(screen.getByRole('alert')).toHaveTextContent('No se pudo crear la comanda')
    })
  })

  describe('renombrar', () => {
    const campoDeLaFila = (nombre: string) => within(fila(nombre)).getByLabelText('Nombre de la comanda') as HTMLInputElement

    it('se edita en la fila con el foco en el campo; guarda recortado, relee y el foco vuelve a "Renombrar"', async () => {
      await abrir()

      fireEvent.click(boton('Renombrar «Barra»'))
      expect(campoDeLaFila('Barra')).toHaveFocus()
      expect(campoDeLaFila('Barra').value).toBe('Barra')

      fireEvent.change(campoDeLaFila('Barra'), { target: { value: '  Barra nueva ' } })
      await tocar(within(fila('Barra')).getByRole('button', { name: 'Guardar' }))

      expect(comandasApi.actualizar).toHaveBeenCalledWith('k-barra', { nombre: 'Barra nueva' })
      expect(comandasApi.listar).toHaveBeenCalledTimes(2)
      expect(boton('Renombrar «Barra»')).toHaveFocus()
    })

    it('sin cambios se cierra sin llamar a la API', async () => {
      await abrir()

      fireEvent.click(boton('Renombrar «Barra»'))
      fireEvent.change(campoDeLaFila('Barra'), { target: { value: ' Barra  ' } })
      await tocar(within(fila('Barra')).getByRole('button', { name: 'Guardar' }))

      expect(comandasApi.actualizar).not.toHaveBeenCalled()
      expect(comandasApi.listar).toHaveBeenCalledTimes(1)
      expect(boton('Renombrar «Barra»')).toHaveFocus()
    })

    it('"Cancelar" cierra sin llamar a la API y devuelve el foco', async () => {
      await abrir()

      fireEvent.click(boton('Renombrar «Barra»'))
      fireEvent.click(within(fila('Barra')).getByRole('button', { name: 'Cancelar' }))

      expect(comandasApi.actualizar).not.toHaveBeenCalled()
      expect(boton('Renombrar «Barra»')).toHaveFocus()
    })

    it('el 409 de nombre repetido va junto al campo de la fila y la edición sigue abierta', async () => {
      comandasApi.actualizar.mockRejectedValueOnce(new ApiError(409, REPETIDO))
      await abrir()

      fireEvent.click(boton('Renombrar «Barra»'))
      fireEvent.change(campoDeLaFila('Barra'), { target: { value: 'Cocina' } })
      await tocar(within(fila('Barra')).getByRole('button', { name: 'Guardar' }))

      expect(campoDeLaFila('Barra')).toHaveAccessibleDescription(REPETIDO)
      expect(campoDeLaFila('Barra')).toHaveAttribute('aria-invalid', 'true')
      expect(comandasApi.listar).toHaveBeenCalledTimes(1)
    })

    it('un 404 dice "Comanda no encontrada" y relee la lista', async () => {
      comandasApi.actualizar.mockRejectedValueOnce(new ApiError(404, 'Comanda no encontrada'))
      await abrir()

      fireEvent.click(boton('Renombrar «Barra»'))
      fireEvent.change(campoDeLaFila('Barra'), { target: { value: 'Otra' } })
      await tocar(within(fila('Barra')).getByRole('button', { name: 'Guardar' }))

      expect(within(fila('Barra')).getByRole('alert')).toHaveTextContent('Comanda no encontrada')
      expect(comandasApi.listar).toHaveBeenCalledTimes(2)
    })
  })

  describe('activar y desactivar', () => {
    it('activar va directo, manda activa: true y relee', async () => {
      await abrir()

      await tocar(boton('Activar «Parrilla vieja»'))

      expect(comandasApi.actualizar).toHaveBeenCalledWith('k-vieja', { activa: true })
      expect(comandasApi.listar).toHaveBeenCalledTimes(2)
    })

    it('desactivar pide confirmación en la fila; "Confirmar" manda activa: false y relee', async () => {
      await abrir()

      fireEvent.click(boton('Desactivar «Barra»'))
      expect(within(fila('Barra')).getByText(/Ya no se va a poder asignar a platos nuevos/)).toBeInTheDocument()
      expect(comandasApi.actualizar).not.toHaveBeenCalled()

      await tocar(within(fila('Barra')).getByRole('button', { name: 'Confirmar' }))

      expect(comandasApi.actualizar).toHaveBeenCalledWith('k-barra', { activa: false })
      expect(comandasApi.listar).toHaveBeenCalledTimes(2)
      expect(within(fila('Barra')).queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
    })

    it.each([
      ['en plural', PLATOS_PLURAL],
      ['en singular', PLATOS_SINGULAR],
    ])('el 409 de platos asignados (%s) se muestra en la fila, relee y cierra la confirmación', async (_caso, mensaje) => {
      comandasApi.actualizar.mockRejectedValueOnce(new ApiError(409, mensaje))
      await abrir()

      fireEvent.click(boton('Desactivar «Barra»'))
      await tocar(within(fila('Barra')).getByRole('button', { name: 'Confirmar' }))

      expect(within(fila('Barra')).getByRole('alert')).toHaveTextContent(mensaje)
      expect(comandasApi.listar).toHaveBeenCalledTimes(2)
      expect(within(fila('Barra')).queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
      expect(boton('Desactivar «Barra»')).toBeEnabled()
      // No es un error del nombre: el campo de alta no lo recibe.
      expect(campoDeAlta()).toHaveAttribute('aria-invalid', 'false')
      expect(campoDeAlta()).not.toHaveAccessibleDescription(mensaje)
    })

    it('el 409 de operación simultánea es un error común: se muestra, no relee y la confirmación sigue', async () => {
      comandasApi.actualizar.mockRejectedValueOnce(new ApiError(409, SIMULTANEA))
      await abrir()

      fireEvent.click(boton('Desactivar «Barra»'))
      await tocar(within(fila('Barra')).getByRole('button', { name: 'Confirmar' }))

      expect(within(fila('Barra')).getByRole('alert')).toHaveTextContent(SIMULTANEA)
      expect(within(fila('Barra')).getByRole('button', { name: 'Confirmar' })).toBeEnabled()
      expect(comandasApi.listar).toHaveBeenCalledTimes(1)
    })

    it('un error al activar sin respuesta del servidor muestra uno genérico', async () => {
      comandasApi.actualizar.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      await abrir()

      await tocar(boton('Activar «Parrilla vieja»'))

      expect(within(fila('Parrilla vieja')).getByRole('alert')).toHaveTextContent('No se pudo activar la comanda')
    })
  })

  describe('lecturas que se cruzan', () => {
    it('una lectura vieja que llega tarde no pisa a la nueva', async () => {
      const vieja = pendiente<Comanda[]>()
      comandasApi.listar.mockReturnValueOnce(vieja.promesa).mockResolvedValueOnce([BARRA])
      await abrir()

      comandasApi.listar.mockResolvedValue([BARRA])
      fireEvent.change(campoDeAlta(), { target: { value: 'Nueva' } })
      await tocar(boton('Agregar comanda'))
      expect(filas()).toHaveLength(1)

      await act(async () => { vieja.resolver(COMANDAS) })

      expect(filas()).toHaveLength(1)
    })
  })
})
