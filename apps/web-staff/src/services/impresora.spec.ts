import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItemPedidoRico, PedidoRico } from './api'
import { conectarImpresora, imprimirPedido, MARCA_LISTO } from './impresora'
import { pedidoParaImprimir } from '../utils/comandasDeCocina'

// El encoder menciona ImageData al cargarse (es de los navegadores y jsdom no lo trae); acá no se imprimen imágenes.
vi.hoisted(() => {
  Object.assign(globalThis, { ImageData: class {} })
})

const BARRA = 'comanda-barra'
const COCINA = 'comanda-cocina'
const LISTO_EN = '2026-11-27T15:00:00.000Z'

const linea = (nombre: string, comandaId: string | null, listoEn: string | null = null): ItemPedidoRico => ({
  id: `it-${nombre}`,
  itemId: `m-${nombre}`,
  cantidad: 1,
  cantidadEditada: null,
  precioUnitario: 100,
  notas: null,
  comandaId,
  listoEn,
  item: { nombre },
  mods: [],
})

const pedidoCon = (items: ItemPedidoRico[]): PedidoRico =>
  ({
    id: 'pedido-abc123',
    sesionId: 's-1',
    mesaId: 'mesa-1',
    estado: 'en_preparacion',
    createdAt: '2026-11-27T14:00:00.000Z',
    updatedAt: '2026-11-27T14:00:00.000Z',
    mesa: { numero: '1' },
    items,
  }) as PedidoRico

// Lo que le llegó a la impresora, como texto: los bytes de control salen como caracteres sueltos y el texto, intacto.
const transferOut = vi.fn<(endpoint: number, datos: Uint8Array) => Promise<void>>()
const impreso = () => Buffer.from(transferOut.mock.calls[transferOut.mock.calls.length - 1][1]).toString('latin1')

beforeEach(async () => {
  transferOut.mockReset()
  transferOut.mockResolvedValue(undefined)
  const dispositivo = {
    configuration: { interfaces: [{ alternates: [{ endpoints: [{ type: 'bulk', direction: 'out', endpointNumber: 2 }] }] }] },
    open: vi.fn().mockResolvedValue(undefined),
    selectConfiguration: vi.fn().mockResolvedValue(undefined),
    claimInterface: vi.fn().mockResolvedValue(undefined),
    transferOut,
  }
  vi.stubGlobal('navigator', { usb: { requestDevice: vi.fn().mockResolvedValue(dispositivo) } })
  await conectarImpresora()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('imprimirPedido: la marca de las líneas ya listas', () => {
  it('una línea con listoEn sale marcada, en ASCII', async () => {
    await imprimirPedido(pedidoCon([linea('Coca cola', BARRA, LISTO_EN)]))

    expect(impreso()).toContain(`${MARCA_LISTO} 1x Coca cola`)
    expect(MARCA_LISTO).toBe('[LISTO]')
    expect(MARCA_LISTO).toMatch(/^[\x20-\x7e]+$/)
  })

  it('una línea sin listoEn sale como siempre, sin marca', async () => {
    await imprimirPedido(pedidoCon([linea('Plato de prueba', COCINA)]))

    const texto = impreso()
    expect(texto).toContain('1x Plato de prueba')
    expect(texto).not.toContain(MARCA_LISTO)
  })

  it('en un pedido de "Todas" con la bebida ya marcada por la barra, solo la bebida sale marcada', async () => {
    const pedido = pedidoCon([linea('Plato de prueba', COCINA), linea('Coca cola', BARRA, LISTO_EN)])

    const paraImprimir = pedidoParaImprimir(pedido, null, [BARRA, COCINA])
    await imprimirPedido(paraImprimir!)

    const texto = impreso()
    expect(texto).toContain(`${MARCA_LISTO} 1x Coca cola`)
    expect(texto).toContain('1x Plato de prueba')
    expect(texto).not.toContain(`${MARCA_LISTO} 1x Plato de prueba`)
    expect(texto.split(MARCA_LISTO)).toHaveLength(2)
  })

  it('al entrar (ninguna línea lista) el ticket no lleva marca', async () => {
    await imprimirPedido(pedidoCon([linea('Plato de prueba', COCINA), linea('Coca cola', BARRA)]))

    expect(impreso()).not.toContain(MARCA_LISTO)
  })

  it('la marca va con la cantidad vigente cuando la línea fue editada', async () => {
    const editada = { ...linea('Coca cola', BARRA, LISTO_EN), cantidadEditada: 2 }
    await imprimirPedido(pedidoCon([editada]))

    expect(impreso()).toContain(`${MARCA_LISTO} 2x Coca cola`)
  })
})
