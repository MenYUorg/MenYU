import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InformacionLocal, PreguntaFrecuente, Restaurante } from '@menyu/types'
import { useContextStore } from '../../../store/contextStore'
import { perfilDeGerente, perfilDeOwner, reiniciarSesionDePrueba, sesionDePrueba } from '../../../test/authClient'
import { AsistentePage } from './AsistentePage'

vi.mock('@menyu/auth-client', async () => (await import('../../../test/authClient')).moduloSimulado())

// Con el `api` real y `fetch` simulado: así se ve el método, la ruta y el cuerpo exactos que le llegan a la API.
const URL_INFORMACION = '/restaurantes/rest-1/informacion-local'
const URL_PREGUNTAS = '/restaurantes/rest-1/preguntas-frecuentes'

let informacion: InformacionLocal
let preguntas: PreguntaFrecuente[]
/** Respuestas de error por `"MÉTODO ruta"`, para los casos en que la API falla. */
let fallas: Record<string, { status: number; cuerpo: unknown }>

const fetchFalso = vi.fn()

function respuesta(cuerpo: unknown, status = 200) {
  return { ok: status < 400, status, json: () => Promise.resolve(cuerpo) } as Response
}

function servidor(url: string, opciones: RequestInit): Response {
  const metodo = opciones.method ?? 'GET'
  const falla = fallas[`${metodo} ${url}`]
  if (falla) return respuesta(falla.cuerpo, falla.status)
  const cuerpo = typeof opciones.body === 'string' ? (JSON.parse(opciones.body) as Record<string, unknown>) : {}

  if (url === URL_INFORMACION) {
    if (metodo === 'PUT') informacion = { ...informacion, ...cuerpo }
    return respuesta(informacion)
  }
  if (url === URL_PREGUNTAS) {
    if (metodo === 'POST') {
      const nueva = { id: `faq-${preguntas.length + 1}`, ...cuerpo, createdAt: '2026-11-01T12:00:00.000Z', updatedAt: '2026-11-01T12:00:00.000Z' }
      preguntas = [...preguntas, nueva as PreguntaFrecuente]
      return respuesta(nueva, 201)
    }
    return respuesta(preguntas)
  }
  return respuesta({ statusCode: 404, message: 'Ruta no simulada' }, 404)
}

/** Los cuerpos que llegaron a la API con ese método y esa ruta. */
function enviados(metodo: string, url: string): unknown[] {
  return (fetchFalso.mock.calls as [string, RequestInit][])
    .filter(([u, o]) => u === url && o.method === metodo)
    .map(([, o]) => JSON.parse(o.body as string))
}

async function abrir() {
  render(<AsistentePage />)
  await screen.findByRole('region', { name: 'Información del local' })
}

const tarjeta = (nombre: string) => within(screen.getByRole('region', { name: nombre }))
const servicio = (nombre: string) => within(tarjeta('Información del local').getByRole('radiogroup', { name: nombre }))

beforeEach(() => {
  reiniciarSesionDePrueba()
  sesionDePrueba.perfil = perfilDeOwner()
  useContextStore.setState({
    restaurantes: [{ id: 'rest-1', marcaId: 'marca-1', nombre: 'Restaurante Seed' } as Restaurante],
    selectedRestauranteId: 'rest-1',
  })
  informacion = {
    restauranteId: 'rest-1',
    asistenteHabilitado: false,
    horarios: 'Martes a domingo de 12 a 24',
    formasPago: 'Efectivo',
    wifi: true,
    petFriendly: false,
    accesibleSillaRuedas: null,
    opcionesParaChicos: null,
    estacionamiento: null,
  }
  preguntas = []
  fallas = {}
  fetchFalso.mockReset()
  fetchFalso.mockImplementation((url: string, opciones: RequestInit) => Promise.resolve(servidor(url, opciones)))
  vi.stubGlobal('fetch', fetchFalso)
})

afterEach(() => vi.unstubAllGlobals())

