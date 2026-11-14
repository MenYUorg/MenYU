import { act, render, screen } from '@testing-library/react'
import { axe } from '../test/axe'
import { anunciar, useAnunciadorStore } from '../utils/anunciador'
import { Anunciador, MS_DE_UN_ANUNCIO } from './Anunciador'

beforeEach(() => {
  useAnunciadorStore.setState({ mensaje: '', numero: 0 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Anunciador', () => {
  it('es una región viva educada que existe desde el arranque, antes de cualquier mensaje', () => {
    render(<Anunciador />)

    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveAttribute('aria-atomic', 'true')
    expect(region.textContent).toBe('')
  })

  it('se pinta en el <body>, fuera de lo que una pantalla pueda volver inerte', () => {
    const { container } = render(<Anunciador />)

    expect(container).toBeEmptyDOMElement()
    expect(screen.getByRole('status').parentElement).toBe(document.body)
  })

  it('lee el mensaje que le llega desde cualquier pantalla', () => {
    render(<Anunciador />)

    act(() => anunciar('Hamburguesa doble agregada al carrito'))

    expect(screen.getByRole('status')).toHaveTextContent('Hamburguesa doble agregada al carrito')
  })

  it('un mensaje igual al anterior vuelve a agregarse a la región, así el lector lo lee de nuevo', () => {
    render(<Anunciador />)
    act(() => anunciar('Cheddar: 1'))
    const primero = screen.getByText('Cheddar: 1')

    act(() => anunciar('Cheddar: 1'))

    const segundo = screen.getByText('Cheddar: 1')
    expect(segundo).not.toBe(primero)
    expect(primero).not.toBeInTheDocument()
  })

  it('vacía la región cuando pasó el tiempo de leerla', () => {
    vi.useFakeTimers()
    render(<Anunciador />)
    act(() => anunciar('Avisamos al mozo'))

    act(() => { vi.advanceTimersByTime(MS_DE_UN_ANUNCIO - 1) })
    expect(screen.getByRole('status')).toHaveTextContent('Avisamos al mozo')

    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('un mensaje nuevo reinicia la cuenta: no se vacía a los 6 segundos del anterior', () => {
    vi.useFakeTimers()
    render(<Anunciador />)
    act(() => anunciar('Cheddar: 1'))
    act(() => { vi.advanceTimersByTime(MS_DE_UN_ANUNCIO - 1000) })

    act(() => anunciar('Cheddar: 2'))
    act(() => { vi.advanceTimersByTime(MS_DE_UN_ANUNCIO - 1000) })

    expect(screen.getByRole('status')).toHaveTextContent('Cheddar: 2')
  })

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    render(<Anunciador />)
    act(() => anunciar('Cheddar: 1'))

    expect(await axe(document.body)).toHaveNoViolations()
  })
})
