// Gestión de impresora térmica via Web USB API
// Compatible con ESC/POS (Gadnic IT1050 y similares)
import ThermalPrinterEncoder from 'thermal-printer-encoder'
import type { PedidoRico } from './api'

let device: USBDevice | null = null
let endpointNumber = 1 // fallback; se descubre en conectar()

export async function conectarImpresora(): Promise<void> {
  device = await navigator.usb.requestDevice({ filters: [] })
  await device.open()
  if (device.configuration === null) await device.selectConfiguration(1)
  await device.claimInterface(0)

  // Descubrir el endpoint bulk-out correcto en runtime
  const iface = device.configuration!.interfaces[0]
  const alt = iface.alternates[0]
  const ep = alt.endpoints.find((e: USBEndpoint) => e.type === 'bulk' && e.direction === 'out')
  if (ep) endpointNumber = ep.endpointNumber
}

export function impresoraConectada(): boolean {
  return device !== null
}

export async function testPrint(): Promise<void> {
  if (!device) return
  // Secuencia ESC/POS mínima sin encoder: init + texto + corte
  const bytes = new Uint8Array([
    0x1B, 0x40,             // ESC @ — inicializar
    0x1B, 0x61, 0x01,       // ESC a 1 — centrar
    0x1B, 0x21, 0x10,       // ESC ! — doble alto
    ...new TextEncoder().encode('MENYU TEST\n'),
    0x1B, 0x21, 0x00,       // ESC ! — normal
    ...new TextEncoder().encode('Impresora OK\n\n\n'),
    0x1D, 0x56, 0x41, 0x00, // GS V A 0 — corte parcial
  ])
  await device.transferOut(endpointNumber, bytes)
}

export async function imprimirPedido(pedido: PedidoRico): Promise<void> {
  if (!device) return // silencioso si no hay impresora conectada

  const encoder = new ThermalPrinterEncoder({ language: 'esc-pos', width: 32 })

  let enc = encoder
    .initialize()
    .align('center')
    .bold(true)
    .line(`MESA ${pedido.mesa.numero}`)
    .bold(false)
    .line(`Pedido #${pedido.id.slice(-6).toUpperCase()}`)
    .line(`${new Date(pedido.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`)
    .rule()
    .align('left')

  for (const item of pedido.items) {
    const cant = item.cantidadEditada ?? item.cantidad
    enc = enc.bold(true).line(`${cant}x ${item.item.nombre}`).bold(false)

    for (const mod of item.mods) {
      const nombre = mod.itemIngrediente?.ingrediente?.nombre ?? ''
      if (!nombre) continue
      const linea = mod.accion.toLowerCase() === 'agregar'
        ? `  +${mod.cantidad} ${nombre}`
        : `  sin ${nombre}`
      enc = enc.line(linea)
    }

    if (item.notas) enc = enc.line(`  Nota: ${item.notas}`)

    enc = enc.newline()
  }

  const data = enc.rule().newline().cut().encode()
  await device.transferOut(endpointNumber, data)
}
