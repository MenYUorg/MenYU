import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { MUNDO } from '../test/acceso-de-test'
import { BaseDeCaja, baseDeCajaVacia, conectarBaseDeCaja } from '../test/caja-en-memoria'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { HistorialService, MENSAJE_CURSOR_INVALIDO } from './historial.service'

const REST = MUNDO.REST_1
const D = (monto: number | string) => new Prisma.Decimal(monto)
/** Un id con forma de uuid, para que el orden por id sea el de `n`. */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
/** Una hora del 10/11/2026: las horas más altas son los turnos más nuevos. */
const hora = (h: number) => new Date(Date.UTC(2026, 10, 10, h))

describe('HistorialService', () => {
  let prisma: PrismaMock
  let base: BaseDeCaja
  let service: HistorialService

  const listar = (dto: { limite?: number; cursor?: string; restauranteId?: string } = {}) => service.listar({ restauranteId: REST, ...dto })
  /** Un turno cerrado (o abierto, con `abierto`) del restaurante, sin cajas. */
  const turno = (n: number, abiertoEn: Date, { restauranteId = REST, abierto = false }: { restauranteId?: string; abierto?: boolean } = {}) =>
    base.turnos.push({
      id: id(n),
      restauranteId,
      abiertoPorUsuarioId: 'u-abre',
      abiertoEn,
      cerradoEn: abierto ? null : new Date(abiertoEn.getTime() + 3_600_000),
      cerradoPorUsuarioId: abierto ? null : 'u-cierra',
      observaciones: null,
    })
  /** Recorre todas las páginas y devuelve los ids de cada una. */
  async function paginas(limite: number) {
    const resultado: string[][] = []
    let cursor: string | undefined
    do {
      const pagina = await listar({ limite, cursor })
      resultado.push(pagina.items.map((t) => t.id))
      cursor = pagina.siguiente ?? undefined
    } while (cursor)
    return resultado
  }

  beforeEach(() => {
    prisma = crearPrismaMock()
    base = baseDeCajaVacia()
    base.usuarios = { 'u-abre': 'Ana', 'u-cierra': 'Beto' }
    base.cajas.push(
      { id: 'caja-p', restauranteId: REST, nombre: 'Principal', activa: true },
      { id: 'caja-b', restauranteId: REST, nombre: 'Barra', activa: true },
    )
    conectarBaseDeCaja(prisma, base)
    service = new HistorialService(comoPrisma(prisma))
  })

  describe('el orden y la paginación', () => {
    it('del más nuevo al más viejo; con el mismo abiertoEn, por id descendente', async () => {
      turno(1, hora(10))
      turno(2, hora(12))
      turno(3, hora(11))
      turno(4, hora(11))

      expect((await listar()).items.map((t) => t.id)).toEqual([id(2), id(4), id(3), id(1)])
    })

    it('sin limite son 30 por página, y el 31 es el siguiente', async () => {
      for (let n = 1; n <= 31; n++) turno(n, hora(n))

      const pagina = await listar()

      expect(pagina.items).toHaveLength(30)
      expect(pagina.siguiente).toBe(id(1))
    })

    it('recorrer todas las páginas no deja huecos ni repite: 7 turnos de a 3 son 3 + 3 + 1', async () => {
      for (let n = 1; n <= 7; n++) turno(n, hora(n))

      const recorridas = await paginas(3)

      expect(recorridas).toEqual([
        [id(7), id(6), id(5)],
        [id(4), id(3), id(2)],
        [id(1)],
      ])
    })

    it('con exactamente `limite` turnos no hay siguiente; con uno más, el siguiente es ese', async () => {
      for (let n = 1; n <= 3; n++) turno(n, hora(n))
      expect(await listar({ limite: 3 })).toMatchObject({ siguiente: null })

      turno(4, hora(0))
      expect((await listar({ limite: 3 })).siguiente).toBe(id(4))
    })

    it('un cursor de otro restaurante o que no existe es 400, sin listar nada', async () => {
      turno(1, hora(1))
      turno(9, hora(2), { restauranteId: MUNDO.REST_B })

      for (const cursor of [id(9), id(99)]) {
        const error = await listar({ cursor }).catch((e: unknown) => e)
        expect(error).toBeInstanceOf(BadRequestException)
        expect((error as Error).message).toBe(MENSAJE_CURSOR_INVALIDO)
      }
      expect(prisma.turno.findMany).not.toHaveBeenCalled()
    })

    it('los turnos de otro restaurante nunca aparecen', async () => {
      turno(1, hora(1))
      turno(2, hora(2), { restauranteId: MUNDO.REST_B })
      turno(3, hora(3))

      expect((await listar()).items.map((t) => t.id)).toEqual([id(3), id(1)])
    })
  })

  describe('cada turno', () => {
    it('uno abierto (primero, con arqueo null) y uno cerrado con las 4 filas por caja, en el orden del arqueo', async () => {
      turno(1, hora(10))
      turno(2, hora(20), { abierto: true })
      base.turnos[1].observaciones = 'Noche de partido'
      base.turnoCajas.push(
        { id: 'ap-p1', turnoId: id(1), cajaId: 'caja-p', fondoInicial: D('1000.50'), abiertoEn: hora(10), cerradoEn: hora(11) },
        { id: 'ap-b1', turnoId: id(1), cajaId: 'caja-b', fondoInicial: D(0), abiertoEn: hora(10), cerradoEn: hora(11) },
        { id: 'ap-p2', turnoId: id(2), cajaId: 'caja-p', fondoInicial: D(500), abiertoEn: hora(20), cerradoEn: null },
      )
      // Cargadas fuera de orden: salen como METODOS_ARQUEO.
      const fila = (turnoCajaId: string, metodo: string, esperado: string, declarado: string) => ({
        turnoCajaId,
        metodo,
        esperado: D(esperado),
        declarado: D(declarado),
        diferencia: D(declarado).minus(esperado),
      })
      base.arqueos.push(
        fila('ap-p1', 'transferencia', '0', '0'),
        fila('ap-p1', 'efectivo', '1500.50', '1450'),
        fila('ap-p1', 'credito', '200', '200'),
        fila('ap-p1', 'debito', '300.25', '310'),
        fila('ap-b1', 'credito', '0', '0'),
        fila('ap-b1', 'debito', '0', '0'),
        fila('ap-b1', 'efectivo', '0', '5'),
        fila('ap-b1', 'transferencia', '0', '0'),
      )

      const { items } = await listar()

      const sinMovimientos = { cantidad: 0, ingresos: 0, egresos: 0 }
      expect(items).toEqual([
        {
          id: id(2),
          abiertoEn: hora(20),
          abiertoPor: { id: 'u-abre', nombre: 'Ana' },
          cerradoEn: null,
          cerradoPor: null,
          observaciones: 'Noche de partido',
          cajas: [{ id: 'ap-p2', cajaId: 'caja-p', nombre: 'Principal', fondoInicial: 500, arqueo: null, movimientos: sinMovimientos }],
        },
        {
          id: id(1),
          abiertoEn: hora(10),
          abiertoPor: { id: 'u-abre', nombre: 'Ana' },
          cerradoEn: hora(11),
          cerradoPor: { id: 'u-cierra', nombre: 'Beto' },
          observaciones: null,
          cajas: [
            {
              id: 'ap-b1',
              cajaId: 'caja-b',
              nombre: 'Barra',
              fondoInicial: 0,
              arqueo: [
                { metodo: 'efectivo', esperado: 0, declarado: 5, diferencia: 5 },
                { metodo: 'debito', esperado: 0, declarado: 0, diferencia: 0 },
                { metodo: 'credito', esperado: 0, declarado: 0, diferencia: 0 },
                { metodo: 'transferencia', esperado: 0, declarado: 0, diferencia: 0 },
              ],
              movimientos: sinMovimientos,
            },
            {
              id: 'ap-p1',
              cajaId: 'caja-p',
              nombre: 'Principal',
              fondoInicial: 1000.5,
              arqueo: [
                { metodo: 'efectivo', esperado: 1500.5, declarado: 1450, diferencia: -50.5 },
                { metodo: 'debito', esperado: 300.25, declarado: 310, diferencia: 9.75 },
                { metodo: 'credito', esperado: 200, declarado: 200, diferencia: 0 },
                { metodo: 'transferencia', esperado: 0, declarado: 0, diferencia: 0 },
              ],
              movimientos: sinMovimientos,
            },
          ],
        },
      ])
    })

    it('los totales de los movimientos por caja: ingresos y egresos sumados aparte, y la cantidad de los dos', async () => {
      turno(1, hora(10))
      base.turnoCajas.push(
        { id: 'ap-p1', turnoId: id(1), cajaId: 'caja-p', fondoInicial: D(0), abiertoEn: hora(10), cerradoEn: hora(11) },
        { id: 'ap-b1', turnoId: id(1), cajaId: 'caja-b', fondoInicial: D(0), abiertoEn: hora(10), cerradoEn: hora(11) },
      )
      const movimiento = (turnoCajaId: string, tipo: string, monto: string) =>
        base.movimientos.push({ id: `m-${base.movimientos.length}`, turnoCajaId, tipo, monto: D(monto), motivo: 'x', usuarioId: 'u-abre', createdAt: hora(10) })
      movimiento('ap-p1', 'INGRESO', '2000')
      movimiento('ap-p1', 'INGRESO', '0.10')
      movimiento('ap-p1', 'EGRESO', '750.50')
      movimiento('ap-p1', 'EGRESO', '0.20')
      movimiento('ap-p1', 'EGRESO', '49.30')
      movimiento('ap-b1', 'EGRESO', '300')

      const [{ cajas }] = (await listar()).items

      expect(cajas.map((c) => [c.nombre, c.movimientos])).toEqual([
        ['Barra', { cantidad: 1, ingresos: 0, egresos: 300 }],
        // 2000 + 0,10 = 2000,10; 750,50 + 0,20 + 49,30 = 800.
        ['Principal', { cantidad: 5, ingresos: 2000.1, egresos: 800 }],
      ])
    })

    it('una página son 1 groupBy de movimientos y 1 findMany de arqueo, con las cajas de esa página y no las del turno de más', async () => {
      for (let n = 1; n <= 5; n++) {
        turno(n, hora(n))
        base.turnoCajas.push({ id: `ap-${n}`, turnoId: id(n), cajaId: 'caja-p', fondoInicial: D(0), abiertoEn: hora(n), cerradoEn: hora(n + 1) })
      }

      await listar({ limite: 3 })

      const enLaPagina = { turnoCajaId: { in: ['ap-5', 'ap-4', 'ap-3'] } }
      expect(prisma.movimientoCaja.groupBy).toHaveBeenCalledTimes(1)
      expect(prisma.movimientoCaja.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: enLaPagina }))
      expect(prisma.arqueoMetodo.findMany).toHaveBeenCalledTimes(1)
      expect(prisma.arqueoMetodo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: enLaPagina }))
      expect(prisma.turno.findMany).toHaveBeenCalledTimes(1)
    })
  })
})
