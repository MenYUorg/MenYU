import { resolveAppUrl } from './resolveAppUrl'

// Después del login legacy, el personal sigue a su app: admin → web-admin, mozo → web-staff.
describe('resolveAppUrl', () => {
  it.each([
    ['mesa.menyu-app.com', 'https://admin.menyu-app.com', 'https://staff.menyu-app.com'],
    ['mesa.staging.menyu-app.com', 'https://admin.staging.menyu-app.com', 'https://staff.staging.menyu-app.com'],
  ])('en el dominio propio %s manda a la app del mismo ambiente', (host, admin, staff) => {
    expect(resolveAppUrl('admin', host, 'https:')).toBe(admin)
    expect(resolveAppUrl('mozo', host, 'https:')).toBe(staff)
  })

  it('en mesa.menyu.local (desarrollo) usa el protocolo de la página y el puerto de cada app', () => {
    expect(resolveAppUrl('admin', 'mesa.menyu.local', 'http:')).toBe('http://admin.menyu.local:5174')
    expect(resolveAppUrl('mozo', 'mesa.menyu.local', 'http:')).toBe('http://staff.menyu.local:5175')
  })

  it('en los dominios de Vercel sigue funcionando como antes', () => {
    expect(resolveAppUrl('admin', 'menyu-cliente.vercel.app')).toBe('https://menyu-admin.vercel.app')
    expect(resolveAppUrl('mozo', 'menyu-cliente-staging.vercel.app')).toBe('https://menyu-staff-staging.vercel.app')
  })

  it('en localhost va al puerto de cada app', () => {
    expect(resolveAppUrl('admin', 'localhost')).toBe('http://localhost:5174')
    expect(resolveAppUrl('mozo', 'localhost')).toBe('http://localhost:5175')
  })
})
