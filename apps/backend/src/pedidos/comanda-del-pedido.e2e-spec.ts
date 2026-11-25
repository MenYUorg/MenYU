import { randomUUID } from 'crypto'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { AppE2e, crearAppE2e } from '../test/app-e2e'
import { FixtureDeCaja, marcadorDeLaCorrida } from '../test/fixture-de-caja'

// La comanda en el ítem del pedido (#344, PR 2) contra Postgres: pedido_item.comanda_id guarda la comanda que tenía el
// plato al pedirse y NO la sigue si el plato cambia de comanda después. Los tres caminos que crean ítems de pedido:
// POST /orders (web-cliente, token de la sesión de mesa), POST /pedidos (comensal, mismo token) y POST /pedidos/staff
// (el salón). Lo que los specs con la base en memoria no pueden probar: la columna y su FK de verdad.
//
// Todo lo que crea esta corrida cuelga de una marca con el marcador (como en los otros e2e): la limpieza borra solo eso.

interface Plato {
  id: string
}
interface Camino {
  nombre: string
  /** El estado en el que queda el pedido, para listarlo con GET /pedidos. */
  estado: string
  crear(platos: Plato[]): Promise<{ status: number; body: any }>
}

describe('La comanda en el ítem del pedido contra Postgres (e2e)', () => {
  let api: AppE2e
  let prisma: PrismaService
  let fx: FixtureDeCaja
  let jwt: JwtService
  let rest = ''
  let gerente = ''
  let mozo = ''
  let mesaId = ''
  let sesionId = ''
  let clienteId = ''
  let token = ''

  const crearComanda = (nombre: string) =>
    prisma.comanda.create({ data: { restauranteId: rest, nombre: `${nombre} ${randomUUID().slice(0, 8)}` } })
  const crearPlato = (comandaId: string | null) =>
    prisma.itemMenu.create({ data: { restauranteId: rest, nombre: `Plato ${randomUUID().slice(0, 8)}`, precioBase: 1500, comandaId } })
  const cambiarComandaDelPlato = (itemId: string, comandaId: string | null) =>
    prisma.itemMenu.update({ where: { id: itemId }, data: { comandaId } })
  const comandaDelItem = async (pedidoId: string, itemId: string) =>
    (await prisma.pedidoItem.findFirstOrThrow({ where: { pedidoId, itemId }, select: { comandaId: true } })).comandaId

  const CAMINOS: Camino[] = [
    {
      nombre: 'POST /orders (web-cliente, con la sesión de mesa)',
      estado: 'pendiente',
      crear: (platos) =>
        api
          .pedir('post', '/orders', { body: { items: platos.map((p) => ({ itemMenuId: p.id, cantidad: 1, modificaciones: [] })) } })
          .set('Authorization', `Bearer ${token}`) as any,
    },
    {
      nombre: 'POST /pedidos (comensal, con la sesión de mesa)',
      estado: 'pendiente',
      crear: (platos) =>
        api
          .pedir('post', '/pedidos', { body: { sesionId, mesaId, items: platos.map((p) => ({ itemId: p.id, cantidad: 1 })) } })
          .set('Authorization', `Bearer ${token}`) as any,
    },
    {
      nombre: 'POST /pedidos/staff (el salón)',
      estado: 'en_preparacion',
      crear: (platos) =>
        api.pedir('post', '/pedidos/staff', {
          usuarioId: mozo,
          body: { sesionId, mesaId, items: platos.map((p) => ({ itemId: p.id, cantidad: 1 })) },
        }) as any,
    },
  ]

  beforeAll(async () => {
    api = await crearAppE2e()
    prisma = api.prisma
    jwt = api.obtener(JwtService)
    fx = new FixtureDeCaja(prisma, marcadorDeLaCorrida('comanda-pedido'))
    const marcaId = await fx.marca('E2E Comanda del pedido')
    rest = await fx.restaurante(marcaId, 'E2E Comanda del pedido')
    gerente = await fx.usuario('GERENTE', { restauranteId: rest })
    mozo = await fx.usuario('MOZO', { restauranteId: rest })
    mesaId = (await fx.mesa(rest)).id
    sesionId = await fx.sesion(mesaId)
    clienteId = (await prisma.cliente.create({ data: { nombre: `Cliente ${fx.marcador}` } })).id
    token = jwt.sign({ sub: clienteId, tipo: 'cliente', sesionId, mesaId, restauranteId: rest })
  })

  afterAll(async () => {
    try {
      if (fx) {
        // Los ítems de pedido antes que los platos, y los platos antes que las comandas y el restaurante (FK)
        const deLaCorrida = { restaurante: { marca: { slug: { startsWith: fx.marcador } } } }
        await prisma.pedidoItem.deleteMany({ where: { pedido: { mesa: deLaCorrida } } })
        await prisma.itemMenu.deleteMany({ where: deLaCorrida })
        await prisma.comanda.deleteMany({ where: deLaCorrida })
        await fx.limpiar()
        if (clienteId) await prisma.cliente.deleteMany({ where: { id: clienteId } })
      }
    } finally {
      if (api) await api.cerrar()
    }
  })

  describe.each(CAMINOS)('$nombre', (camino) => {
    /** Un plato con comanda y otro sin comanda, y el pedido que los pide a los dos. */
    async function pedirConYSinComanda() {
      const comanda = await crearComanda('Parrilla')
      const conComanda = await crearPlato(comanda.id)
      const sinComanda = await crearPlato(null)
      const res = await camino.crear([conComanda, sinComanda])
      expect(res.status).toBe(201)
      return { comanda, conComanda, sinComanda, res, pedidoId: res.body.id as string }
    }

    it('cada ítem guarda la comanda de su plato: el que tiene comanda la lleva, el que no, NULL', async () => {
      const { comanda, conComanda, sinComanda, pedidoId } = await pedirConYSinComanda()

      expect(await prisma.pedidoItem.count({ where: { pedidoId } })).toBe(2)
      expect(await comandaDelItem(pedidoId, conComanda.id)).toBe(comanda.id)
      expect(await comandaDelItem(pedidoId, sinComanda.id)).toBeNull()
    })

    it('cambiar la comanda del plato después (a otra comanda y a null) no cambia la del ítem ya creado', async () => {
      const { comanda, conComanda, sinComanda, pedidoId } = await pedirConYSinComanda()
      const otra = await crearComanda('Postres')

      await cambiarComandaDelPlato(conComanda.id, otra.id)
      await cambiarComandaDelPlato(sinComanda.id, otra.id)
      expect(await comandaDelItem(pedidoId, conComanda.id)).toBe(comanda.id)
      expect(await comandaDelItem(pedidoId, sinComanda.id)).toBeNull()

      await cambiarComandaDelPlato(conComanda.id, null)
      expect(await comandaDelItem(pedidoId, conComanda.id)).toBe(comanda.id)
      expect(await comandaDelItem(pedidoId, sinComanda.id)).toBeNull()
      // y la columna del plato sí cambió: lo que no se movió es la copia del ítem
      expect((await prisma.itemMenu.findUniqueOrThrow({ where: { id: conComanda.id } })).comandaId).toBeNull()
    })

    it('la respuesta de creación devuelve el comandaId de cada ítem', async () => {
      const { comanda, conComanda, sinComanda, res } = await pedirConYSinComanda()

      const items: { itemId: string; comandaId: string | null }[] = res.body.items
      expect(items).toHaveLength(2)
      expect(items.find((i) => i.itemId === conComanda.id)).toEqual(expect.objectContaining({ comandaId: comanda.id }))
      expect(items.find((i) => i.itemId === sinComanda.id)).toEqual(expect.objectContaining({ comandaId: null }))
    })

    it('GET /pedidos devuelve el comandaId de los ítems, el que tenía el plato al pedirse', async () => {
      const { comanda, conComanda, sinComanda, pedidoId } = await pedirConYSinComanda()
      const otra = await crearComanda('Bebidas')
      await cambiarComandaDelPlato(conComanda.id, otra.id)

      const res = await api.pedir('get', '/pedidos', { usuarioId: gerente, query: { restauranteId: rest, estado: camino.estado } })

      expect(res.status).toBe(200)
      const pedido = res.body.find((p: { id: string }) => p.id === pedidoId)
      expect(pedido).toBeDefined()
      expect(pedido.items.find((i: { itemId: string }) => i.itemId === conComanda.id)).toEqual(expect.objectContaining({ comandaId: comanda.id }))
      expect(pedido.items.find((i: { itemId: string }) => i.itemId === sinComanda.id)).toEqual(expect.objectContaining({ comandaId: null }))
    })
  })

  it('GET /orders (los pedidos de la sesión, para web-cliente) devuelve el comandaId de los ítems', async () => {
    const comanda = await crearComanda('Cocina fría')
    const plato = await crearPlato(comanda.id)
    const creado = await CAMINOS[0].crear([plato])
    expect(creado.status).toBe(201)
    await cambiarComandaDelPlato(plato.id, null)

    const res = await api.pedir('get', '/orders').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const pedido = res.body.find((p: { id: string }) => p.id === creado.body.id)
    expect(pedido.items).toEqual([expect.objectContaining({ itemId: plato.id, comandaId: comanda.id })])
  })
})
