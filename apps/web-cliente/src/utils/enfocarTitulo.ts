/** Cuánto se espera a que aparezca el título: las pantallas piden sus datos antes de pintarlo. */
export const MS_PARA_ENCONTRAR_EL_TITULO = 4000

/**
 * Le da el foco al `<h1>` de la pantalla. No es un control: no está en el orden del Tab (`tabindex="-1"`), pero puede
 * recibir el foco por código, y con eso el lector de pantalla lo anuncia al llegar. Devuelve `false` si no hay `<h1>`.
 */
export function enfocarElTitulo(): boolean {
  const titulo = document.querySelector<HTMLElement>('h1')
  if (!titulo) return false
  if (!titulo.hasAttribute('tabindex')) titulo.setAttribute('tabindex', '-1')
  titulo.focus()
  return document.activeElement === titulo
}

/**
 * Enfoca el `<h1>` apenas aparezca. Si todavía no está, espera a que la pantalla lo pinte, hasta `MS_PARA_ENCONTRAR_EL_TITULO`.
 * Si la persona toca o escribe antes de que llegue, deja de esperar: el foco ya es suyo. Devuelve cómo cancelarlo.
 */
export function enfocarElTituloCuandoAparezca(): () => void {
  if (enfocarElTitulo()) return () => {}

  const observador = new MutationObserver(() => {
    if (enfocarElTitulo()) cancelar()
  })
  const limite = setTimeout(() => cancelar(), MS_PARA_ENCONTRAR_EL_TITULO)

  function cancelar() {
    observador.disconnect()
    clearTimeout(limite)
    document.removeEventListener('pointerdown', cancelar, true)
    document.removeEventListener('keydown', cancelar, true)
  }

  observador.observe(document.body, { childList: true, subtree: true })
  document.addEventListener('pointerdown', cancelar, true)
  document.addEventListener('keydown', cancelar, true)
  return cancelar
}
