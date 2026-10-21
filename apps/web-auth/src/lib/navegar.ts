/** Sale de web-auth hacia otra app de MenYU. Aparte para poder simularlo en los tests. */
export function irA(url: string): void {
  window.location.assign(url)
}
