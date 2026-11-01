import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler'
import { APICallError, simulateReadableStream } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { PrismaService } from '../prisma/prisma.service'
import { AppDeEndpoints, crearAppDeEndpoints, MUNDO, SESION_CLIENTE } from '../test/app-endpoints'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { AsistenteController } from './asistente.controller'
import { AsistenteService, historialParaElModelo } from './asistente.service'
import { configuracionDelAsistente } from './configuracion'
import { ContextoService } from './contexto.service'
import { LimitePorIpService } from './limite-por-ip.service'
import { MODELO_DEL_ASISTENTE } from './modelo'
import { ProveedorService } from './proveedor.service'
import { inicioDelDiaUtc, RegistroAsistenteService } from './registro-asistente.service'

// La ruta, el ValidationPipe, el token de mesa y los services reales. La base, en memoria (crearPrismaMock); el modelo,
// el mock del AI SDK: ninguna llamada real. El límite por IP se prueba a mano con curl (Fase 5 de la spec).

const REST = MUNDO.REST_1
const RUTA = `/asistente/${REST}/mensajes`
const RESPUESTA = ['La provoleta es suave: ', 'pica apenas.']

const restauranteSeed = () => ({
  nombre: 'La Parrilla de Prueba',
  activo: true,
  marca: { activo: true },
  informacionLocal: {
    asistenteHabilitado: true,
    horarios: 'Martes a domingo de 12 a 24',
    formasPago: null,
    wifi: true,
    petFriendly: null,
    accesibleSillaRuedas: null,
    opcionesParaChicos: null,
    estacionamiento: null,
  },
})

const provoleta = {
  id: 'plato-provoleta',
  nombre: 'Provoleta',
  descripcion: 'Provolone a la parrilla con orégano.',
  precioBase: 2300,
  precioDescuento: null,
  recomendadoEn: new Date('2026-10-01'),
  tamanioPorcion: 'PARA_COMPARTIR',
  porcionPersonas: null,
  porcionDetalle: '250 g',
  temperatura: 'CALIENTE',
  nivelPicante: 'SUAVE',
  acompanamiento: null,
  tiempoPreparacionMin: 12,
  etiquetasDietarias: ['VEGETARIANO', 'SIN_TACC'],
  infoAdicional: null,
  categoria: { id: 'cat-entradas', restauranteId: REST, nombre: 'Entradas', orden: 1 },
  clasificaciones: [],
}

const USO = {
  inputTokens: { total: 812, noCache: 812, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 23, text: 23, reasoning: undefined },
}

const respuestaDelModelo = () => ({
  stream: simulateReadableStream({
    chunks: [
      { type: 'text-start' as const, id: 't1' },
      ...RESPUESTA.map((delta) => ({ type: 'text-delta' as const, id: 't1', delta })),
      // Gemini 3 manda esto en el último chunk de texto: no tiene que llegar al cliente.
      { type: 'text-delta' as const, id: 't1', delta: '', providerMetadata: { google: { thoughtSignature: 'firma-opaca' } } },
      { type: 'text-end' as const, id: 't1' },
      { type: 'finish' as const, finishReason: { unified: 'stop' as const, raw: undefined }, usage: USO },
    ],
  }),
})

/** Los eventos del SSE (`data: {json}`), sin el `[DONE]` del final. */
function eventos(texto: string): Array<Record<string, unknown>> {
  return texto
    .split('\n\n')
    .filter((linea) => linea.startsWith('data: ') && linea !== 'data: [DONE]')
    .map((linea) => JSON.parse(linea.slice('data: '.length)))
}

const pregunta = (contenido: string) => ({ mensajes: [{ rol: 'usuario', contenido }] })

