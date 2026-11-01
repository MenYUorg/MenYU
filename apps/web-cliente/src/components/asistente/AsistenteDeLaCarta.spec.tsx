import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSessionStore } from '../../store/sessionStore'
import { useAsistenteStore } from './asistenteStore'
import { AsistenteDeLaCarta } from './BotonDelAsistente'

// El chat del asistente de la carta (docs/asistente/specs/asistente.md, Fase 6), con el `api` real y `fetch` simulado:
// la respuesta es un stream SSE como el del backend (el UI message stream del AI SDK).

const fetchFalso = vi.fn()
const CLAVE = 'menyu_asistente:rest-1'

/** Los eventos SSE de estos chunks, como los escribe el AI SDK (`data: <json>` y una línea en blanco). */
const sse = (chunks: unknown[]) => chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')

/** Una respuesta en streaming que el test va soltando de a pedazos, cortados en cualquier lado (como llegan por la red). */
function respuestaEnStreaming() {
  let controlador!: ReadableStreamDefaultController<Uint8Array>
  const cuerpo = new ReadableStream<Uint8Array>({ start: (c) => { controlador = c } })
  const codificador = new TextEncoder()
  return {
    respuesta: new Response(cuerpo, { status: 200, headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } }),
    enviar: (texto: string) => act(async () => { controlador.enqueue(codificador.encode(texto)) }),
    cerrar: () => act(async () => { controlador.close() }),
  }
}

function renderAsistente() {
  render(<AsistenteDeLaCarta restauranteId="rest-1" nombreRestaurante="La Parrilla" habilitado conCarrito={false} />)
}

/** Abre el chat y espera el input (el panel se baja aparte y sube en el cuadro siguiente). */
async function abrirElChat() {
  await userEvent.click(screen.getByRole('button', { name: 'Asistente' }))
  return screen.findByRole('textbox', { name: 'Tu pregunta' })
}

const cuerpoEnviado = () => JSON.parse(fetchFalso.mock.calls[0]?.[1]?.body as string) as unknown

describe('AsistenteDeLaCarta', () => {
  beforeEach(() => {
    fetchFalso.mockReset()
    vi.stubGlobal('fetch', fetchFalso)
    sessionStorage.clear()
    useSessionStore.setState({ sesionId: null, restauranteId: null, jwt: null })
    useAsistenteStore.setState({ restauranteId: null, mensajes: [], enCurso: null, fallido: null })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('manda la pregunta con el token de la mesa y muestra la respuesta en el hilo a medida que llega', async () => {
    useSessionStore.setState({ sesionId: 'ses-1', restauranteId: 'rest-1', jwt: 'jwt.de.la.sesion' })
    const stream = respuestaEnStreaming()
    fetchFalso.mockResolvedValue(stream.respuesta)
    renderAsistente()

    const input = await abrirElChat()
    const dialogo = screen.getByRole('dialog', { name: 'Asistente' })
    expect(within(dialogo).getByText(/Respuestas generadas con IA a partir de los datos del local\. Ante dudas, consultá al mozo\./)).toBeInTheDocument()
    await userEvent.type(input, '¿La provoleta pica?')
    expect(within(dialogo).getByText('19/500')).toBeInTheDocument()
    await userEvent.keyboard('{Enter}')

    // El pedido: la ruta del restaurante, el token de la mesa y la conversación con el formato del backend.
    expect(fetchFalso).toHaveBeenCalledTimes(1)
    const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/asistente\/rest-1\/mensajes$/)
    expect(opciones).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer jwt.de.la.sesion' } })
    expect(cuerpoEnviado()).toEqual({ mensajes: [{ rol: 'usuario', contenido: '¿La provoleta pica?' }] })
    expect(input).toHaveValue('')

    // "Escribiendo" hasta el primer texto, y después el texto a medida que llega (un evento puede venir partido).
    expect(within(dialogo).getByText('El asistente está escribiendo…')).toBeInTheDocument()
    const inicio = sse([{ type: 'start' }, { type: 'start-step' }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'Es picante ' }])
    await stream.enviar(inicio.slice(0, 40))
    await stream.enviar(inicio.slice(40))
    expect(within(dialogo).getByText('Es picante')).toBeInTheDocument()
    expect(within(dialogo).queryByText('El asistente está escribiendo…')).not.toBeInTheDocument()

    await stream.enviar(
      sse([
        { type: 'text-delta', id: 't', delta: '**suave** y es para compartir.' },
        { type: 'text-end', id: 't' },
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'stop' },
      ]) + 'data: [DONE]\n\n',
    )
    await stream.cerrar()

    const hilo = within(dialogo).getByRole('log', { name: 'Conversación con el asistente' })
    await waitFor(() => expect(hilo).toHaveAttribute('aria-busy', 'false'))
    expect(within(hilo).getByText('¿La provoleta pica?')).toBeInTheDocument()
    expect(within(hilo).getByText('suave').tagName).toBe('STRONG')
    expect(hilo).toHaveTextContent('Es picante suave y es para compartir.')
    // Sobrevive un refresh: la conversación queda en sessionStorage, por restaurante.
    expect(JSON.parse(sessionStorage.getItem(CLAVE) ?? 'null')).toEqual([
      { rol: 'usuario', contenido: '¿La provoleta pica?' },
      { rol: 'asistente', contenido: 'Es picante **suave** y es para compartir.' },
    ])
  })

  it.each([
    [429, 'limite_sesion', 'Llegaste al límite de preguntas al asistente en esta mesa. Para otras consultas, preguntale al mozo.'],
    [503, 'no_disponible_hoy', 'El asistente no está disponible por hoy. Para cualquier consulta, preguntale al mozo.'],
  ])('un %i %s muestra su mensaje en el hilo, sin perder la conversación', async (status, codigo, mensaje) => {
    const conversacion = [
      { rol: 'usuario', contenido: '¿Hay wifi?' },
      { rol: 'asistente', contenido: 'Sí, el local tiene wifi.' },
    ]
    sessionStorage.setItem(CLAVE, JSON.stringify(conversacion))
    fetchFalso.mockResolvedValue(
      new Response(JSON.stringify({ codigo, mensaje: 'Texto del servidor' }), { status, headers: { 'content-type': 'application/json' } }),
    )
    renderAsistente()

    const input = await abrirElChat()
    const hilo = screen.getByRole('log', { name: 'Conversación con el asistente' })
    expect(within(hilo).getByText('Sí, el local tiene wifi.')).toBeInTheDocument()
    await userEvent.type(input, '¿Tienen estacionamiento?{Enter}')

    // Sin sesión de mesa no va el token, y la conversación anterior viaja con la pregunta.
    expect(fetchFalso.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization')
    expect(cuerpoEnviado()).toEqual({ mensajes: [...conversacion, { rol: 'usuario', contenido: '¿Tienen estacionamiento?' }] })

    expect(await within(hilo).findByRole('alert')).toHaveTextContent(mensaje)
    // El hilo sigue entero: lo de antes, la pregunta que no tuvo respuesta y el aviso, sin "Reintentar".
    expect(within(hilo).getByText('¿Hay wifi?')).toBeInTheDocument()
    expect(within(hilo).getByText('Sí, el local tiene wifi.')).toBeInTheDocument()
    expect(within(hilo).getByText('¿Tienen estacionamiento?')).toBeInTheDocument()
    expect(within(hilo).queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument()
    // El asistente ya no responde: el input queda deshabilitado, y la pregunta fallida no se guarda.
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Enviar pregunta' })).toBeDisabled()
    expect(JSON.parse(sessionStorage.getItem(CLAVE) ?? 'null')).toEqual(conversacion)
  })
})