describe('AsistentePage', () => {
  describe('información del local', () => {
    it('carga lo guardado y manda el tri-estado de los servicios y los textos vacíos como null', async () => {
      const user = userEvent.setup()
      await abrir()
      const info = tarjeta('Información del local')

      expect(info.getByLabelText('Horarios')).toHaveValue('Martes a domingo de 12 a 24')
      expect(servicio('Wifi').getByRole('radio', { name: 'Sí' })).toBeChecked()
      expect(servicio('Pet friendly').getByRole('radio', { name: 'No' })).toBeChecked()
      expect(servicio('Estacionamiento').getByRole('radio', { name: 'Sin dato' })).toBeChecked()
      expect(info.getByRole('button', { name: 'Guardar información' })).toBeDisabled()

      await user.clear(info.getByLabelText('Horarios'))
      await user.click(servicio('Wifi').getByRole('radio', { name: 'Sin dato' }))
      await user.click(servicio('Estacionamiento').getByRole('radio', { name: 'No' }))
      await user.click(servicio('Opciones para chicos').getByRole('radio', { name: 'Sí' }))
      await user.click(info.getByRole('button', { name: 'Guardar información' }))

      expect(await info.findByRole('status')).toHaveTextContent('Información guardada')
      expect(enviados('PUT', URL_INFORMACION)).toEqual([{
        horarios: null,
        formasPago: 'Efectivo',
        wifi: null,
        petFriendly: false,
        accesibleSillaRuedas: null,
        opcionesParaChicos: true,
        estacionamiento: false,
      }])
      expect(info.getByRole('button', { name: 'Guardar información' })).toBeDisabled()
    })

    it('el interruptor prende el asistente mandando solo el flag', async () => {
      const user = userEvent.setup()
      await abrir()
      const interruptor = screen.getByRole('switch', { name: 'Asistente en la carta' })
      expect(interruptor).toHaveAttribute('aria-checked', 'false')
      expect(screen.getByText('Apagado: los clientes no ven el asistente.')).toBeInTheDocument()

      await user.click(interruptor)

      await waitFor(() => expect(interruptor).toHaveAttribute('aria-checked', 'true'))
      expect(enviados('PUT', URL_INFORMACION)).toEqual([{ asistenteHabilitado: true }])
      expect(screen.getByText('Prendido: los clientes ven el asistente en la carta.')).toBeInTheDocument()
    })

    it('el gerente ve el estado del interruptor pero no lo puede tocar', async () => {
      // El switch deshabilitado le suma " (no disponible)" a su nombre accesible (ToggleSwitch).
      sesionDePrueba.perfil = perfilDeGerente()
      informacion.asistenteHabilitado = true
      await abrir()

      const interruptor = screen.getByRole('switch', { name: /^Asistente en la carta/ })
      expect(interruptor).toHaveAttribute('aria-disabled', 'true')
      expect(interruptor).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByText('Prendido: los clientes ven el asistente en la carta.')).toBeInTheDocument()
      expect(screen.getByText(/Solo el dueño de la marca puede prenderlo o apagarlo/)).toBeInTheDocument()
      expect(enviados('PUT', URL_INFORMACION)).toEqual([])
    })

    it('si la API responde 403, muestra su mensaje y no da nada por guardado', async () => {
      fallas[`PUT ${URL_INFORMACION}`] = {
        status: 403,
        cuerpo: { statusCode: 403, message: 'No tenés permiso para esta acción', error: 'Forbidden' },
      }
      const user = userEvent.setup()
      await abrir()
      const info = tarjeta('Información del local')

      await user.type(info.getByLabelText('Formas de pago'), ' y débito')
      await user.click(info.getByRole('button', { name: 'Guardar información' }))

      expect(await info.findByRole('alert')).toHaveTextContent('No tenés permiso para esta acción')
      expect(info.queryByRole('status')).not.toBeInTheDocument()
      expect(info.getByLabelText('Formas de pago')).toHaveValue('Efectivo y débito')
      expect(info.getByRole('button', { name: 'Guardar información' })).toBeEnabled()
    })
  })

  describe('preguntas frecuentes', () => {
    it('lista las cargadas y agrega una nueva', async () => {
      preguntas = [{
        id: 'faq-1',
        pregunta: '¿Hacen reservas?',
        respuesta: 'Sí, por WhatsApp.',
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
      }]
      const user = userEvent.setup()
      await abrir()
      const faqs = tarjeta('Preguntas frecuentes')
      expect(faqs.getByText('¿Hacen reservas?')).toBeInTheDocument()
      expect(faqs.getByRole('button', { name: 'Agregar pregunta' })).toBeDisabled()

      await user.type(faqs.getByLabelText('Pregunta'), '  ¿Tienen delivery?  ')
      await user.type(faqs.getByLabelText('Respuesta'), 'No, solo para llevar.')
      await user.click(faqs.getByRole('button', { name: 'Agregar pregunta' }))

      expect(await faqs.findByText('¿Tienen delivery?')).toBeInTheDocument()
      expect(enviados('POST', URL_PREGUNTAS)).toEqual([{ pregunta: '¿Tienen delivery?', respuesta: 'No, solo para llevar.' }])
      expect(faqs.getAllByRole('listitem')).toHaveLength(2)
      expect(faqs.getByLabelText('Pregunta')).toHaveValue('')
      expect(faqs.getByRole('status')).toHaveTextContent('Pregunta agregada')
    })

    it('si la API responde 500, muestra un mensaje propio y no la agrega', async () => {
      fallas[`POST ${URL_PREGUNTAS}`] = { status: 500, cuerpo: { statusCode: 500, message: 'Internal server error' } }
      const user = userEvent.setup()
      await abrir()
      const faqs = tarjeta('Preguntas frecuentes')

      await user.type(faqs.getByLabelText('Pregunta'), '¿Tienen delivery?')
      await user.type(faqs.getByLabelText('Respuesta'), 'No, solo para llevar.')
      await user.click(faqs.getByRole('button', { name: 'Agregar pregunta' }))

      expect(await faqs.findByRole('alert')).toHaveTextContent('No se pudo guardar la pregunta. Probá de nuevo en un rato.')
      expect(faqs.queryByText(/Internal server error/)).not.toBeInTheDocument()
      expect(faqs.getByText(/Todavía no cargaste preguntas frecuentes/)).toBeInTheDocument()
      expect(faqs.getByLabelText('Pregunta')).toHaveValue('¿Tienen delivery?')
    })
  })
})
