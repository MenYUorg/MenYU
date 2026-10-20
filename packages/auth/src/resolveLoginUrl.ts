// Dominios propios: admin.<sufijo> y staff.<sufijo> loguean en mesa.<sufijo>. Conviven con los de Vercel
// mientras dure la migración (docs/specs/auth.md, Fase 0).
const DOMINIO_PROPIO = /^(admin|staff)\.((staging\.)?menyu-app\.com|menyu\.local)$/

export function resolveLoginUrl(
  hostname: string = window.location.hostname,
  protocolo: string = window.location.protocol,
): string {
  // Local
  if (hostname === 'localhost') {
    return 'http://localhost:5176/auth'
  }

  // Producción
  if (
    hostname === 'menyu-admin.vercel.app' ||
    hostname === 'menyu-staff.vercel.app'
  ) {
    return 'https://menyu-cliente.vercel.app/auth'
  }

  // Dominio propio: menyu-app.com, staging.menyu-app.com o menyu.local (desarrollo: el protocolo de la página y el
  // puerto de web-cliente)
  const propio = DOMINIO_PROPIO.exec(hostname)
  if (propio) {
    const sufijo = propio[2]
    return sufijo === 'menyu.local' ? `${protocolo}//mesa.menyu.local:5176/auth` : `https://mesa.${sufijo}/auth`
  }

  // Staging — URL dinámica de Vercel Preview
  // Formato: menyu-admin-git-{rama}-men-yu-s-projects.vercel.app
  //       o: menyu-staff-git-{rama}-men-yu-s-projects.vercel.app
  // Construimos la URL equivalente para web-cliente
  const suffix = hostname
    .replace('menyu-admin', 'menyu-cliente')
    .replace('menyu-staff', 'menyu-cliente')
  return `https://${suffix}/auth`
}