describe('POST /asistente/:restauranteId/mensajes', () => {
  let api: AppDeEndpoints
  let prisma: PrismaMock
  const doStream = jest.fn()
  // Supertest pega siempre desde la misma IP: los contadores en memoria se vacían después de cada test.
  const contadoresPorIp = new ThrottlerStorageService()

  beforeAll(async () => {
    prisma = crearPrismaMock()
    api = await crearAppDeEndpoints(AsistenteController, [
      AsistenteService,
      ContextoService,
      ProveedorService,
      RegistroAsistenteService,
      LimitePorIpService,
      { provide: ThrottlerStorage, useValue: contadoresPorIp },
      { provide: PrismaService, useValue: comoPrisma(prisma) },
      { provide: MODELO_DEL_ASISTENTE, useValue: new MockLanguageModelV3({ doStream }) },
    ])
  })

  afterAll(() => api.cerrar())
  afterEach(() => contadoresPorIp.onApplicationShutdown())

  beforeEach(() => {
    jest.clearAllMocks()
    doStream.mockImplementation(async () => respuestaDelModelo())
    prisma.restaurante.findUnique.mockResolvedValue(restauranteSeed())
    prisma.itemMenu.findMany.mockResolvedValue([provoleta])
    prisma.preguntaFrecuente.findMany.mockResolvedValue([])
    prisma.registroAsistente.count.mockResolvedValue(0)
    prisma.registroAsistente.create.mockResolvedValue({ id: 'registro-1' })
    prisma.registroAsistente.update.mockResolvedValue({})
  })

  it('una pregunta sobre un plato: el contexto lo tiene, la respuesta llega en streaming y el registro queda completo', async () => {
    const res = await api.pedir('post', RUTA, {
      body: {
        mensajes: [
          { rol: 'usuario', contenido: '¿Abren los lunes?' },
          { rol: 'asistente', contenido: 'No, los lunes está cerrado.' },
          { rol: 'usuario', contenido: '  ¿La provoleta pica?  ' },
        ],
      },
    })

    // El stream: SSE del AI SDK, con el texto del modelo.
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.headers['x-vercel-ai-ui-message-stream']).toBe('v1')
    const deltas = eventos(res.text).filter((e) => e.type === 'text-delta').map((e) => e.delta)
    expect(deltas.join('')).toBe(RESPUESTA.join(''))
    expect(res.text).not.toContain('providerMetadata')

    // Al modelo: el system prompt con el plato del contexto, la conversación y los parámetros de la spec.
    const llamada = doStream.mock.calls[0][0]
    expect(llamada.prompt[0].role).toBe('system')
    expect(llamada.prompt[0].content).toContain(
      '- Provoleta — $2.300. Provolone a la parrilla con orégano. Porción: para compartir (250 g). Temperatura: caliente. ' +
        'Picante: suave. Preparación: ~12 min. Etiquetas: vegetariano, sin TACC. [Recomendado por el local]',
    )
    expect(llamada.prompt.slice(1)).toEqual([
      { role: 'user', content: [{ type: 'text', text: '¿Abren los lunes?' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'No, los lunes está cerrado.' }] },
      { role: 'user', content: [{ type: 'text', text: '¿La provoleta pica?' }] },
    ])
    expect(llamada).toMatchObject({ maxOutputTokens: 500, temperature: 0.3 })

    // El registro: la fila se inserta antes de llamar al modelo y se completa al terminar.
    expect(prisma.registroAsistente.create).toHaveBeenCalledWith({
      data: { restauranteId: REST, sesionMesaId: null, pregunta: '¿La provoleta pica?', modelo: 'mock-model-id' },
      select: { id: true },
    })
    expect(prisma.registroAsistente.create.mock.invocationCallOrder[0]).toBeLessThan(doStream.mock.invocationCallOrder[0])
    expect(prisma.registroAsistente.update).toHaveBeenCalledWith({
      where: { id: 'registro-1' },
      data: { respuesta: RESPUESTA.join(''), tokensEntrada: 812, tokensSalida: 23, duracionMs: expect.any(Number) },
    })
  })

  it.each([
    ['con el asistente apagado', { informacionLocal: { asistenteHabilitado: false } }],
    ['sin información del local', { informacionLocal: null }],
    ['con el restaurante dado de baja', { activo: false }],
    ['con la marca dada de baja', { marca: { activo: false } }],
  ])('403 asistente_deshabilitado %s: no llama al modelo ni registra nada', async (_caso, cambio) => {
    prisma.restaurante.findUnique.mockResolvedValue({ ...restauranteSeed(), ...cambio })

    const res = await api.pedir('post', RUTA, { body: pregunta('¿La provoleta pica?') })

    expect(res.status).toBe(403)
    expect(res.body).toEqual({ codigo: 'asistente_deshabilitado', mensaje: expect.any(String) })
    expect(doStream).not.toHaveBeenCalled()
    expect(prisma.registroAsistente.create).not.toHaveBeenCalled()
  })

  it('403 asistente_deshabilitado si el restaurante no existe', async () => {
    prisma.restaurante.findUnique.mockResolvedValue(null)

    const res = await api.pedir('post', '/asistente/no-existe/mensajes', { body: pregunta('¿Hay wifi?') })

    expect(res.status).toBe(403)
    expect(res.body.codigo).toBe('asistente_deshabilitado')
  })

  it.each([
    ['501 caracteres', pregunta('a'.repeat(501)), 'pregunta_larga'],
    ['el último mensaje no es del usuario', { mensajes: [{ rol: 'asistente', contenido: 'Hola' }] }, 'pregunta_invalida'],
    ['una pregunta vacía', pregunta('   '), 'pregunta_invalida'],
  ])('400 con %s: no llama al modelo ni registra nada', async (_caso, body, codigo) => {
    const res = await api.pedir('post', RUTA, { body })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ codigo, mensaje: expect.any(String) })
    if (codigo === 'pregunta_larga') expect(res.body.mensaje).toBe('La pregunta puede tener hasta 500 caracteres.')
    expect(doStream).not.toHaveBeenCalled()
    expect(prisma.registroAsistente.create).not.toHaveBeenCalled()
  })

  it('con el token de la sesión de mesa, la fila lleva la sesión; un token de otro restaurante o inválido da 403 sesion_invalida', async () => {
    const conSesion = await api.pedir('post', RUTA, {
      sesion: { ...SESION_CLIENTE, restauranteId: REST },
      body: pregunta('¿Hay wifi?'),
    })
    expect(conSesion.status).toBe(200)
    expect(prisma.registroAsistente.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sesionMesaId: SESION_CLIENTE.sesionId }) }),
    )

    jest.clearAllMocks()
    const deOtro = await api.pedir('post', RUTA, {
      sesion: { ...SESION_CLIENTE, restauranteId: MUNDO.REST_2 },
      body: pregunta('¿Hay wifi?'),
    })
    const invalido = await api.pedir('post', RUTA, { body: pregunta('¿Hay wifi?') }).set('Authorization', 'Bearer x.y.z')

    for (const res of [deOtro, invalido]) {
      expect(res.status).toBe(403)
      expect(res.body.codigo).toBe('sesion_invalida')
    }
    expect(doStream).not.toHaveBeenCalled()
  })

  it.each([
    [429, 503, 'no_disponible_momentaneamente'],
    [500, 502, 'error_del_asistente'],
  ])('un %i del proveedor antes de responder da %i %s (no un 200): el intento queda contado', async (delProveedor, status, codigo) => {
    doStream.mockRejectedValue(
      new APICallError({
        message: 'Resource has been exhausted',
        url: 'https://proveedor.test',
        requestBodyValues: {},
        statusCode: delProveedor,
        isRetryable: true,
      }),
    )

    const res = await api.pedir('post', RUTA, { body: pregunta('¿La provoleta pica?') })

    expect(res.status).toBe(status)
    expect(res.body).toEqual({ codigo, mensaje: expect.any(String) })
    expect(doStream).toHaveBeenCalledTimes(1) // sin reintentos
    expect(prisma.registroAsistente.create).toHaveBeenCalledTimes(1)
    expect(prisma.registroAsistente.update).not.toHaveBeenCalled()
  })

  it('un error a mitad de la respuesta llega en el evento error del stream, con { codigo, mensaje } en errorText', async () => {
    doStream.mockImplementation(async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start' as const, id: 't1' },
          { type: 'text-delta' as const, id: 't1', delta: 'La provoleta' },
          { type: 'error' as const, error: new Error('se cortó la conexión') },
        ],
      }),
    }))

    const res = await api.pedir('post', RUTA, { body: pregunta('¿La provoleta pica?') })

    expect(res.status).toBe(200)
    const error = eventos(res.text).find((e) => e.type === 'error')
    expect(JSON.parse(String(error?.errorText))).toEqual({ codigo: 'error_del_asistente', mensaje: expect.any(String) })
    expect(res.text).not.toContain('se cortó la conexión')
    expect(prisma.registroAsistente.update).not.toHaveBeenCalled()
  })

  describe('límites de uso', () => {
    const LIMITES = { ASISTENTE_MAX_PREGUNTAS_SESION: '2', ASISTENTE_MAX_PREGUNTAS_DIA: '5' }
    const conSesion = { sesion: { ...SESION_CLIENTE, restauranteId: REST } }

    beforeEach(() => Object.assign(process.env, LIMITES))
    afterEach(() => Object.keys(LIMITES).forEach((nombre) => delete process.env[nombre]))

    /** El registro en memoria: `count` cuenta lo que se insertó, por sesión o (con las filas previas) en el día. */
    function registroEnMemoria(filasPreviasDelDia = 0) {
      const filas: Array<{ sesionMesaId: string | null }> = []
      prisma.registroAsistente.create.mockImplementation(async ({ data }) => {
        filas.push(data)
        return { id: `registro-${filas.length}` }
      })
      prisma.registroAsistente.count.mockImplementation(async ({ where }) =>
        where.sesionMesaId
          ? filas.filter((f) => f.sesionMesaId === where.sesionMesaId).length
          : filasPreviasDelDia + filas.length,
      )
      return filas
    }

    it('por debajo de todos los límites responde normal: cuenta la sesión y el día en la transacción del registro', async () => {
      registroEnMemoria(3)

      const res = await api.pedir('post', RUTA, { ...conSesion, body: pregunta('¿La provoleta pica?') })

      expect(res.status).toBe(200)
      const deltas = eventos(res.text).filter((e) => e.type === 'text-delta').map((e) => e.delta)
      expect(deltas.join('')).toBe(RESPUESTA.join(''))
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
      expect(prisma.registroAsistente.count).toHaveBeenCalledWith({ where: { sesionMesaId: SESION_CLIENTE.sesionId } })
      expect(prisma.registroAsistente.count).toHaveBeenCalledWith({ where: { createdAt: { gte: inicioDelDiaUtc() } } })
      expect(prisma.registroAsistente.create).toHaveBeenCalledTimes(1)
      expect(doStream).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['sin sesión', {}],
      ['con sesión', conSesion],
    ])('con el tope diario alcanzado, 503 no_disponible_hoy %s: no llama al modelo ni registra nada', async (_caso, opciones) => {
      registroEnMemoria(5)

      const res = await api.pedir('post', RUTA, { ...opciones, body: pregunta('¿Hay wifi?') })

      expect(res.status).toBe(503)
      expect(res.body).toEqual({ codigo: 'no_disponible_hoy', mensaje: 'El asistente no está disponible por hoy.' })
      expect(doStream).not.toHaveBeenCalled()
      expect(prisma.registroAsistente.create).not.toHaveBeenCalled()
    })

    it('la pregunta N+1 de la sesión es 429 limite_sesion, aunque cada una llegue como una conversación nueva', async () => {
      const filas = registroEnMemoria()

      for (const contenido of ['Pregunta 1', 'Pregunta 2']) {
        const res = await api.pedir('post', RUTA, { ...conSesion, body: pregunta(contenido) })
        expect(res.status).toBe(200)
      }
      const tercera = await api.pedir('post', RUTA, { ...conSesion, body: pregunta('Pregunta 3') })

      expect(tercera.status).toBe(429)
      expect(tercera.body).toEqual({ codigo: 'limite_sesion', mensaje: expect.any(String) })
      expect(filas).toHaveLength(2)
      expect(doStream).toHaveBeenCalledTimes(2)
    })
  })
})

describe('historialParaElModelo', () => {
  it('se queda con los últimos N, saca los vacíos, arranca en el usuario y une los mensajes seguidos del mismo rol', () => {
    const configuracion = { ...configuracionDelAsistente(), maxMensajesHistorial: 4 }

    const historial = historialParaElModelo(
      [
        { rol: 'usuario', contenido: '¿Abren los lunes?' },
        { rol: 'asistente', contenido: 'No, los lunes está cerrado.' },
        { rol: 'usuario', contenido: '¿Tienen algo vegetariano?' },
        { rol: 'asistente', contenido: '   ' },
        { rol: 'usuario', contenido: '¿Y la provoleta pica?' },
      ],
      configuracion,
    )

    expect(historial).toEqual([
      { rol: 'usuario', contenido: '¿Tienen algo vegetariano?\n\n¿Y la provoleta pica?' },
    ])
  })
})
