/** Sale de web-cliente hacia otra app de MenYU (web-auth). Aparte para poder simularlo en los tests: jsdom no navega. */
export function irA(url: string): void {
  window.location.assign(url)
}
