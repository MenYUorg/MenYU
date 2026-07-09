export function resolveAppUrl(tipo: 'admin' | 'mozo'): string {
  const hostname = window.location.hostname

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

  // Staging — URL dinámica de Vercel Preview
  // Formato: menyu-cliente-git-{rama}-men-yu-s-projects.vercel.app
  // Construimos la URL equivalente para admin o staff
  const app = tipo === 'admin' ? 'menyu-admin' : 'menyu-staff'
  const suffix = hostname.replace('menyu-cliente', app)
  return `https://${suffix}`
}
