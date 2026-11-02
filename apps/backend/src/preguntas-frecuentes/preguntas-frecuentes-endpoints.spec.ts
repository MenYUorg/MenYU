import { PrismaService } from '../prisma/prisma.service'
import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO } from '../test/app-endpoints'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { PreguntasFrecuentesController } from './preguntas-frecuentes.controller'
import { PreguntasFrecuentesService } from './preguntas-frecuentes.service'

// La ruta, el ValidationPipe y el service reales; la base, un arreglo en memoria con preguntas de dos restaurantes.
describe('endpoints de las preguntas frecuentes', () => {
  let api: AppDeEndpoints
  let prisma: PrismaMock
  type Fila = { id: string; restauranteId: string; pregunta: string; respuesta: string }
  let filas: Fila[]
  const REST = MUNDO.REST_1
  const RUTA = `/restaurantes/${REST}/preguntas-frecuentes`
  const DE_OTRO_RESTAURANTE: Fila = { id: 'faq-ajena', restauranteId: MUNDO.REST_B, pregunta: '¿Delivery?', respuesta: 'No' }

  beforeAll(async () => {
    prisma = crearPrismaMock()
    api = await crearAppDeEndpoints(PreguntasFrecuentesController, [
      PreguntasFrecuentesService,
      { provide: PrismaService, useValue: comoPrisma(prisma) },
    ])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    filas = [DE_OTRO_RESTAURANTE]
    const suya = (where: { restauranteId: string }) => filas.filter((f) => f.restauranteId === where.restauranteId)
    prisma.preguntaFrecuente.findMany.mockImplementation(async ({ where }) => suya(where))
    prisma.preguntaFrecuente.create.mockImplementation(async ({ data }) => {
      const fila = { id: `faq-${filas.length}`, ...data }
      filas.push(fila)
      return fila
    })
    prisma.preguntaFrecuente.findFirst.mockImplementation(async ({ where }) => suya(where).find((f) => f.id === where.id) ?? null)
    prisma.preguntaFrecuente.update.mockImplementation(async ({ where, data }) => Object.assign(filas.find((f) => f.id === where.id) as Fila, data))
    prisma.preguntaFrecuente.delete.mockImplementation(async ({ where }) => {
      filas = filas.filter((f) => f.id !== where.id)
    })
  })

  it('alta, edición, listado y baja: el listado trae solo las del restaurante', async () => {
    const alta = await api.pedir('post', RUTA, {
      cuenta: CUENTAS.GERENTE,
      body: { pregunta: '  ¿Hacen reservas?  ', respuesta: 'Sí, por teléfono.', restauranteId: MUNDO.REST_B },
    })
    expect(alta.status).toBe(201)
    // El restaurante sale de la ruta, nunca del body; y sin espacios de más.
    expect(prisma.preguntaFrecuente.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { restauranteId: REST, pregunta: '¿Hacen reservas?', respuesta: 'Sí, por teléfono.' } }),
    )

    const edicion = await api.pedir('put', `${RUTA}/${alta.body.id}`, {
      cuenta: CUENTAS.OWNER_A,
      body: { pregunta: '¿Hacen reservas?', respuesta: 'Sí, por WhatsApp.' },
    })
    expect(edicion.status).toBe(200)

    const lista = await api.pedir('get', RUTA, { cuenta: CUENTAS.OWNER_A })
    expect(lista.status).toBe(200)
    expect(lista.body).toEqual([{ id: alta.body.id, restauranteId: REST, pregunta: '¿Hacen reservas?', respuesta: 'Sí, por WhatsApp.' }])

    const baja = await api.pedir('delete', `${RUTA}/${alta.body.id}`, { cuenta: CUENTAS.GERENTE })
    expect(baja.status).toBe(204)
    expect(filas).toEqual([DE_OTRO_RESTAURANTE])
  })

  it('borrar una pregunta de otro restaurante: 404 desde el propio restaurante y 403 desde el ajeno, y no se borra', async () => {
    const desdeElPropio = await api.pedir('delete', `${RUTA}/${DE_OTRO_RESTAURANTE.id}`, { cuenta: CUENTAS.OWNER_A })
    const desdeElAjeno = await api.pedir('delete', `/restaurantes/${MUNDO.REST_B}/preguntas-frecuentes/${DE_OTRO_RESTAURANTE.id}`, {
      cuenta: CUENTAS.OWNER_A,
    })

    expect([desdeElPropio.status, desdeElAjeno.status]).toEqual([404, 403])
    expect(prisma.preguntaFrecuente.delete).not.toHaveBeenCalled()
    expect(filas).toContain(DE_OTRO_RESTAURANTE)
  })
})
