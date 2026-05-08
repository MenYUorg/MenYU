export type EstadoSesion = 'activa' | 'cerrada'
export type EstadoMesa = 'libre' | 'ocupada' | 'reservada'
export type ModoSesion = 'abierto' | 'seguro'

export interface Mesa {
  id: string
  restauranteId: string
  numero: string
  qrToken: string
  pin: string
  estado: EstadoMesa
  activo: boolean
}

export interface SesionMesa {
  id: string
  mesaId: string
  clienteId: string
  codigoSesion: string
  iniciadaEn: string
  cerradaEn: string | null
  estado: EstadoSesion
}

export interface SesionMesaCliente {
  sesionId: string
  clienteId: string
  orden: number
  ingresadoEn: string
}

export interface AsignacionMesa {
  id: string
  mesaId: string
  mozoId: string
  sesionId: string
  origen: string
  asignadoEn: string
  liberadoEn: string | null
}

export interface OpenSessionResult {
  sesionId: string
  mesaId: string
  codigoSesion: string
  clienteId: string
  jwt: string
  esAnfitrion: boolean
}
