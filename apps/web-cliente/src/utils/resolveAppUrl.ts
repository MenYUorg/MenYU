// Dominio propio de web-cliente: mesa.<sufijo> manda al personal a admin.<sufijo> o staff.<sufijo>. Convive con los
// de Vercel mientras dure la migración (docs/specs/auth.md, Fase 0).
const DOMINIO_PROPIO = /^mesa\.((staging\.)?menyu-app\.com|menyu\.local)$/

export function resolveAppUrl(
  tipo: 'admin' | 'mozo',
  hostname: string = window.location.hostname,
  protocolo: string = window.location.protocol,
): string {
  // Producción
  if (hostname === 'menyu-cliente.vercel.app') {
    return tipo === 'admin'
      ? 'https://menyu-admin.vercel.app'
      : 'https://menyu-staff.vercel.app'
  }

  // Local
  if (hostname === 'localhost') {
    return tipo === 'admin'
      ? 'http://localhost:5174'
      : 'http://localhost:5175'
  }

  // Dominio propio: menyu-app.com, staging.menyu-app.com o menyu.local (desarrollo: el protocolo de la página y el
  // puerto de cada app)
  const propio = DOMINIO_PROPIO.exec(hostname)
  if (propio) {
    const sufijo = propio[1]
    if (sufijo === 'menyu.local') {
      return tipo === 'admin' ? `${protocolo}//admin.menyu.local:5174` : `${protocolo}//staff.menyu.local:5175`
    }
    return `https://${tipo === 'admin' ? 'admin' : 'staff'}.${sufijo}`
  }

  // Staging — URL dinámica de Vercel Preview
  // Formato: menyu-cliente-git-{rama}-men-yu-s-projects.vercel.app
  // Construimos la URL equivalente para admin o staff
  const app = tipo === 'admin' ? 'menyu-admin' : 'menyu-staff'
  const suffix = hostname.replace('menyu-cliente', app)
  return `https://${suffix}`
}
