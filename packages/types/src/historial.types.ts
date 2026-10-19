// Una sesión de mesa cerrada, con sus pedidos y ediciones (GET /sessions/historial).
export interface SesionHistorial {
  sesionId: string
  mesaNumero: string
  iniciadaEn: string
  cerradaEn: string
  cantidadPedidos: number
  totalSesion: number
  pedidos: {
    id: string
    estado: string
    createdAt: string
    totalPedido: number
    tieneEdiciones: boolean
    items: {
      id: string
      cantidad: number
      cantidadEditada: number | null
      precioUnitario: number
      itemNombre: string
      mods: {
        accion: string
        ingredienteNombre: string
      }[]
    }[]
    ediciones: {
      id: string
      justificacion: string
      creadoEn: string
      editor: { nombre: string; tipo: 'gerente' | 'mozo' }
      itemsEliminados: {
        itemNombre: string
        cantidadAntes: number
        cantidadDespues: number
        precioUnitario: number
        esAnulacion: boolean
      }[]
    }[]
  }[]
}
