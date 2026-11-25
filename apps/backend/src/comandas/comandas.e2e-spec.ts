import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { AppE2e, crearAppE2e } from '../test/app-e2e'
import { FixtureDeCaja, marcadorDeLaCorrida } from '../test/fixture-de-caja'
import { MENSAJE_NOMBRE_REPETIDO } from './comandas.service'

// Las comandas (#344) por HTTP contra Postgres, con los guards de permisos reales (test/app-e2e.ts). Lo que los specs
// con la base en memoria no pueden probar: que el único (restaurante_id, nombre) salte con el `meta.target` que
// reconoce `esUnicoViolado`, que desactivar cuente los platos de verdad y que `comandaId: null` deje la columna en NULL.
//
// Todo lo que crea esta corrida cuelga de una marca con el marcador (como en los otros e2e): la limpieza borra solo eso.

describe('Comandas contra Postgres (e2e)', () => {
  let api: AppE2e
  let prisma: PrismaService
  let fx: FixtureDeCaja
  let marcaId = ''
  let rest = ''
  let owner = ''
  let gerente = ''
  let mozo = ''

  const crearComanda = (restauranteId: string, nombre: string, activa = true) =>
    prisma.comanda.create({ data: { restauranteId, nombre, activa } })
  /** Un plato del restaurante, con comanda o sin ella. */
  const crearPlato = (restauranteId: string, comandaId: string | null = null) =>
    prisma.itemMenu.create({ data: { restauranteId, nombre: `Plato ${randomUUID().slice(0, 8)}`, precioBase: 1500, comandaId } })
  const comandaIdDe = async (itemId: string) =>
    (await prisma.itemMenu.findUniqueOrThrow({ where: { id: itemId }, select: { comandaId: true } })).comandaId

  beforeAll(async () => {
    api = await crearAppE2e()
    prisma = api.prisma
    fx = new FixtureDeCaja(prisma, marcadorDeLaCorrida('comandas'))
    marcaId = await fx.marca('E2E Comandas')
    rest = await fx.restaurante(marcaId, 'E2E Comandas')
    owner = await fx.usuario('OWNER', { marcaId })
    gerente = await fx.usuario('GERENTE', { restauranteId: rest })
    mozo = await fx.usuario('MOZO', { restauranteId: rest })
  })

  afterAll(async () => {
    try {
      if (fx) {
        // Los platos antes que las comandas, y las comandas antes que el restaurante (FK)
        const deLaCorrida = { restaurante: { marca: { slug: { startsWith: fx.marcador } } } }
        await prisma.itemMenu.deleteMany({ where: deLaCorrida })
        await prisma.comanda.deleteMany({ where: deLaCorrida })
        await fx.limpiar()
      }
    } finally {
      if (api) await api.cerrar()
    }
  })

  describe('el único (restaurante_id, nombre)', () => {
    it('crear con un nombre que ya existe en el restaurante es 409 (el meta.target del P2002 matchea de verdad)', async () => {
      const primera = await api.pedir('post', '/comandas', { usuarioId: owner, body: { restauranteId: rest, nombre: 'Parrilla' } })
      expect(primera.status).toBe(201)

      const repetida = await api.pedir('post', '/comandas', { usuarioId: gerente, body: { restauranteId: rest, nombre: 'Parrilla' } })

      expect(repetida.status).toBe(409)
      expect(repetida.body.message).toBe(MENSAJE_NOMBRE_REPETIDO)
      expect(await prisma.comanda.count({ where: { restauranteId: rest, nombre: 'Parrilla' } })).toBe(1)
    })

    it('el recorte de los espacios hace repetido al mismo nombre', async () => {
      await api.pedir('post', '/comandas', { usuarioId: owner, body: { restauranteId: rest, nombre: 'Postres' } })

      const res = await api.pedir('post', '/comandas', { usuarioId: owner, body: { restauranteId: rest, nombre: '  Postres  ' } })

      expect(res.status).toBe(409)
    })

    it('renombrar a un nombre que ya existe es 409, también si la otra comanda está desactivada', async () => {
      await crearComanda(rest, 'Vieja', false)
      const otra = await crearComanda(rest, 'Nueva')

      const res = await api.pedir('patch', `/comandas/${otra.id}`, { usuarioId: owner, body: { nombre: 'Vieja' } })

      expect(res.status).toBe(409)
      expect(res.body.message).toBe(MENSAJE_NOMBRE_REPETIDO)
      expect((await prisma.comanda.findUniqueOrThrow({ where: { id: otra.id } })).nombre).toBe('Nueva')
    })

    it('el mismo nombre en otro restaurante entra', async () => {
      const otroRest = await fx.restaurante(marcaId, 'E2E Comandas 2')
      await crearComanda(rest, 'Compartida')

      const res = await api.pedir('post', '/comandas', { usuarioId: owner, body: { restauranteId: otroRest, nombre: 'Compartida' } })

      expect(res.status).toBe(201)
    })
  })

  describe('desactivar', () => {
    it('con platos asignados es 409 y la comanda sigue activa', async () => {
      const comanda = await crearComanda(rest, 'Con platos')
      await crearPlato(rest, comanda.id)
      await crearPlato(rest, comanda.id)

      const res = await api.pedir('patch', `/comandas/${comanda.id}`, { usuarioId: owner, body: { activa: false } })

      expect(res.status).toBe(409)
      expect(res.body.message).toBe('La comanda tiene 2 platos asignados: cambialos de comanda antes de desactivarla')
      expect((await prisma.comanda.findUniqueOrThrow({ where: { id: comanda.id } })).activa).toBe(true)
    })

    it('con un solo plato el mensaje va en singular', async () => {
      const comanda = await crearComanda(rest, 'Con un plato')
      await crearPlato(rest, comanda.id)

      const res = await api.pedir('patch', `/comandas/${comanda.id}`, { usuarioId: gerente, body: { activa: false } })

      expect(res.status).toBe(409)
      expect(res.body.message).toBe('La comanda tiene 1 plato asignado: cambialo de comanda antes de desactivarla')
    })

    it('sin platos se desactiva, y reactivarla se puede', async () => {
      const comanda = await crearComanda(rest, 'Sin platos')

      const desactivada = await api.pedir('patch', `/comandas/${comanda.id}`, { usuarioId: owner, body: { activa: false } })
      expect(desactivada.status).toBe(200)
      expect(desactivada.body).toMatchObject({ id: comanda.id, activa: false })
      expect((await prisma.comanda.findUniqueOrThrow({ where: { id: comanda.id } })).activa).toBe(false)

      const reactivada = await api.pedir('patch', `/comandas/${comanda.id}`, { usuarioId: owner, body: { activa: true } })
      expect(reactivada.status).toBe(200)
      expect((await prisma.comanda.findUniqueOrThrow({ where: { id: comanda.id } })).activa).toBe(true)
    })

    it('el MOZO no puede (403) y la comanda no cambia', async () => {
      const comanda = await crearComanda(rest, 'Del mozo')

      const res = await api.pedir('patch', `/comandas/${comanda.id}`, { usuarioId: mozo, body: { activa: false } })

      expect(res.status).toBe(403)
      expect((await prisma.comanda.findUniqueOrThrow({ where: { id: comanda.id } })).activa).toBe(true)
    })
  })

  describe('la comanda de un plato (PATCH /items/:id y POST /items)', () => {
    it('comandaId: null deja la columna en NULL en la base', async () => {
      const comanda = await crearComanda(rest, 'Para soltar')
      const plato = await crearPlato(rest, comanda.id)
      expect(await comandaIdDe(plato.id)).toBe(comanda.id)

      const res = await api.pedir('patch', `/items/${plato.id}`, { usuarioId: owner, body: { comandaId: null } })

      expect(res.status).toBe(200)
      expect(await comandaIdDe(plato.id)).toBeNull()
    })

    it('asignar una comanda desactivada es 400 y el plato no cambia', async () => {
      const inactiva = await crearComanda(rest, 'Inactiva', false)
      const plato = await crearPlato(rest)

      const res = await api.pedir('patch', `/items/${plato.id}`, { usuarioId: owner, body: { comandaId: inactiva.id } })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('La comanda está desactivada')
      expect(await comandaIdDe(plato.id)).toBeNull()
    })

    it('asignar una comanda desactivada en el alta es 400 y no se crea el plato', async () => {
      const inactiva = await crearComanda(rest, 'Inactiva del alta', false)
      const nombre = `Alta ${randomUUID().slice(0, 8)}`

      const res = await api.pedir('post', '/items', { usuarioId: owner, body: { restauranteId: rest, nombre, precioBase: 1000, comandaId: inactiva.id } })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('La comanda está desactivada')
      expect(await prisma.itemMenu.count({ where: { restauranteId: rest, nombre } })).toBe(0)
    })

    it('asignar una comanda activa funciona', async () => {
      const activa = await crearComanda(rest, 'Activa')
      const plato = await crearPlato(rest)

      const res = await api.pedir('patch', `/items/${plato.id}`, { usuarioId: owner, body: { comandaId: activa.id } })

      expect(res.status).toBe(200)
      expect(await comandaIdDe(plato.id)).toBe(activa.id)
    })

    it('reenviar la misma comanda desactivada que el plato ya tiene no falla', async () => {
      const comanda = await crearComanda(rest, 'Se desactivó después')
      const plato = await crearPlato(rest, comanda.id)
      // Hoy no se puede desactivar con platos; el caso es el de una comanda que quedó inactiva con el plato asignado
      await prisma.comanda.update({ where: { id: comanda.id }, data: { activa: false } })

      const res = await api.pedir('patch', `/items/${plato.id}`, { usuarioId: owner, body: { comandaId: comanda.id, disponible: false } })

      expect(res.status).toBe(200)
      expect(await comandaIdDe(plato.id)).toBe(comanda.id)
    })
  })
})
