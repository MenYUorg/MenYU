import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSessionStore } from '../../store/sessionStore'
import { axe } from '../../test/axe'
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

/** Una respuesta que llega entera, en un solo pedazo. */
const respuestaEntera = (texto: string) =>
  new Response(
    sse([
      { type: 'start' },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', delta: texto },
      { type: 'text-end', id: 't' },
      { type: 'finish', finishReason: 'stop' },
    ]) + 'data: [DONE]\n\n',
    { status: 200, headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } },
  )

/** La carta de un restaurante con el asistente, con `key` por restaurante como en `MenuView`. */
const carta = (restauranteId: string) => (
  <AsistenteDeLaCarta key={restauranteId} restauranteId={restauranteId} nombreRestaurante="La Parrilla" habilitado conCarrito={false} />
)

function renderAsistente() {
  render(carta('rest-1'))
}

/** Abre el chat y espera el input (el panel se baja aparte y sube en el cuadro siguiente). */
async function abrirElChat() {
  await userEvent.click(screen.getByRole('button', { name: 'Asistente' }))
  return screen.findByRole('textbox', { name: 'Tu pregunta' })
}

/** El texto de la región que le dice al lector qué pasa con la respuesta: la única región viva del chat con ese texto. */
const anuncioDelChat = (dialogo: HTMLElement) => dialogo.querySelector('[role="status"][aria-atomic="true"]')?.textContent ?? ''

/** La compu tiene puntero fino y el celular no: el foco va al campo o a la conversación. jsdom no trae `matchMedia`. */
const conPunteroFino = () => vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: consulta === '(pointer: fine)' }))

