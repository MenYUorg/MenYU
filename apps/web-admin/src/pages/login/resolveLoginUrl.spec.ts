import { resolveLoginUrl } from '@menyu/auth'

// El login legacy vive en web-cliente: web-admin y web-staff mandan ahí a quien no tiene sesión.
describe('resolveLoginUrl', () => {
  it.each([
    ['admin.menyu-app.com', 'https://mesa.menyu-app.com/auth'],
    ['staff.menyu-app.com', 'https://mesa.menyu-app.com/auth'],
    ['admin.staging.menyu-app.com', 'https://mesa.staging.menyu-app.com/auth'],
    ['staff.staging.menyu-app.com', 'https://mesa.staging.menyu-app.com/auth'],
    ['admin.menyu.local', 'http://mesa.menyu.local:5176/auth'],
  ])('en el dominio propio %s manda al web-cliente del mismo ambiente', (host, login) => {
    expect(resolveLoginUrl(host)).toBe(login)
  })

  it('en los dominios de Vercel sigue funcionando como antes', () => {
    expect(resolveLoginUrl('menyu-admin.vercel.app')).toBe('https://menyu-cliente.vercel.app/auth')
    expect(resolveLoginUrl('menyu-staff-staging.vercel.app')).toBe('https://menyu-cliente-staging.vercel.app/auth')
    expect(resolveLoginUrl('menyu-admin-git-fix-men-yu-s-projects.vercel.app')).toBe(
      'https://menyu-cliente-git-fix-men-yu-s-projects.vercel.app/auth',
    )
  })

  it('en localhost va al puerto de web-cliente', () => {
    expect(resolveLoginUrl('localhost')).toBe('http://localhost:5176/auth')
  })
})
