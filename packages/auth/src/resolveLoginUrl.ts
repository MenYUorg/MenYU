export function resolveLoginUrl(): string {
  const hostname = window.location.hostname

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

  // Staging — URL dinámica de Vercel Preview
  // Formato: menyu-admin-git-{rama}-men-yu-s-projects.vercel.app
  //       o: menyu-staff-git-{rama}-men-yu-s-projects.vercel.app
  // Construimos la URL equivalente para web-cliente
  const suffix = hostname
    .replace('menyu-admin', 'menyu-cliente')
    .replace('menyu-staff', 'menyu-cliente')
  return `https://${suffix}/auth`
}
