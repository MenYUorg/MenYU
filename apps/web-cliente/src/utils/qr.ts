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
