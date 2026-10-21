// Salidas de la app. Aparte para poder simularlas en los tests (jsdom no navega).

export function irA(url: string): void {
  window.location.assign(url)
}

export function recargar(): void {
  window.location.reload()
}
