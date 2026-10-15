import { MenyuGateway } from './menyu.gateway'

const mockJwt = { verify: jest.fn() }
const mockPrisma = {
  mozo: { findUnique: jest.fn(), findMany: jest.fn() },
  mesa: { findUnique: jest.fn() },
  admin: { findUnique: jest.fn() },
  restaurante: { findUnique: jest.fn() },
  adminRestaurante: { findUnique: jest.fn() },
}

function crearCliente(token?: unknown) {
  const rooms = new Set<string>()
  return {
    id: 'socket-1',
    data: {},
    handshake: { auth: token === undefined ? {} : { token } },
    join: jest.fn(async (r: string | string[]) => {
      for (const room of Array.isArray(r) ? r : [r]) rooms.add(room)
    }),
    disconnect: jest.fn(),
    rooms,
  }
}
type Cliente = ReturnType<typeof crearCliente>

const TOKEN_SESION = { sub: 'cli-1', tipo: 'cliente', sesionId: 's1', mesaId: 'mesa-1', restauranteId: 'r1' }

describe('MenyuGateway', () => {
  let gateway: MenyuGateway
  const emit = jest.fn()
  const to = jest.fn()

  const conectar = async (client: Cliente) => {
    gateway.handleConnection(client as never)
    await (client.data as { listo: Promise<unknown> }).listo
  }

  beforeEach(() => {
    jest.resetAllMocks()
    to.mockReturnValue({ emit })
    gateway = new MenyuGateway(mockJwt as never, mockPrisma as never)
    gateway.server = { to } as never
  })

  describe('conexión', () => {
    it('sin token → desconectada', async () => {
      const c = crearCliente()
      await conectar(c)
      expect(c.disconnect).toHaveBeenCalledWith(true)
      expect(c.rooms.size).toBe(0)
    })

    it('token inválido o vencido → desconectada', async () => {
      mockJwt.verify.mockImplementation(() => { throw new Error('jwt expired') })
      const c = crearCliente('malo')
      await conectar(c)
      expect(c.disconnect).toHaveBeenCalled()
      expect(c.rooms.size).toBe(0)
    })

    it('token de login de cliente (sin sesionId) → desconectada', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'cli-1', tipo: 'cliente', nombre: 'Invitado' })
      const c = crearCliente('login')
      await conectar(c)
      expect(c.disconnect).toHaveBeenCalled()
    })

    it('token de sesión con typ → sesion-<id> y restaurante-<rid>-menu', async () => {
      mockJwt.verify.mockReturnValue({ ...TOKEN_SESION, typ: 'session' })
      const c = crearCliente('t')
      await conectar(c)
      expect(c.disconnect).not.toHaveBeenCalled()
      expect([...c.rooms].sort()).toEqual(['restaurante-r1-menu', 'sesion-s1'])
    })

    it('token de sesión viejo, sin typ pero con sesionId → mismas rooms', async () => {
      mockJwt.verify.mockReturnValue(TOKEN_SESION)
      const c = crearCliente('viejo')
      await conectar(c)
      expect(c.disconnect).not.toHaveBeenCalled()
      expect([...c.rooms].sort()).toEqual(['restaurante-r1-menu', 'sesion-s1'])
    })

    it('token con typ distinto de session → desconectada', async () => {
      mockJwt.verify.mockReturnValue({ ...TOKEN_SESION, typ: 'otro' })
      const c = crearCliente('t')
      await conectar(c)
      expect(c.disconnect).toHaveBeenCalled()
    })

    it('token de mozo activo → mozo-<id> y menú de SU restaurante (el de la base)', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'm1', tipo: 'mozo', restauranteId: 'r-token' })
      mockPrisma.mozo.findUnique.mockResolvedValue({ id: 'm1', restauranteId: 'r1', activo: true })
      const c = crearCliente('t')
      await conectar(c)
      expect([...c.rooms].sort()).toEqual(['mozo-m1', 'restaurante-r1-menu'])
    })

    it('mozo dado de baja o inexistente → desconectada', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'm1', tipo: 'mozo' })
      mockPrisma.mozo.findUnique.mockResolvedValue({ id: 'm1', restauranteId: 'r1', activo: false })
      const c = crearCliente('t')
      await conectar(c)
      expect(c.disconnect).toHaveBeenCalled()
    })

    it('ROOT → desconectada; GERENTE/OWNER → conectada sin rooms hasta el join', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'a1', tipo: 'admin', rol: 'ROOT' })
      const root = crearCliente('t')
      await conectar(root)
      expect(root.disconnect).toHaveBeenCalled()

      mockJwt.verify.mockReturnValue({ sub: 'a2', tipo: 'admin', rol: 'GERENTE' })
      const g = crearCliente('t')
      await conectar(g)
      expect(g.disconnect).not.toHaveBeenCalled()
      expect(g.rooms.size).toBe(0)
    })
  })

  describe('joins', () => {
    const conectarMozo = () => {
      mockJwt.verify.mockReturnValue({ sub: 'm1', tipo: 'mozo' })
      mockPrisma.mozo.findUnique.mockResolvedValue({ id: 'm1', restauranteId: 'r1', activo: true })
      const c = crearCliente('t')
      gateway.handleConnection(c as never)
      return c // sin esperar: el join llega antes de que termine la autenticación
    }

    it('cocina:join de un mozo con otro restauranteId en el body → se ignora, usa el de client.data', async () => {
      const c = conectarMozo()
      const res = await gateway.handleJoinCocina({ restauranteId: 'r-ajeno' }, c as never)
      expect(res).toEqual({ ok: true })
      expect(c.rooms.has('restaurante-r1-cocina')).toBe(true)
      expect(c.rooms.has('restaurante-r-ajeno-cocina')).toBe(false)
    })

    it('session:join y mozo:join no suman ninguna room (ya entraron al conectar)', async () => {
      mockJwt.verify.mockReturnValue(TOKEN_SESION)
      const s = crearCliente('t')
      await conectar(s)
      const antes = [...s.rooms].sort()
      expect(await gateway.handleJoinSesion(s as never)).toEqual({ ok: true })
      expect([...s.rooms].sort()).toEqual(antes)
      expect((await gateway.handleJoinMozo(s as never)).ok).toBe(false)
    })

    it('un comensal no puede pedir cocina:join ni admin:join', async () => {
      mockJwt.verify.mockReturnValue(TOKEN_SESION)
      const s = crearCliente('t')
      await conectar(s)
      expect((await gateway.handleJoinCocina({ restauranteId: 'r1' }, s as never)).ok).toBe(false)
      expect((await gateway.handleJoinAdmin({ restauranteId: 'r1' }, s as never)).ok).toBe(false)
    })

    it('mozo pidiendo admin:join → rechazado', async () => {
      const c = conectarMozo()
      expect((await gateway.handleJoinAdmin({ restauranteId: 'r1' }, c as never)).ok).toBe(false)
    })

    it('GERENTE de otro restaurante pidiendo admin:join → rechazado', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'g1', tipo: 'admin', rol: 'GERENTE' })
      mockPrisma.adminRestaurante.findUnique.mockResolvedValue(null)
      const c = crearCliente('t')
      await conectar(c)
      const res = await gateway.handleJoinAdmin({ restauranteId: 'r-otro' }, c as never)
      expect(res.ok).toBe(false)
      expect(c.rooms.size).toBe(0)
    })

    it('GERENTE asignado → entra a restaurante-<rid>-admin', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'g1', tipo: 'admin', rol: 'GERENTE' })
      mockPrisma.adminRestaurante.findUnique.mockResolvedValue({ adminId: 'g1', restauranteId: 'r1' })
      const c = crearCliente('t')
      await conectar(c)
      expect((await gateway.handleJoinAdmin({ restauranteId: 'r1' }, c as never)).ok).toBe(true)
      expect(c.rooms.has('restaurante-r1-admin')).toBe(true)
    })

    it('OWNER: acepta un restaurante de su marca y rechaza uno de otra marca', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'o1', tipo: 'admin', rol: 'OWNER' })
      mockPrisma.admin.findUnique.mockResolvedValue({ marcaId: 'marca-1' })
      const c = crearCliente('t')
      await conectar(c)

      mockPrisma.restaurante.findUnique.mockResolvedValue({ marcaId: 'marca-1' })
      expect((await gateway.handleJoinAdmin({ restauranteId: 'r1' }, c as never)).ok).toBe(true)

      mockPrisma.restaurante.findUnique.mockResolvedValue({ marcaId: 'marca-2' })
      expect((await gateway.handleJoinAdmin({ restauranteId: 'r2' }, c as never)).ok).toBe(false)
      expect(c.rooms.has('restaurante-r2-admin')).toBe(false)
    })

    it('admin:join sin restauranteId → rechazado', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'g1', tipo: 'admin', rol: 'GERENTE' })
      const c = crearCliente('t')
      await conectar(c)
      expect((await gateway.handleJoinAdmin({}, c as never)).ok).toBe(false)
    })
  })

  describe('emisión', () => {
    const rooms = () => (to.mock.calls[0][0] as string[]).slice().sort()
    const mesaConMozos = (ids: string[]) =>
      mockPrisma.mesa.findUnique.mockResolvedValue({ restauranteId: 'r1', mozoMesas: ids.map((mozoId) => ({ mozoId })) })

    it('order:updated → mozos de la mesa, sesión, cocina y admin', async () => {
      mesaConMozos(['m1', 'm2'])
      const pedido = { id: 'p1', sesionId: 's1', mesaId: 'mesa-1' }
      await gateway.emitOrderUpdated('r1', pedido)
      expect(rooms()).toEqual(['mozo-m1', 'mozo-m2', 'restaurante-r1-admin', 'restaurante-r1-cocina', 'sesion-s1'])
      expect(emit).toHaveBeenCalledWith('order:updated', pedido)
    })

    it('mesa sin mozo asignado → llega a todos los mozos activos del restaurante', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue({ restauranteId: 'r1', mozoMesas: [] })
      mockPrisma.mozo.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm9' }])
      await gateway.emitOrderNew('r1', { sesionId: 's1', mesaId: 'mesa-1' })
      expect(rooms()).toEqual(['mozo-m1', 'mozo-m9', 'restaurante-r1-admin', 'restaurante-r1-cocina'])
    })

    it('waiter:called → mozos y admin, no cocina', async () => {
      mesaConMozos(['m1'])
      await gateway.emitMozoCalled('r1', 'mesa-1', { llamadoId: 'l1', sesionId: 's1', mesaNumero: '3', motivo: 'general' })
      expect(rooms()).toEqual(['mozo-m1', 'restaurante-r1-admin'])
    })

    it('sesion:cerrada → sesión, mozos y admin', async () => {
      mesaConMozos(['m1'])
      await gateway.emitSesionCerrada('r1', 'mesa-1', 's1')
      expect(rooms()).toEqual(['mozo-m1', 'restaurante-r1-admin', 'sesion-s1'])
      expect(emit).toHaveBeenCalledWith('sesion:cerrada', { sesionId: 's1' })
    })

    it('sesion:quierePagar → mozos y admin; sesion:cobrada suma la sesión', async () => {
      mesaConMozos(['m1'])
      await gateway.emitQuierePagar('r1', { sesionId: 's1', mesaId: 'mesa-1', mesaNumero: '3', totalAcumulado: 100 })
      expect(rooms()).toEqual(['mozo-m1', 'restaurante-r1-admin'])

      to.mockClear()
      await gateway.emitSesionCobrada('r1', { sesionId: 's1', mesaId: 'mesa-1', mesaNumero: '3' })
      expect(rooms()).toEqual(['mozo-m1', 'restaurante-r1-admin', 'sesion-s1'])
    })

    it('menu:updated → solo la room de menú', () => {
      gateway.emitMenuUpdated('r1')
      expect(to).toHaveBeenCalledWith('restaurante-r1-menu')
      expect(emit).toHaveBeenCalledWith('menu:updated', { restauranteId: 'r1' })
    })

    it('si falla la consulta de mozos igual emite a las rooms fijas y no rechaza', async () => {
      mockPrisma.mesa.findUnique.mockRejectedValue(new Error('db caída'))
      await expect(gateway.emitOrderNew('r1', { sesionId: 's1', mesaId: 'mesa-1' })).resolves.toBeUndefined()
      expect(rooms()).toEqual(['restaurante-r1-admin', 'restaurante-r1-cocina'])
    })
  })
})
