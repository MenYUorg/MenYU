import { pantallaDeRuta, tituloDeLaPestana } from './pantallas'

describe('pantallaDeRuta', () => {
  it.each([
    ['/', 'Descubrir restaurantes'],
    ['/restaurante/rest-1', 'Restaurante'],
    ['/restaurante/rest-1/mesa', 'Ingresar a una mesa'],
    ['/restaurante/rest-1/carta', 'Carta'],
    ['/check-in', 'Ingreso a la mesa'],
    ['/elegir-nombre', 'Tu nombre'],
    ['/menu', 'Menú'],
    ['/menu/plato-1', 'Detalle del plato'],
    ['/carrito', 'Carrito'],
    ['/pedidos', 'Mis pedidos'],
    ['/pagar', 'Pagar la cuenta'],
    ['/pago/exitoso', 'Pago exitoso'],
    ['/pago/fallido', 'Pago fallido'],
    ['/pago/pendiente', 'Pago pendiente'],
    ['/etiquetar', 'Etiquetar pedidos'],
    ['/dividir/cantidad', 'Cantidad de comensales'],
    ['/dividir/mensaje', 'Armar mensaje'],
  ])('%s es "%s"', (ruta, pantalla) => {
    expect(pantallaDeRuta(ruta)).toBe(pantalla)
  })

  it.each(['/auth', '/ingresar-pin', '/no-existe', '/menu/plato-1/otra-cosa', '/restaurante'])(
    '%s no tiene pantalla propia (redirige o no existe)',
    (ruta) => {
      expect(pantallaDeRuta(ruta)).toBeNull()
    },
  )
})

describe('tituloDeLaPestana', () => {
  it('con restaurante: "{Pantalla} · {Restaurante}"', () => {
    expect(tituloDeLaPestana('Carrito', 'Lupulus Casa Matriz')).toBe('Carrito · Lupulus Casa Matriz')
  })

  it('sin restaurante: "{Pantalla} · MenYU"', () => {
    expect(tituloDeLaPestana('Descubrir restaurantes', null)).toBe('Descubrir restaurantes · MenYU')
  })

  it('sin pantalla es solo "MenYU"', () => {
    expect(tituloDeLaPestana(null, 'Lupulus Casa Matriz')).toBe('MenYU')
  })
})
