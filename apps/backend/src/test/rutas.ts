import 'reflect-metadata'
import { RequestMethod, Type } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'

/** Una ruta de la API tal como la declaran los controllers (sin el prefijo global `api`). */
export interface RutaDeLaApp {
  controller: Type
  /** La función del controller que atiende la ruta: tiene los metadatos de los decoradores de la ruta. */
  manejador: object
  metodo: string
  /** Con barra al principio y sin barra al final: `/root/roots/:id/restablecer-password`. */
  ruta: string
}

const NOMBRES_DE_METODO: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.ALL]: 'ALL',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
}

const unir = (...partes: string[]) => `/${partes.map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`

/** Todos los controllers que cuelgan de un módulo, siguiendo sus imports (también los dinámicos, como `JwtModule.register`). */
export function controllersDe(modulo: unknown, vistos = new Set<unknown>()): Type[] {
  const clase = (modulo as { module?: unknown }).module ?? modulo
  if (vistos.has(clase)) return []
  vistos.add(clase)
  const propios: Type[] = Reflect.getMetadata('controllers', clase as object) ?? []
  const importados: unknown[] = Reflect.getMetadata('imports', clase as object) ?? []
  return [...propios, ...importados.flatMap((m) => controllersDe(m, vistos))]
}

/** Las rutas (método y camino) que declara un controller con `@Controller`, `@Get`, `@Post`… */
export function rutasDe(controller: Type): RutaDeLaApp[] {
  const base: string | string[] = Reflect.getMetadata(PATH_METADATA, controller) ?? ''
  const prefijos = Array.isArray(base) ? base : [base]
  const rutas: RutaDeLaApp[] = []
  for (const nombre of Object.getOwnPropertyNames(controller.prototype)) {
    if (nombre === 'constructor') continue
    const manejador = (controller.prototype as Record<string, unknown>)[nombre]
    if (typeof manejador !== 'function') continue
    const metodo: number | undefined = Reflect.getMetadata(METHOD_METADATA, manejador)
    if (metodo === undefined) continue
    const camino: string | string[] = Reflect.getMetadata(PATH_METADATA, manejador) ?? ''
    for (const prefijo of prefijos) {
      for (const parte of Array.isArray(camino) ? camino : [camino]) {
        rutas.push({ controller, manejador, metodo: NOMBRES_DE_METODO[metodo] ?? String(metodo), ruta: unir(prefijo, parte) })
      }
    }
  }
  return rutas
}

/** Todas las rutas de la aplicación, recorriendo AppModule. */
export function rutasDeLaApp(modulo: unknown): RutaDeLaApp[] {
  return controllersDe(modulo).flatMap(rutasDe)
}

/** Los guards de una ruta en el orden en que corren: primero los del controller, después los de la ruta. */
export function guardsDe(ruta: RutaDeLaApp): unknown[] {
  return [...(Reflect.getMetadata(GUARDS_METADATA, ruta.controller) ?? []), ...(Reflect.getMetadata(GUARDS_METADATA, ruta.manejador) ?? [])]
}

/** Un metadato de la ruta, o el del controller si la ruta no lo declara (como `Reflector.getAllAndOverride`). */
export function metadatoDe<T>(ruta: RutaDeLaApp, clave: string): T | undefined {
  return Reflect.getMetadata(clave, ruta.manejador) ?? Reflect.getMetadata(clave, ruta.controller)
}
