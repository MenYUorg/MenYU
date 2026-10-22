// A dónde mandar a quien es personal de un restaurante y escribe sus datos en el login del comensal: web-auth, la única
// pantalla de ingreso de MenYU (docs/auth/specs/auth.md, Fase 4). Cada deploy fija `VITE_AUTH_URL`
// (docs/auth/VariablesACambiar.md); si falta, sale del dominio de esta app, que convive con los de Vercel mientras dure
// la migración.
const DOMINIO_PROPIO = /^mesa\.((staging\.)?menyu-app\.com|menyu\.local)$/

export function urlDeAuth(
  hostname: string = window.location.hostname,
  protocolo: string = window.location.protocol,
): string {
  const configurada = import.meta.env.VITE_AUTH_URL
  if (configurada) return configurada.replace(/\/+$/, '')

  const propio = DOMINIO_PROPIO.exec(hostname)
  if (propio) {
    const sufijo = propio[1]
    return sufijo === 'menyu.local' ? `${protocolo}//auth.menyu.local:5173` : `https://auth.${sufijo}`
  }
  if (hostname === 'localhost') return `${protocolo}//localhost:5173`

  return 'https://auth.menyu-app.com'
}
