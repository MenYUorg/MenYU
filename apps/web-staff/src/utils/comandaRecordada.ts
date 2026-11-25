const claveDeLaComanda = (restauranteId: string) => `menyu-staff-comanda:${restauranteId}`

/**
 * La última pestania de comanda que eligió la persona en este dispositivo y restaurante. No se valida contra las
 * comandas: si ya no existe o está desactivada, `pestaniaVigente` la descarta al renderizar. Sin localStorage (modo
 * privado, almacenamiento bloqueado) no hay recordada.
 */
export function comandaRecordada(restauranteId: string): string | null {
  try {
    return localStorage.getItem(claveDeLaComanda(restauranteId)) || null
  } catch {
    return null
  }
}

/** Recuerda la pestania elegida; con `null` ("Todas") borra la preferencia. Si no se puede guardar, no pasa nada. */
export function recordarComanda(restauranteId: string, comandaId: string | null): void {
  try {
    if (comandaId === null) localStorage.removeItem(claveDeLaComanda(restauranteId))
    else localStorage.setItem(claveDeLaComanda(restauranteId), comandaId)
  } catch {
    // Sin localStorage la pestania no se recuerda: la persona la elige de nuevo.
  }
}
