import type { ConfigDeAbm } from '../abm/tipos'

/** El 409 de un nombre repetido: apps/backend/src/comandas/comandas.service.ts (nombre repetido en el restaurante). */
export const MENSAJE_NOMBRE_REPETIDO = 'Ya hay una comanda con ese nombre en este restaurante'

/**
 * El largo máximo del nombre de una comanda: `MAX_NOMBRE_COMANDA` de apps/backend/src/comandas/dto/crear-comanda.dto.ts
 * (el servicio, apps/backend/src/comandas/comandas.service.ts, recorta el nombre). El backend lo cuenta con `isLength`
 * de validator, que resta los pares sustitutos (un emoji cuenta uno); acá se cuenta con `.length` (unidades UTF-16),
 * que es igual o más estricto: la pantalla nunca acepta un nombre que el backend rechace.
 */
export const MAXIMO_NOMBRE_DE_COMANDA = 40

/**
 * El 409 de desactivar una comanda con platos asignados ("La comanda tiene 1 plato asignado: cambialo de comanda antes
 * de desactivarla", o "La comanda tiene N platos asignados: cambialos de comanda ..."): la lista quedó vieja.
 */
export const esConflictoQueReleer = (mensaje: string) => /^La comanda tiene \d+ platos? asignados?:/.test(mensaje)

/** Todo lo propio de las comandas en el ABM común (#344): textos y reglas de los errores. */
export const CONFIG_DE_COMANDAS: ConfigDeAbm = {
  tituloDelAlta: 'Nueva comanda',
  ayudaDelAlta: 'Una comanda es el puesto donde se prepara un plato (Cocina, Barra…). No se borra: se desactiva, y no se puede desactivar si tiene platos asignados.',
  tituloDeLaLista: 'Comandas',
  textoVacio: 'Todavía no hay comandas. Creá la primera para asignarla a los platos desde el menú. Sin comandas, la cocina ve todos los pedidos juntos.',
  ariaLabelDeLaLista: 'Comandas del restaurante',
  etiquetaDeCarga: 'Cargando las comandas',
  errorDeLecturaPorDefecto: 'No se pudieron leer las comandas',
  seleccionaRestaurante: 'Seleccioná un restaurante para ver las comandas',
  etiquetaDelCampo: 'Nombre de la comanda',
  placeholderDelAlta: 'Ej: Barra',
  textoDelBotonDeAlta: 'Agregar comanda',
  maximoDelNombre: MAXIMO_NOMBRE_DE_COMANDA,
  mensajeNombreVacio: 'Escribí el nombre de la comanda',
  errorAlCrear: 'No se pudo crear la comanda',
  errorAlRenombrar: 'No se pudo renombrar la comanda',
  errorAlActivar: 'No se pudo activar la comanda',
  errorAlDesactivar: 'No se pudo desactivar la comanda',
  noEncontrada: 'Comanda no encontrada',
  mensajeNombreRepetido: MENSAJE_NOMBRE_REPETIDO,
  esConflictoQueReleer,
  textoDeConfirmacion: (etiqueta) => `¿Desactivar ${etiqueta}? Ya no se va a poder asignar a platos nuevos. Podés volver a activarla.`,
}
