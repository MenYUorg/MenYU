import { randomUUID } from 'crypto'
import { HttpAdapterHost } from '@nestjs/core'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { PrismaService } from '../prisma/prisma.service'
import { AppE2e, contar, crearAppE2e, mostrarDistribucion } from '../test/app-e2e'
import { FixtureDeCaja, marcadorDeLaCorrida } from '../test/fixture-de-caja'

// "Listo" por comanda (#344) contra Postgres: la regla de cierre de `decidirListo`, el bloqueo de la fila del pedido
// (FOR UPDATE) que serializa a dos estaciones, a una edición y a una anulación, y lo que de verdad queda en la base
// (`pedido.estado` y `pedido_item.listo_en`). De cada caso se mira el estado, el listo_en de cada ítem y cuántas veces
// se emitió `order:updated`. Lo que los specs con la base en memoria no pueden probar: el bloqueo y la concurrencia.
//
// Todo lo que crea esta corrida cuelga de una marca con el marcador (como en los otros e2e): la limpieza borra solo eso.

interface Local {
  rest: string
  mesaId: string
  sesionId: string
  gerente: string
  mozo: string
  cocina: string
  comandas: Record<string, string>
}
interface Linea {
  /** Nombre de la comanda del plato (una de las del local) o null: un plato sin comanda. */
  comanda: string | null
  cantidad?: number
}
interface PedidoCreado {
  pedidoId: string
  /** pedido_item.id de cada línea, por su etiqueta. */
  items: Record<string, string>
}
interface Vista {
  estado: string
  marcados: string[]
  pendientes: string[]
}