const cuerpoEnviado = (llamada = 0) => JSON.parse(fetchFalso.mock.calls[llamada]?.[1]?.body as string) as unknown

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
    // Terminó cuando la conversación se confirma (y se guarda): hasta entonces es la respuesta que va llegando.
    await waitFor(() => expect(sessionStorage.getItem(CLAVE)).not.toBeNull())
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
    // El asistente ya no responde: el input queda de solo lectura (deshabilitado perdería el foco) y el botón de enviar no
    // manda nada (`aria-disabled`: sigue en el orden de Tab). La pregunta fallida no se guarda.
    expect(input).toHaveAttribute('readonly')
    expect(input).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Enviar pregunta' })).toHaveAttribute('aria-disabled', 'true')
    expect(JSON.parse(sessionStorage.getItem(CLAVE) ?? 'null')).toEqual(conversacion)
  })

  it('al volver a un restaurante después de entrar a la carta de otro, sin abrir el chat ahí, la conversación arranca de cero', async () => {
    fetchFalso
      .mockImplementationOnce(() => Promise.resolve(respuestaEntera('Es suave.')))
      .mockImplementationOnce(() => Promise.resolve(respuestaEntera('Sí, hay wifi.')))
    const { rerender } = render(carta('rest-1'))
    await userEvent.type(await abrirElChat(), '¿La provoleta pica?{Enter}')
    expect(await screen.findByText('Es suave.')).toBeInTheDocument()

    // La carta de otro restaurante (el chat ni se abre) y de vuelta a la primera.
    rerender(carta('rest-2'))
    rerender(carta('rest-1'))

    const input = await abrirElChat()
    const hilo = screen.getByRole('log', { name: 'Conversación con el asistente' })
    expect(within(hilo).queryByText('¿La provoleta pica?')).not.toBeInTheDocument()
    expect(within(hilo).queryByText('Es suave.')).not.toBeInTheDocument()
    expect(within(hilo).getByRole('button', { name: '¿Qué me recomendás?' })).toBeInTheDocument()

    // La pregunta siguiente no lleva la conversación de antes, y lo guardado es solo la nueva.
    await userEvent.type(input, '¿Hay wifi?{Enter}')
    expect(cuerpoEnviado(1)).toEqual({ mensajes: [{ rol: 'usuario', contenido: '¿Hay wifi?' }] })
    expect(await within(hilo).findByText('Sí, hay wifi.')).toBeInTheDocument()
    expect(within(hilo).queryByText('¿La provoleta pica?')).not.toBeInTheDocument()
    expect(JSON.parse(sessionStorage.getItem(CLAVE) ?? 'null')).toEqual([
      { rol: 'usuario', contenido: '¿Hay wifi?' },
      { rol: 'asistente', contenido: 'Sí, hay wifi.' },
    ])
  })

  // Etapa 8 del plan de accesibilidad (docs/a11y/auditoria-general.md, cuarta parte: A1 a A12).
  describe('accesibilidad: la respuesta que llega de a poco (A1, A2, A3)', () => {
    it('el lector no oye la respuesta en pedazos: el hilo no anuncia, el texto parcial queda oculto y se dice entera una sola vez al terminar', async () => {
      const stream = respuestaEnStreaming()
      fetchFalso.mockResolvedValue(stream.respuesta)
      renderAsistente()
      const input = await abrirElChat()
      const dialogo = screen.getByRole('dialog', { name: 'Asistente' })
      const hilo = within(dialogo).getByRole('log', { name: 'Conversación con el asistente' })
      // Un `log` anuncia por sí solo cada cosa que se le suma (22 anuncios en una respuesta de 3 s): este no.
      expect(hilo).toHaveAttribute('aria-live', 'off')
      expect(anuncioDelChat(dialogo)).toBe('')

      await userEvent.type(input, '¿La provoleta pica?{Enter}')
      expect(anuncioDelChat(dialogo)).toBe('El asistente está respondiendo…')

      await stream.enviar(sse([{ type: 'start' }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'Es picante ' }]))
      // El texto que llega se ve, pero no se expone al lector, y el anuncio sigue siendo el mismo (no repite el texto).
      expect(within(hilo).getByText('Es picante').closest('[aria-hidden="true"]')).not.toBeNull()
      expect(anuncioDelChat(dialogo)).toBe('El asistente está respondiendo…')

      await stream.enviar(
        sse([
          { type: 'text-delta', id: 't', delta: '**suave** y es para compartir.' },
          { type: 'text-end', id: 't' },
          { type: 'finish', finishReason: 'stop' },
        ]) + 'data: [DONE]\n\n',
      )
      await stream.cerrar()

      // Al terminar: la respuesta entera, una vez, sin las marcas de formato, y la burbuja ya se puede leer.
      await waitFor(() => expect(anuncioDelChat(dialogo)).toBe('El asistente respondió: Es picante suave y es para compartir.'))
      expect(within(hilo).getByText('suave').closest('[aria-hidden="true"]')).toBeNull()
    })

    it('si la pregunta falla, no se vuelve a anunciar la respuesta de antes: solo el aviso, que es una alerta', async () => {
      sessionStorage.setItem(
        CLAVE,
        JSON.stringify([
          { rol: 'usuario', contenido: '¿Hay wifi?' },
          { rol: 'asistente', contenido: 'Sí, el local tiene wifi.' },
        ]),
      )
      fetchFalso.mockRejectedValue(new TypeError('Failed to fetch'))
      renderAsistente()
      const input = await abrirElChat()
      const dialogo = screen.getByRole('dialog', { name: 'Asistente' })

      await userEvent.type(input, '¿Y estacionamiento?{Enter}')

      expect(await within(dialogo).findByRole('alert')).toHaveTextContent('No pudimos conectarnos con el asistente')
      await waitFor(() => expect(anuncioDelChat(dialogo)).toBe(''))
    })

    it('cada burbuja dice, solo para el lector, quién habla', async () => {
      fetchFalso.mockImplementation(() => Promise.resolve(respuestaEntera('Es suave.')))
      renderAsistente()
      const input = await abrirElChat()
      const hilo = screen.getByRole('log', { name: 'Conversación con el asistente' })

      await userEvent.type(input, '¿La provoleta pica?{Enter}')
      await within(hilo).findByText('Es suave.')

      for (const quien of ['El asistente dice:', 'Vos preguntaste:', 'El asistente respondió:']) {
        expect(within(hilo).getByText(quien)).toHaveClass('sr-only')
      }
      // El saludo es del asistente, la pregunta de la persona y la respuesta del asistente, en ese orden.
      expect(hilo.textContent).toMatch(/El asistente dice: Hola[\s\S]*Vos preguntaste: ¿La provoleta pica\?[\s\S]*El asistente respondió: Es suave\./)
    })

    it('las viñetas son una lista de verdad, con sus negritas, y la respuesta se anuncia como oraciones', async () => {
      fetchFalso.mockImplementation(() =>
        Promise.resolve(respuestaEntera('Te recomiendo:\n\n* **Milanesa** napolitana\n- Ensalada César\n\nBuen provecho')),
      )
      renderAsistente()
      const input = await abrirElChat()
      const dialogo = screen.getByRole('dialog', { name: 'Asistente' })
      const hilo = within(dialogo).getByRole('log', { name: 'Conversación con el asistente' })

      await userEvent.type(input, '¿Qué me recomendás?{Enter}')
      const lista = await within(hilo).findByRole('list')

      const items = within(lista).getAllByRole('listitem')
      expect(items.map((item) => item.textContent)).toEqual(['Milanesa napolitana', 'Ensalada César'])
      expect(within(items[0]).getByText('Milanesa').tagName).toBe('STRONG')
      expect(hilo).toHaveTextContent('Te recomiendo:')
      expect(hilo).toHaveTextContent('Buen provecho')
      expect(hilo).not.toHaveTextContent('•')
      // El renglón en blanco entre "Te recomiendo:" y la lista se conserva (como margen: un salto al final del bloque no se ve),
      // y el de la lista a "Buen provecho" sigue siendo un salto de línea del texto, como antes.
      expect(within(hilo).getByText('Te recomiendo:')).toHaveStyle({ marginBottom: '1.45em' })
      expect(within(hilo).getByText('Buen provecho')).not.toHaveStyle({ marginBottom: '1.45em' })
      await waitFor(() =>
        expect(anuncioDelChat(dialogo)).toBe('El asistente respondió: Te recomiendo: Milanesa napolitana. Ensalada César. Buen provecho.'),
      )
    })
  })

  describe('accesibilidad: el foco no se pierde (A4) y Esc siempre cierra (A5)', () => {
    it('en el celular, al tocar una sugerencia (que desaparece) el foco pasa a la conversación, donde llega la respuesta', async () => {
      fetchFalso.mockResolvedValue(respuestaEnStreaming().respuesta)
      renderAsistente()
      await abrirElChat()
      const hilo = screen.getByRole('log', { name: 'Conversación con el asistente' })

      await userEvent.click(within(hilo).getByRole('button', { name: '¿Qué me recomendás?' }))

      expect(within(hilo).queryByRole('button', { name: '¿Qué me recomendás?' })).not.toBeInTheDocument()
      expect(hilo).toHaveFocus()
    })

    it('en una compu, el foco pasa al campo (no abre ningún teclado)', async () => {
      conPunteroFino()
      fetchFalso.mockResolvedValue(respuestaEnStreaming().respuesta)
      renderAsistente()
      const input = await abrirElChat()
      const hilo = screen.getByRole('log', { name: 'Conversación con el asistente' })

      await userEvent.click(within(hilo).getByRole('button', { name: '¿Qué formas de pago aceptan?' }))

      expect(input).toHaveFocus()
    })

    it('"Reintentar" no deja el foco en el aire: pasa a la conversación', async () => {
      fetchFalso.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockImplementation(() => Promise.resolve(respuestaEntera('Es suave.')))
      renderAsistente()
      const input = await abrirElChat()
      const hilo = screen.getByRole('log', { name: 'Conversación con el asistente' })
      await userEvent.type(input, '¿La provoleta pica?{Enter}')

      await userEvent.click(await within(hilo).findByRole('button', { name: /Reintentar/ }))

      expect(within(hilo).queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument()
      expect(hilo).toHaveFocus()
      expect(await within(hilo).findByText('Es suave.')).toBeInTheDocument()
    })

    it('Esc cierra el chat aunque el foco se haya perdido (quedó en el <body>) y el foco vuelve al botón "Asistente"', async () => {
      renderAsistente()
      await abrirElChat()
      ;(document.activeElement as HTMLElement).blur()
      expect(document.body).toHaveFocus()

      await userEvent.keyboard('{Escape}')

      expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('inert')
      expect(screen.getByRole('button', { name: 'Asistente' })).toHaveFocus()
    })

    it('el Tab no sale del chat: del último control vuelve al primero y con Mayús + Tab, al revés', async () => {
      renderAsistente()
      await abrirElChat()
      const cerrar = screen.getByRole('button', { name: 'Cerrar el asistente' })
      const enviar = screen.getByRole('button', { name: 'Enviar pregunta' })
      enviar.focus()

      await userEvent.tab()
      expect(cerrar).toHaveFocus()

      await userEvent.tab({ shift: true })
      expect(enviar).toHaveFocus()
    })

    it('avisa a la carta cuando se abre y se cierra (para dejar inerte lo de atrás), y al irse con el chat abierto', async () => {
      const alCambiar = vi.fn()
      const { unmount } = render(
        <AsistenteDeLaCarta restauranteId="rest-1" nombreRestaurante="La Parrilla" habilitado conCarrito={false} onAbiertoChange={alCambiar} />,
      )

      await abrirElChat()
      expect(alCambiar).toHaveBeenLastCalledWith(true)

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar el asistente' }))
      expect(alCambiar).toHaveBeenLastCalledWith(false)

      await abrirElChat()
      expect(alCambiar).toHaveBeenLastCalledWith(true)
      unmount()
      expect(alCambiar).toHaveBeenLastCalledWith(false)
    })

    it('el chat se dibuja en el <body>: lo que la carta vuelva inerte (su <main>) no lo alcanza', async () => {
      const { container } = render(carta('rest-1'))

      await abrirElChat()

      expect(container).not.toContainElement(screen.getByRole('dialog', { name: 'Asistente' }))
      expect(document.body).toContainElement(screen.getByRole('dialog', { name: 'Asistente' }))
    })
  })

  describe('accesibilidad: el campo y el botón de enviar (A9, A11, A12)', () => {
    it('la conversación tiene scroll y se alcanza con el teclado', async () => {
      renderAsistente()
      await abrirElChat()

      expect(screen.getByRole('log', { name: 'Conversación con el asistente' })).toHaveAttribute('tabindex', '0')
    })

    it('el contador es para la vista: el campo no lo trae en su descripción y el lector no lo repite', async () => {
      renderAsistente()
      const input = await abrirElChat()
      const dialogo = screen.getByRole('dialog', { name: 'Asistente' })

      expect(input).not.toHaveAttribute('aria-describedby')
      expect(within(dialogo).getByText('0/500')).toHaveAttribute('aria-hidden', 'true')
    })

    it.each([
      [400, ''],
      [450, 'Quedan 50 caracteres o menos.'],
      [481, 'Quedan 20 caracteres o menos.'],
      [495, 'Quedan 10 caracteres o menos.'],
      [500, 'Llegaste al límite de 500 caracteres.'],
    ])('con %i caracteres el lector se entera solo al cruzar cada umbral: "%s"', async (largo, aviso) => {
      renderAsistente()
      const input = await abrirElChat()
      const dialogo = screen.getByRole('dialog', { name: 'Asistente' })

      fireEvent.change(input, { target: { value: 'a'.repeat(largo) } })

      expect(dialogo.querySelector('form [role="status"].sr-only')).toHaveTextContent(aviso)
      expect(within(dialogo).getByText(`${largo}/500`)).toBeInTheDocument()
    })

    it('"Enviar pregunta" no se deshabilita: sin texto es `aria-disabled` y, al tocarlo, dice qué falta y lleva el foco al campo', async () => {
      renderAsistente()
      const input = await abrirElChat()
      const dialogo = screen.getByRole('dialog', { name: 'Asistente' })
      const enviar = within(dialogo).getByRole('button', { name: 'Enviar pregunta' })
      expect(enviar).not.toBeDisabled()
      expect(enviar).toHaveAttribute('aria-disabled', 'true')

      await userEvent.click(enviar)

      expect(fetchFalso).not.toHaveBeenCalled()
      expect(within(dialogo).getByText('Escribí tu pregunta para enviarla.')).toBeInTheDocument()
      expect(input).toHaveFocus()

      // Al escribir se va el aviso y el botón queda activo.
      await userEvent.type(input, 'hola')
      expect(within(dialogo).queryByText('Escribí tu pregunta para enviarla.')).not.toBeInTheDocument()
      expect(enviar).toHaveAttribute('aria-disabled', 'false')
    })

    it('Enter con el campo vacío avisa lo mismo y no manda nada', async () => {
      renderAsistente()
      const input = await abrirElChat()
      const dialogo = screen.getByRole('dialog', { name: 'Asistente' })

      await userEvent.type(input, '{Enter}')

      expect(fetchFalso).not.toHaveBeenCalled()
      expect(within(dialogo).getByText('Escribí tu pregunta para enviarla.')).toBeInTheDocument()
    })

    it('mientras el asistente responde el botón sigue en su lugar, con el foco, `aria-disabled` y sin mandar otra pregunta', async () => {
      fetchFalso.mockResolvedValue(respuestaEnStreaming().respuesta)
      renderAsistente()
      const input = await abrirElChat()
      const enviar = screen.getByRole('button', { name: 'Enviar pregunta' })
      await userEvent.type(input, '¿La provoleta pica?')
      await userEvent.click(enviar)

      expect(fetchFalso).toHaveBeenCalledTimes(1)
      expect(enviar).toHaveFocus()
      expect(enviar).toHaveAttribute('aria-disabled', 'true')
      await userEvent.type(input, 'otra pregunta')
      await userEvent.click(enviar)
      expect(fetchFalso).toHaveBeenCalledTimes(1)
    })
  })

  describe('accesibilidad: axe sobre el chat abierto', () => {
    it('sin violaciones al abrirlo, con una conversación con lista y con un error', async () => {
      fetchFalso
        .mockImplementationOnce(() => Promise.resolve(respuestaEntera('Te recomiendo:\n* **Milanesa** napolitana\n* Ensalada César')))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      renderAsistente()
      const input = await abrirElChat()
      const dialogo = screen.getByRole('dialog', { name: 'Asistente' })
      expect(await axe(dialogo)).toHaveNoViolations()

      await userEvent.type(input, '¿Qué me recomendás?{Enter}')
      await within(dialogo).findByRole('list')
      expect(await axe(dialogo)).toHaveNoViolations()

      await userEvent.type(input, '¿Y de postre?{Enter}')
      await within(dialogo).findByRole('alert')
      expect(await axe(dialogo)).toHaveNoViolations()
    })
  })
})
