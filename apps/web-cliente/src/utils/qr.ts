/**
 * Código de mesa que lleva lo que leyó el escáner: el QR de la mesa es un link
 * (`…/check-in?restaurantId=…&tableCode=…`), pero también se acepta el código suelto.
 */
export function extractQrToken(raw: string): string {
  try {
    const url = new URL(raw)
    const token =
      url.searchParams.get('qrToken') ??
      url.searchParams.get('tableCode') ??
      url.pathname.split('/').filter(Boolean).pop()
    return token ?? raw
  } catch {
    return raw
  }
}

/**
 * Lo que leyó el escáner, listo para abrir la mesa: el código y, si el QR es el link del check-in, el restaurante de
 * `restaurantId`, para que el servidor compruebe que la mesa sea de ese restaurante. Un código suelto va sin restaurante.
 */
export function leerQrDeMesa(raw: string): { qrToken: string; restauranteId?: string } {
  const qrToken = extractQrToken(raw)
  let restauranteId: string | null = null
  try {
    restauranteId = new URL(raw).searchParams.get('restaurantId')
  } catch {
    // No es un link: es el código suelto.
  }
  return restauranteId ? { qrToken, restauranteId } : { qrToken }
}
