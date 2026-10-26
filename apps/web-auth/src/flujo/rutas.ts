/** Una ruta de web-auth que conserva el `?redirect=` de la actual, para no perderlo entre pantallas. */
export function conRedirect(ruta: string, search: string): string {
  const redirect = new URLSearchParams(search).get('redirect')
  return redirect ? `${ruta}?${new URLSearchParams({ redirect })}` : ruta
}
