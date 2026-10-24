import { irA } from './navegar'

describe('irA', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sale de web-cliente con location.assign (queda en el historial: "atrás" vuelve acá)', () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })

    irA('https://auth.menyu-app.com/?redirect=x')

    expect(assign).toHaveBeenCalledWith('https://auth.menyu-app.com/?redirect=x')
  })
})
