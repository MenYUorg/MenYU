import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO, SESION_CLIENTE, SIN_USUARIO } from '../test/app-endpoints'
import { SessionsController } from './sessions.controller'
import { SessionsService } from './sessions.service'

// Las rutas de sesiones del salón (OWNER, GERENTE, JEFE_SALON y MOZO). Con el restaurante en la query el rol lo exige
// la ruta; en las de una mesa o una sesión, el service (sessions.consultas.spec y sessions.service.spec). La apertura
// del comensal está en sessions-open-endpoint.spec.
describe('endpoints de sesiones del salón', () => {
  let api: AppDeEndpoints
  const sesiones = {
    openStaff: jest.fn(),
    cerrarMesaAdmin: jest.fn(),
    getSessionActiva: jest.fn(),
    getSessionesActivas: jest.fn(),
    getSessionesPagadas: jest.fn(),
    getHistorialSesiones: jest.fn(),
    registrarCobro: jest.fn(),
    close: jest.fn(),
  }
  const REST = MUNDO.REST_1
  const MESA_ID = '6f1c2a40-6666-4a1b-9c3d-000000000001'

  beforeAll(async () => {
    api = await crearAppDeEndpoints(SessionsController, [{ provide: SessionsService, useValue: sesiones }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    for (const fn of Object.values(sesiones)) fn.mockResolvedValue({ ok: true })
  })

  describe('las consultas por restaurante (la query)', () => {
    it('GET /sessions/activas, pagadas e historial: el MOZO las ve con los filtros', async () => {
      const activas = await api.pedir('get', '/sessions/activas', { cuenta: CUENTAS.MOZO, query: { restauranteId: REST } })
      const pagadas = await api.pedir('get', '/sessions/pagadas', { cuenta: CUENTAS.MOZO, query: { restauranteId: REST, fecha: 'hoy' } })
      const historial = await api.pedir('get', '/sessions/historial', {
        cuenta: CUENTAS.JEFE_SALON,
        query: { restauranteId: REST, desde: '2026-10-01', hasta: '2026-10-18' },
      })

      expect([activas.status, pagadas.status, historial.status]).toEqual([200, 200, 200])
      expect(sesiones.getSessionesActivas).toHaveBeenCalledWith(REST)
      expect(sesiones.getSessionesPagadas).toHaveBeenCalledWith(REST, 'hoy')
      expect(sesiones.getHistorialSesiones).toHaveBeenCalledWith(REST, '2026-10-01', '2026-10-18')
    })

    it.each([
      ['/sessions/activas'],
      ['/sessions/pagadas'],
      ['/sessions/historial'],
    ])('GET %s: ROOT, la COCINA y el OWNER de otra marca reciben 403', async (ruta) => {
      for (const cuenta of [CUENTAS.ROOT, CUENTAS.COCINA, CUENTAS.OWNER_B]) {
        const res = await api.pedir('get', ruta, { cuenta, query: { restauranteId: REST } })
        expect(res.status).toBe(403)
      }
      expect(sesiones.getSessionesActivas).not.toHaveBeenCalled()
      expect(sesiones.getSessionesPagadas).not.toHaveBeenCalled()
      expect(sesiones.getHistorialSesiones).not.toHaveBeenCalled()
    })

    it('el historial ya no deja pasar a cualquiera con el token legacy: sin token de Supabase, 401', async () => {
      const res = await api.pedir('get', '/sessions/historial', { query: { restauranteId: REST } }).set('Authorization', 'Bearer legacy')

      expect(res.status).toBe(401)
    })
  })

  describe('las rutas de una mesa o una sesión le pasan la cuenta al service', () => {
    it('POST /sessions/open-staff, POST /sessions/mesa/:mesaId/cerrar y GET /sessions/mesa/:mesaId/activa', async () => {
      await api.pedir('post', '/sessions/open-staff', { cuenta: CUENTAS.MOZO, body: { mesaId: MESA_ID } })
      await api.pedir('post', `/sessions/mesa/${MESA_ID}/cerrar`, { cuenta: CUENTAS.MOZO })
      await api.pedir('get', `/sessions/mesa/${MESA_ID}/activa`, { cuenta: CUENTAS.MOZO })

      expect(sesiones.openStaff).toHaveBeenCalledWith({ mesaId: MESA_ID }, CUENTAS.MOZO)
      expect(sesiones.cerrarMesaAdmin).toHaveBeenCalledWith(MESA_ID, CUENTAS.MOZO)
      expect(sesiones.getSessionActiva).toHaveBeenCalledWith(MESA_ID, CUENTAS.MOZO)
    })

    it('PATCH /sessions/:id/cobro pasa el body validado y la cuenta', async () => {
      const res = await api.pedir('patch', '/sessions/sesion-1/cobro', {
        cuenta: CUENTAS.GERENTE,
        body: { metodoPago: 'efectivo', mozoId: 'mozo-7' },
      })

      expect(res.status).toBe(200)
      expect(sesiones.registrarCobro).toHaveBeenCalledWith('sesion-1', { metodoPago: 'efectivo', mozoId: 'mozo-7' }, CUENTAS.GERENTE)
    })

    it.each([
      ['post', '/sessions/open-staff', { mesaId: MESA_ID }],
      ['post', `/sessions/mesa/${MESA_ID}/cerrar`, undefined],
      ['get', `/sessions/mesa/${MESA_ID}/activa`, undefined],
      ['patch', '/sessions/sesion-1/cobro', { metodoPago: 'efectivo' }],
    ] as const)('%s %s: sin token 401, con el token de la mesa 401 y sin Usuario 403', async (metodo, url, body) => {
      const anonimo = await api.pedir(metodo, url, { body })
      const comensal = await api.pedir(metodo, url, { sesion: SESION_CLIENTE, body })
      const sinUsuario = await api.pedir(metodo, url, { cuenta: SIN_USUARIO, body })

      expect([anonimo.status, comensal.status, sinUsuario.status]).toEqual([401, 401, 403])
    })
  })
})