describe('"Listo" por comanda contra Postgres (e2e)', () => {
  let api: AppE2e
  let prisma: PrismaService
  let fx: FixtureDeCaja
  let gateway: MenyuGateway
  let emitidoUpdated: jest.SpyInstance
  let emitidoEdited: jest.SpyInstance
  /** Un restaurante con las comandas "Cocina" y "Barra". */
  let local: Local
  /** Un restaurante sin comanda "Cocina": solo "Barra" y "Parrilla". */
  let sinCocina: Local

  async function armarLocal(nombre: string, comandas: string[]): Promise<Local> {
    const marcaId = await fx.marca(`E2E Listo por comanda ${nombre}`)
    const rest = await fx.restaurante(marcaId, `E2E Listo por comanda ${nombre}`)
    const mesaId = (await fx.mesa(rest)).id
    return {
      rest,
      mesaId,
      sesionId: await fx.sesion(mesaId),
      gerente: await fx.usuario('GERENTE', { restauranteId: rest }),
      mozo: await fx.usuario('MOZO', { restauranteId: rest }),
      cocina: await fx.usuario('COCINA', { restauranteId: rest }),
      comandas: Object.fromEntries(
        await Promise.all(
          comandas.map(async (c) => [c, (await prisma.comanda.create({ data: { restauranteId: rest, nombre: c } })).id] as const),
        ),
      ),
    }
  }

  /** Un pedido en preparación (lo crea el salón) con una línea por etiqueta. */
  async function pedir(donde: Local, lineas: Record<string, Linea>): Promise<PedidoCreado> {
    const platos: Record<string, string> = {}
    for (const [etiqueta, { comanda }] of Object.entries(lineas)) {
      platos[etiqueta] = (
        await prisma.itemMenu.create({
          data: {
            restauranteId: donde.rest,
            nombre: `${etiqueta} ${randomUUID().slice(0, 8)}`,
            precioBase: 1500,
            comandaId: comanda === null ? null : donde.comandas[comanda],
          },
        })
      ).id
    }
    const res = await api.pedir('post', '/pedidos/staff', {
      usuarioId: donde.mozo,
      body: {
        sesionId: donde.sesionId,
        mesaId: donde.mesaId,
        items: Object.entries(lineas).map(([etiqueta, { cantidad }]) => ({ itemId: platos[etiqueta], cantidad: cantidad ?? 1 })),
      },
    })
    expect(res.status).toBe(201)
    expect(res.body.estado).toBe('en_preparacion')
    const items = Object.fromEntries(
      Object.entries(platos).map(([etiqueta, platoId]) => [
        etiqueta,
        (res.body.items as { id: string; itemId: string }[]).find((i) => i.itemId === platoId)!.id,
      ]),
    )
    return { pedidoId: res.body.id, items }
  }

  /** "Listo" de la cocina: de una comanda o, sin ella, el de la pestaña "Todas". */
  const marcar = (donde: Local, pedidoId: string, comanda?: string) =>
    api.pedir('patch', `/pedidos/${pedidoId}/estado`, {
      usuarioId: donde.cocina,
      body: comanda === undefined ? { estado: 'listo' } : { estado: 'listo', comandaId: donde.comandas[comanda] },
    })

  const editar = (donde: Local, creado: PedidoCreado, cambios: Record<string, number>) =>
    api.pedir('patch', `/pedidos/${creado.pedidoId}/editar`, {
      usuarioId: donde.gerente,
      body: {
        justificacion: 'Se cayó el pedido',
        ediciones: Object.entries(cambios).map(([etiqueta, cantidadNueva]) => ({ pedidoItemId: creado.items[etiqueta], cantidadNueva })),
      },
    })

  /** El pedido tal como quedó en la base: su estado y qué líneas tienen `listo_en` (solo cuentan las vigentes). */
  async function leer(creado: PedidoCreado): Promise<Vista> {
    const fila = await prisma.pedido.findUniqueOrThrow({
      where: { id: creado.pedidoId },
      select: { estado: true, items: { select: { id: true, listoEn: true, cantidad: true, cantidadEditada: true } } },
    })
    const etiquetaDe = new Map(Object.entries(creado.items).map(([etiqueta, id]) => [id, etiqueta]))
    const vigentes = fila.items.filter((i) => (i.cantidadEditada ?? i.cantidad) > 0)
    const etiquetas = (lista: typeof vigentes) => lista.map((i) => etiquetaDe.get(i.id)!).sort()
    return {
      estado: fila.estado,
      marcados: etiquetas(vigentes.filter((i) => i.listoEn !== null)),
      pendientes: etiquetas(vigentes.filter((i) => i.listoEn === null)),
    }
  }

  /** El `listo_en` de una línea, tal cual está en la base. */
  const listoEnDe = async (creado: PedidoCreado, etiqueta: string) =>
    (await prisma.pedidoItem.findUniqueOrThrow({ where: { id: creado.items[etiqueta] }, select: { listoEn: true } })).listoEn

  /** Cuántas veces se emitió ese evento de este pedido desde `limpiarEmisiones`. */
  const emisiones = (espia: jest.SpyInstance, pedidoId: string) =>
    espia.mock.calls.filter(([, pedido]) => (pedido as { id: string }).id === pedidoId).length
  const updated = (creado: PedidoCreado) => emisiones(emitidoUpdated, creado.pedidoId)
  const edited = (creado: PedidoCreado) => emisiones(emitidoEdited, creado.pedidoId)

  const PLATO_Y_BEBIDAS = { plato: { comanda: 'Cocina' }, cerveza: { comanda: 'Barra' }, gin: { comanda: 'Barra' } }
  const SOLO_BEBIDAS = { cerveza: { comanda: 'Barra' }, gin: { comanda: 'Barra' } }

  const RONDAS = 8
  // La edición hace más consultas antes de llegar al bloqueo que un "Listo": sin demora, la barra siempre llega primero. Con
  // esta escalera de milisegundos para la barra las rondas cubren los dos órdenes de llegada.
  const RETRASOS = [0, 4, 8, 12, 16, 24, 32, 48]
  const despues = <T>(ms: number, accion: () => Promise<T>): Promise<T> => new Promise((r) => setTimeout(r, ms)).then(accion)

  beforeAll(async () => {
    api = await crearAppE2e()
    prisma = api.prisma
    // Con el servidor ya escuchando, supertest no lo abre ni lo cierra por pedido: con dos pedidos superpuestos, el primero
    // en terminar le cerraba el servidor al otro (ECONNRESET).
    const servidor = api.obtener(HttpAdapterHost).httpAdapter.getHttpServer()
    await new Promise<void>((listo) => servidor.listen(0, listo))
    fx = new FixtureDeCaja(prisma, marcadorDeLaCorrida('listo-comanda'))
    local = await armarLocal('A', ['Cocina', 'Barra'])
    sinCocina = await armarLocal('B', ['Barra', 'Parrilla'])
    // El gateway real no hace nada útil sin clientes conectados: se espía lo que emite, sin dejarlo salir.
    gateway = api.obtener(MenyuGateway)
    emitidoUpdated = jest.spyOn(gateway, 'emitOrderUpdated').mockImplementation(() => undefined)
    emitidoEdited = jest.spyOn(gateway, 'emitOrderEdited').mockImplementation(() => undefined)
  })

  afterAll(async () => {
    try {
      if (fx) {
        // Las ediciones, los ítems de pedido y los platos antes que las comandas y el restaurante (FK)
        const deLaCorrida = { restaurante: { marca: { slug: { startsWith: fx.marcador } } } }
        await prisma.pedidoEdicionItem.deleteMany({ where: { edicion: { pedido: { mesa: deLaCorrida } } } })
        await prisma.pedidoEdicion.deleteMany({ where: { pedido: { mesa: deLaCorrida } } })
        await prisma.pedidoItem.deleteMany({ where: { pedido: { mesa: deLaCorrida } } })
        await prisma.itemMenu.deleteMany({ where: deLaCorrida })
        await prisma.comanda.deleteMany({ where: deLaCorrida })
        await fx.limpiar()
      }
    } finally {
      jest.restoreAllMocks()
      if (api) await api.cerrar()
    }
  })

  // Cada caso arma su pedido y recién entonces borra lo emitido al crearlo.
  const limpiarEmisiones = () => {
    emitidoUpdated.mockClear()
    emitidoEdited.mockClear()
  }

  describe('la matriz de cierre', () => {
    it('la barra marca primero y después la cocina: la barra no cierra el pedido, la cocina sí y marca lo que faltaba', async () => {
      const p = await pedir(local, PLATO_Y_BEBIDAS)
      limpiarEmisiones()

      const barra = await marcar(local, p.pedidoId, 'Barra')

      expect(barra.status).toBe(200)
      expect(await leer(p)).toEqual({ estado: 'en_preparacion', marcados: ['cerveza', 'gin'], pendientes: ['plato'] })
      expect(updated(p)).toBe(1)
      const marcaDeLaBarra = await listoEnDe(p, 'cerveza')
      expect(marcaDeLaBarra).toBeInstanceOf(Date)
      expect(await listoEnDe(p, 'gin')).toEqual(marcaDeLaBarra)

      const cocina = await marcar(local, p.pedidoId, 'Cocina')

      expect(cocina.status).toBe(200)
      expect(cocina.body.estado).toBe('listo')
      expect(await leer(p)).toEqual({ estado: 'listo', marcados: ['cerveza', 'gin', 'plato'], pendientes: [] })
      expect(updated(p)).toBe(2)
      // lo que la barra ya había marcado conserva su instante: la cocina solo marca lo que faltaba
      expect(await listoEnDe(p, 'cerveza')).toEqual(marcaDeLaBarra)
      expect((await listoEnDe(p, 'plato'))!.getTime()).toBeGreaterThanOrEqual(marcaDeLaBarra!.getTime())
    })

    it('la cocina marca primero: cierra el pedido entero, con lo de la barra, y el "Listo" de la barra después no cambia nada', async () => {
      const p = await pedir(local, PLATO_Y_BEBIDAS)
      limpiarEmisiones()

      const cocina = await marcar(local, p.pedidoId, 'Cocina')

      expect(cocina.status).toBe(200)
      expect(await leer(p)).toEqual({ estado: 'listo', marcados: ['cerveza', 'gin', 'plato'], pendientes: [] })
      expect(updated(p)).toBe(1)
      // un solo instante para todo lo que cerró junto
      const instantes = await Promise.all(['plato', 'cerveza', 'gin'].map((e) => listoEnDe(p, e)))
      expect(new Set(instantes.map((d) => d!.getTime())).size).toBe(1)

      const barra = await marcar(local, p.pedidoId, 'Barra')

      expect(barra.status).toBe(200)
      expect(await leer(p)).toEqual({ estado: 'listo', marcados: ['cerveza', 'gin', 'plato'], pendientes: [] })
      expect(updated(p)).toBe(1)
      expect(await listoEnDe(p, 'cerveza')).toEqual(instantes[1])
    })

    it('un pedido de solo bebidas lo cierra la barra', async () => {
      const p = await pedir(local, SOLO_BEBIDAS)
      limpiarEmisiones()

      const res = await marcar(local, p.pedidoId, 'Barra')

      expect(res.status).toBe(200)
      expect(await leer(p)).toEqual({ estado: 'listo', marcados: ['cerveza', 'gin'], pendientes: [] })
      expect(updated(p)).toBe(1)
    })

    it('con un ítem sin comanda, es de cocina: la barra no cierra el pedido y la cocina sí, con el ítem sin comanda', async () => {
      const p = await pedir(local, { pan: { comanda: null }, cerveza: { comanda: 'Barra' } })
      limpiarEmisiones()

      await marcar(local, p.pedidoId, 'Barra')

      expect(await leer(p)).toEqual({ estado: 'en_preparacion', marcados: ['cerveza'], pendientes: ['pan'] })
      expect(updated(p)).toBe(1)
      expect(await listoEnDe(p, 'pan')).toBeNull()

      await marcar(local, p.pedidoId, 'Cocina')

      expect(await leer(p)).toEqual({ estado: 'listo', marcados: ['cerveza', 'pan'], pendientes: [] })
      expect(updated(p)).toBe(2)
    })

    it('con un ítem de una comanda inactiva, también es de cocina: la barra no cierra y la cocina cierra con él', async () => {
      const vieja = await prisma.comanda.create({ data: { restauranteId: local.rest, nombre: `Vieja ${randomUUID().slice(0, 8)}` } })
      local.comandas[vieja.nombre] = vieja.id
      const p = await pedir(local, { viejo: { comanda: vieja.nombre }, cerveza: { comanda: 'Barra' } })
      await prisma.comanda.update({ where: { id: vieja.id }, data: { activa: false } })
      limpiarEmisiones()

      await marcar(local, p.pedidoId, 'Barra')

      expect(await leer(p)).toEqual({ estado: 'en_preparacion', marcados: ['cerveza'], pendientes: ['viejo'] })

      await marcar(local, p.pedidoId, 'Cocina')

      expect(await leer(p)).toEqual({ estado: 'listo', marcados: ['cerveza', 'viejo'], pendientes: [] })
      expect(updated(p)).toBe(2)
    })

    describe('en un restaurante sin comanda "Cocina"', () => {
      it('sin ítems de cocina, la primera comanda que marca cierra el pedido y marca también las otras', async () => {
        const p = await pedir(sinCocina, { cerveza: { comanda: 'Barra' }, asado: { comanda: 'Parrilla' } })
        limpiarEmisiones()

        const res = await marcar(sinCocina, p.pedidoId, 'Barra')

        expect(res.status).toBe(200)
        expect(await leer(p)).toEqual({ estado: 'listo', marcados: ['asado', 'cerveza'], pendientes: [] })
        expect(updated(p)).toBe(1)
      })

      it('con un ítem sin comanda (lo único "de cocina" que queda), la barra no cierra y solo "Todas" cierra', async () => {
        const p = await pedir(sinCocina, { pan: { comanda: null }, cerveza: { comanda: 'Barra' }, asado: { comanda: 'Parrilla' } })
        limpiarEmisiones()

        await marcar(sinCocina, p.pedidoId, 'Barra')

        expect(await leer(p)).toEqual({ estado: 'en_preparacion', marcados: ['cerveza'], pendientes: ['asado', 'pan'] })
        expect(updated(p)).toBe(1)

        await marcar(sinCocina, p.pedidoId)

        expect(await leer(p)).toEqual({ estado: 'listo', marcados: ['asado', 'cerveza', 'pan'], pendientes: [] })
        expect(updated(p)).toBe(2)
      })
    })

    describe('"Todas" (sin comandaId)', () => {
      it('marca todo lo pendiente, cierra el pedido y lo avisa una sola vez', async () => {
        const p = await pedir(local, PLATO_Y_BEBIDAS)
        limpiarEmisiones()

        const res = await marcar(local, p.pedidoId)

        expect(res.status).toBe(200)
        expect(res.body.estado).toBe('listo')
        expect(await leer(p)).toEqual({ estado: 'listo', marcados: ['cerveza', 'gin', 'plato'], pendientes: [] })
        expect(updated(p)).toBe(1)
      })

      it('lo que una comanda ya había marcado conserva su instante', async () => {
        const p = await pedir(local, PLATO_Y_BEBIDAS)
        await marcar(local, p.pedidoId, 'Barra')
        const deLaBarra = await listoEnDe(p, 'cerveza')
        limpiarEmisiones()

        await marcar(local, p.pedidoId)

        expect(await leer(p)).toEqual({ estado: 'listo', marcados: ['cerveza', 'gin', 'plato'], pendientes: [] })
        expect(await listoEnDe(p, 'cerveza')).toEqual(deLaBarra)
        expect(updated(p)).toBe(1)
      })

      it('sobre un pedido que ya está listo sigue siendo una transición inválida: 400, nada cambia y no se emite', async () => {
        const p = await pedir(local, SOLO_BEBIDAS)
        await marcar(local, p.pedidoId)
        const antes = await listoEnDe(p, 'cerveza')
        limpiarEmisiones()

        const res = await marcar(local, p.pedidoId)

        expect(res.status).toBe(400)
        expect(res.body.message).toBe('Transición inválida: listo → listo')
        expect(await leer(p)).toEqual({ estado: 'listo', marcados: ['cerveza', 'gin'], pendientes: [] })
        expect(await listoEnDe(p, 'cerveza')).toEqual(antes)
        expect(updated(p)).toBe(0)
      })
    })

    it('una comanda de otro restaurante es 400 y no marca nada', async () => {
      const p = await pedir(local, SOLO_BEBIDAS)
      limpiarEmisiones()

      const res = await api.pedir('patch', `/pedidos/${p.pedidoId}/estado`, {
        usuarioId: local.cocina,
        body: { estado: 'listo', comandaId: sinCocina.comandas.Parrilla },
      })

      expect(res.status).toBe(400)
      expect(await leer(p)).toEqual({ estado: 'en_preparacion', marcados: [], pendientes: ['cerveza', 'gin'] })
      expect(updated(p)).toBe(0)
    })

    it('una línea eliminada por una edición no es pendiente: la barra cierra aunque el plato de cocina siga en la base', async () => {
      const p = await pedir(local, { ...PLATO_Y_BEBIDAS, flan: { comanda: 'Cocina' } })
      await editar(local, p, { plato: 0, flan: 0 })
      limpiarEmisiones()

      await marcar(local, p.pedidoId, 'Barra')

      expect(await leer(p)).toEqual({ estado: 'listo', marcados: ['cerveza', 'gin'], pendientes: [] })
      expect(updated(p)).toBe(1)
    })
  })

  describe('dos llamadas a la vez (el bloqueo de la fila del pedido)', () => {

    it('la barra y la cocina a la vez: siempre queda listo, con todo marcado y sin error, sea cual sea el orden', async () => {
      const distribucion: Record<string, number> = {}
      for (let i = 0; i < RONDAS; i++) {
        const p = await pedir(local, PLATO_Y_BEBIDAS)
        limpiarEmisiones()

        const [barra, cocina] = await Promise.all([marcar(local, p.pedidoId, 'Barra'), marcar(local, p.pedidoId, 'Cocina')])

        expect([barra.status, cocina.status]).toEqual([200, 200])
        expect(await leer(p)).toEqual({ estado: 'listo', marcados: ['cerveza', 'gin', 'plato'], pendientes: [] })
        // si la barra fue primera se avisó dos veces (la suya y el cierre); si fue la cocina, una (la barra ya no hace nada)
        expect([1, 2]).toContain(updated(p))
        contar(distribucion, `${updated(p)} avisos`)
      }
      mostrarDistribucion(`barra y cocina a la vez: ${JSON.stringify(distribucion)}`)
    })

    it('la misma comanda de la barra dos veces: las dos dan 200, se marca una vez y se avisa una vez', async () => {
      for (let i = 0; i < RONDAS; i++) {
        const p = await pedir(local, PLATO_Y_BEBIDAS)
        limpiarEmisiones()

        const [uno, dos] = await Promise.all([marcar(local, p.pedidoId, 'Barra'), marcar(local, p.pedidoId, 'Barra')])

        expect([uno.status, dos.status]).toEqual([200, 200])
        expect(await leer(p)).toEqual({ estado: 'en_preparacion', marcados: ['cerveza', 'gin'], pendientes: ['plato'] })
        expect(await listoEnDe(p, 'cerveza')).toEqual(await listoEnDe(p, 'gin'))
        expect(updated(p)).toBe(1)
      }
    })

    it('la misma comanda de la cocina dos veces: las dos dan 200, cierra una vez y se avisa una vez', async () => {
      for (let i = 0; i < RONDAS; i++) {
        const p = await pedir(local, PLATO_Y_BEBIDAS)
        limpiarEmisiones()

        const [uno, dos] = await Promise.all([marcar(local, p.pedidoId, 'Cocina'), marcar(local, p.pedidoId, 'Cocina')])

        expect([uno.status, dos.status]).toEqual([200, 200])
        expect(await leer(p)).toEqual({ estado: 'listo', marcados: ['cerveza', 'gin', 'plato'], pendientes: [] })
        expect(updated(p)).toBe(1)
      }
    })

    it('la barra marca mientras se elimina el plato de cocina: sea cual sea el orden, el pedido termina listo', async () => {
      const distribucion: Record<string, number> = {}
      for (let i = 0; i < RONDAS; i++) {
        const p = await pedir(local, PLATO_Y_BEBIDAS)
        limpiarEmisiones()

        const [barra, edicion] = await Promise.all([despues(RETRASOS[i], () => marcar(local, p.pedidoId, 'Barra')), editar(local, p, { plato: 0 })])

        expect([barra.status, edicion.status]).toEqual([200, 200])
        expect(await leer(p)).toEqual({ estado: 'listo', marcados: ['cerveza', 'gin'], pendientes: [] })
        expect(edited(p)).toBe(1)
        // la barra siempre avisa; la edición avisa además si fue ella la que cerró
        expect([1, 2]).toContain(updated(p))
        contar(distribucion, `${updated(p)} avisos`)
      }
      mostrarDistribucion(`barra y edición a la vez: ${JSON.stringify(distribucion)}`)
    })
  })

  describe('la edición', () => {
    it('que elimina lo único que faltaba deja el pedido listo, en la misma transacción, y avisa edited y updated', async () => {
      const p = await pedir(local, PLATO_Y_BEBIDAS)
      await marcar(local, p.pedidoId, 'Barra')
      limpiarEmisiones()

      const res = await editar(local, p, { plato: 0 })

      expect(res.status).toBe(200)
      expect(res.body.estado).toBe('listo')
      expect(await leer(p)).toEqual({ estado: 'listo', marcados: ['cerveza', 'gin'], pendientes: [] })
      expect(edited(p)).toBe(1)
      expect(updated(p)).toBe(1)
    })

    it('que deja algo vigente pendiente no cierra: sigue en preparación y solo avisa edited', async () => {
      const p = await pedir(local, { ...PLATO_Y_BEBIDAS, flan: { comanda: 'Cocina', cantidad: 2 } })
      await marcar(local, p.pedidoId, 'Barra')
      limpiarEmisiones()

      const res = await editar(local, p, { plato: 0, flan: 1 })

      expect(res.status).toBe(200)
      expect(await leer(p)).toEqual({ estado: 'en_preparacion', marcados: ['cerveza', 'gin'], pendientes: ['flan'] })
      expect(edited(p)).toBe(1)
      expect(updated(p)).toBe(0)
    })

    it('sobre un pedido que nadie marcó, eliminar una línea no lo cierra si quedan pendientes', async () => {
      const p = await pedir(local, PLATO_Y_BEBIDAS)
      limpiarEmisiones()

      await editar(local, p, { gin: 0 })

      expect(await leer(p)).toEqual({ estado: 'en_preparacion', marcados: [], pendientes: ['cerveza', 'plato'] })
      expect(updated(p)).toBe(0)
    })

    it('que anula el pedido entero lo deja anulado, no listo, y no avisa updated', async () => {
      const p = await pedir(local, PLATO_Y_BEBIDAS)
      await marcar(local, p.pedidoId, 'Barra')
      limpiarEmisiones()

      const res = await editar(local, p, { plato: 0, cerveza: 0, gin: 0 })

      expect(res.status).toBe(200)
      expect(res.body.estado).toBe('anulado')
      expect((await leer(p)).estado).toBe('anulado')
      expect(edited(p)).toBe(1)
      expect(updated(p)).toBe(0)
    })
  })

  describe('la anulación seguida de un "Listo"', () => {
    it.each([
      ['de una comanda', 'Barra'],
      ['de la cocina', 'Cocina'],
      ['de "Todas"', undefined],
    ])('el "Listo" %s sobre un pedido anulado es 400, no marca nada y no se emite', async (_caso, comanda) => {
      const p = await pedir(local, PLATO_Y_BEBIDAS)
      await editar(local, p, { plato: 0, cerveza: 0, gin: 0 })
      limpiarEmisiones()

      const res = await marcar(local, p.pedidoId, comanda)

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Transición inválida: anulado → listo')
      // las líneas anuladas siguen en 0 y ninguna quedó marcada
      expect(await leer(p)).toEqual({ estado: 'anulado', marcados: [], pendientes: [] })
      expect(await Promise.all(['plato', 'cerveza', 'gin'].map((e) => listoEnDe(p, e)))).toEqual([null, null, null])
      expect(updated(p)).toBe(0)
    })

    it('la anulación y un "Listo" a la vez: el pedido termina anulado, sin errores de servidor ni líneas marcadas por la mitad', async () => {
      const distribucion: Record<string, number> = {}
      for (let i = 0; i < RONDAS; i++) {
        const p = await pedir(local, SOLO_BEBIDAS)
        limpiarEmisiones()

        const [listo, anulacion] = await Promise.all([despues(RETRASOS[i], () => marcar(local, p.pedidoId, 'Barra')), editar(local, p, { cerveza: 0, gin: 0 })])

        // La edición anula siempre (no revalida el estado dentro de la transacción). Si el "Listo" va primero, queda en 200 y
        // después se anula; si la anulación va primero, el "Listo" ve el pedido anulado con el bloqueo y es un 400.
        expect(anulacion.status).toBe(200)
        expect([200, 400]).toContain(listo.status)
        expect(await leer(p)).toEqual({ estado: 'anulado', marcados: [], pendientes: [] })
        // un "Listo" rechazado no avisa; uno que entró avisa una vez
        expect(updated(p)).toBe(listo.status === 200 ? 1 : 0)
        contar(distribucion, `listo ${listo.status}`)
      }
      mostrarDistribucion(`anulación y listo a la vez: ${JSON.stringify(distribucion)}`)
    })
  })
})
