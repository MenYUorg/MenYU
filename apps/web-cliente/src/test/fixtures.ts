import type { ItemIngrediente, MenuPublico, MenuPublicoItem } from '@menyu/types'
import type { api } from '../services/api'

/** Plato del menú público. Por defecto no tiene descuento ni ingredientes. */
export function crearPlato(parcial: Partial<MenuPublicoItem> = {}): MenuPublicoItem {
  const precioBase = parcial.precioBase ?? 1000
  return {
    id: 'plato-1',
    nombre: 'Milanesa',
    descripcion: null,
    precioBase,
    precioDescuento: null,
    porcentajeDescuento: null,
    precioVigente: parcial.precioDescuento ?? precioBase,
    imagenUrl: null,
    ingredientes: [],
    clasificaciones: [],
    ...parcial,
  }
}

/** Plato en descuento, con el porcentaje y el precio vigente que calcula el backend. */
export function crearPlatoEnDescuento(
  parcial: Partial<MenuPublicoItem> & { precioBase: number; precioDescuento: number },
): MenuPublicoItem {
  return crearPlato({
    porcentajeDescuento: Math.round((1 - parcial.precioDescuento / parcial.precioBase) * 100),
    precioVigente: parcial.precioDescuento,
    ...parcial,
  })
}

/** Ingrediente que se puede agregar a un plato pagando un extra. */
export function crearExtra(parcial: Partial<ItemIngrediente> = {}): ItemIngrediente {
  return {
    id: 'ii-extra',
    itemId: 'plato-1',
    ingredienteId: 'ing-extra',
    esOriginal: false,
    cantidad: 1,
    esRemovible: false,
    esAgregable: true,
    precioExtra: 100,
    cantidadMin: 0,
    cantidadMax: 3,
    ...parcial,
  }
}

export function crearMenu(parcial: Partial<MenuPublico> = {}): MenuPublico {
  return {
    restaurante: { id: 'rest-1', nombre: 'La Parrilla', nombreSeccionRecomendados: 'RECOMENDACIONES' },
    categorias: [],
    recomendados: [],
    descuentos: [],
    ...parcial,
  }
}

type RespuestaSesion = Awaited<ReturnType<typeof api.sessions.open>>

/** Respuesta de `POST /sessions/open`. Por defecto: mesa 5 en modo abierto y quien entra no es el anfitrión. */
export function crearSesionAbierta(parcial: Partial<RespuestaSesion> = {}): RespuestaSesion {
  return {
    sesionId: 'ses-1',
    mesaId: 'mesa-1',
    restauranteId: 'rest-1',
    jwt: 'jwt.de.la.sesion',
    numeroMesa: '5',
    codigoSesion: '042',
    modoSesion: 'abierto',
    esAnfitrion: false,
    ...parcial,
  }
}

/** JWT de mentira con ese contenido, codificado como el real (JSON en UTF-8, base64url): sirve para probar nombres con acentos. */
export function crearTokenJwt(payload: Record<string, unknown>): string {
  const base64url = (texto: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(texto))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(JSON.stringify(payload))}.firma`
}
