import { PrismaService } from '../prisma/prisma.service'
import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO } from '../test/app-endpoints'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { InformacionLocalController } from './informacion-local.controller'
import { InformacionLocalService } from './informacion-local.service'

// La ruta, el ValidationPipe y el service reales; la base, una fila en memoria (sin fila = nada cargado).
describe('endpoints de la información del local', () => {
  let api: AppDeEndpoints
  let prisma: PrismaMock
  let fila: Record<string, unknown> | null
  const REST = MUNDO.REST_1
  const RUTA = `/restaurantes/${REST}/informacion-local`

  beforeAll(async () => {
    prisma = crearPrismaMock()
    api = await crearAppDeEndpoints(InformacionLocalController, [
      InformacionLocalService,
      { provide: PrismaService, useValue: comoPrisma(prisma) },
    ])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    fila = null
    prisma.informacionLocal.findUnique.mockImplementation(async () => fila)
    prisma.informacionLocal.upsert.mockImplementation(async ({ create, update }) => {
      fila = fila ? { ...fila, ...update } : { asistenteHabilitado: false, ...create }
      const { restauranteId: _restauranteId, ...informacion } = fila as Record<string, unknown>
      return informacion
    })
  })

  it('el PUT guarda la información (lo que no viene no cambia, null lo borra) y el GET la devuelve', async () => {
    // Sin nada cargado: todo sin dato y el asistente apagado.
    const vacia = await api.pedir('get', RUTA, { cuenta: CUENTAS.GERENTE })
    expect(vacia.status).toBe(200)
    expect(vacia.body).toMatchObject({ restauranteId: REST, asistenteHabilitado: false, horarios: null, wifi: null })

    const alta = await api.pedir('put', RUTA, {
      cuenta: CUENTAS.OWNER_A,
      body: { asistenteHabilitado: true, horarios: '  Martes a domingo de 12 a 24  ', wifi: true, petFriendly: false, otro: 'x' },
    })
    expect(alta.status).toBe(200)
    expect(prisma.informacionLocal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { restauranteId: REST },
        // Sin espacios de más y sin los campos que no son del DTO.
        create: { restauranteId: REST, asistenteHabilitado: true, horarios: 'Martes a domingo de 12 a 24', wifi: true, petFriendly: false },
      }),
    )

    // Un PUT parcial: el horario vacío y el wifi en null se borran; lo demás queda.
    await api.pedir('put', RUTA, { cuenta: CUENTAS.GERENTE, body: { horarios: '', wifi: null, estacionamiento: true } })

    const leida = await api.pedir('get', RUTA, { cuenta: CUENTAS.OWNER_A })
    expect(leida.body).toEqual({
      restauranteId: REST,
      asistenteHabilitado: true,
      horarios: null,
      wifi: null,
      petFriendly: false,
      estacionamiento: true,
    })
  })

  it('el GERENTE no puede prender ni apagar el asistente: 403 y no guarda nada', async () => {
    // El switch habilita el gasto en el modelo, así que es del dueño. El resto de la información sí la guarda (test de arriba).
    const respuesta = await api.pedir('put', RUTA, { cuenta: CUENTAS.GERENTE, body: { asistenteHabilitado: true, horarios: 'De 12 a 24' } })

    expect(respuesta.status).toBe(403)
    expect(respuesta.body.message).toBe('Solo el dueño de la marca puede prender o apagar el asistente')
    expect(prisma.informacionLocal.upsert).not.toHaveBeenCalled()
  })

  it.each([
    ['el MOZO', CUENTAS.MOZO, REST],
    ['el JEFE_SALON', CUENTAS.JEFE_SALON, REST],
    ['la COCINA', CUENTAS.COCINA, REST],
    ['ROOT (no es un bypass)', CUENTAS.ROOT, REST],
    ['el OWNER de otra marca', CUENTAS.OWNER_B, REST],
    ['el GERENTE en otra sucursal', CUENTAS.GERENTE, MUNDO.REST_2],
  ])('%s recibe 403 y no lee ni guarda nada', async (_caso, cuenta, restauranteId) => {
    const ruta = `/restaurantes/${restauranteId}/informacion-local`
    const lectura = await api.pedir('get', ruta, { cuenta })
    const escritura = await api.pedir('put', ruta, { cuenta, body: { asistenteHabilitado: true } })

    expect([lectura.status, escritura.status]).toEqual([403, 403])
    expect(prisma.informacionLocal.findUnique).not.toHaveBeenCalled()
    expect(prisma.informacionLocal.upsert).not.toHaveBeenCalled()
  })
})
