import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Comensal, ItemEtiquetado } from '../../hooks/useEtiquetado'
import { api } from '../../services/api'
import { MensajePage } from './MensajePage'

let sesion: { jwt: string | null; sesionId: string | null; numeroMesa: string | null }
let etiquetado: { items: ItemEtiquetado[]; comensales: Comensal[]; loading: boolean; error: string | null }
const sesionesPedidas: string[] = []

vi.mock('../../store/sessionStore', () => ({
  useSessionStore: (selector: (s: typeof sesion) => unknown) => selector(sesion),
}))
vi.mock('../../hooks/useEtiquetado', () => ({
  useEtiquetado: (sesionId: string) => { sesionesPedidas.push(sesionId); return etiquetado },
}))
vi.mock('../../services/api', () => ({
  api: {
    sesiones: { saldo: vi.fn() },
    comensales: { calcularPorConsumo: vi.fn() },
    payments: { solicitarEfectivo: vi.fn(), pagarConMercadoPago: vi.fn() },
  },
}))

const saldo = vi.mocked(api.sesiones.saldo)
const porConsumo = vi.mocked(api.comensales.calcularPorConsumo)
const efectivo = vi.mocked(api.payments.solicitarEfectivo)
const mercadoPago = vi.mocked(api.payments.pagarConMercadoPago)

const comensal = (id: string, nombre: string): Comensal => ({ id, sesionId: 'ses-1', clienteId: null, nombre, esOwner: false, creadoPorComensalId: null, createdAt: '' })
const ANA = comensal('c-ana', 'Ana')
const LUIS = comensal('c-luis', 'Luis')
const SOL = comensal('c-sol', 'Sol')

function Destino() {
  const { pathname } = useLocation()
  return <p>destino {pathname}</p>
}

function abrir(query: string) {
  return render(
    <MemoryRouter initialEntries={[`/dividir/mensaje${query}`]}>
      <Routes>
        <Route path="/dividir/mensaje" element={<MensajePage />} />
        <Route path="*" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  )
}

const mensaje = () => (screen.getByRole('textbox') as HTMLTextAreaElement).value

beforeEach(() => {
  vi.clearAllMocks()
  sesionesPedidas.length = 0
  sesion = { jwt: 'jwt-mesa', sesionId: 'ses-1', numeroMesa: '4' }
  etiquetado = {
    items: [
      { pedidoItemId: 'pi-1', nombre: 'Milanesa', cantidad: 2, precioUnitario: 1500, etiquetas: [ANA] },
      { pedidoItemId: 'pi-2', nombre: 'Pizza', cantidad: 1, precioUnitario: 3000, etiquetas: [ANA, LUIS] },
      { pedidoItemId: 'pi-3', nombre: 'Agua', cantidad: 1, precioUnitario: 500, etiquetas: [] },
    ],
    comensales: [ANA, LUIS, SOL],
    loading: false,
    error: null,
  }
  saldo.mockResolvedValue({ totalSesion: 6500, saldoPendiente: 6500 } as never)
  porConsumo.mockResolvedValue({ partes: [{ comensalId: 'c-ana', nombre: 'Ana', monto: 4500 }, { comensalId: 'c-luis', nombre: 'Luis', monto: 1500 }], huerfanos: { total: 500 } } as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('MensajePage', () => {
  it.each([
    ['sin parámetros', ''],
    ['con una cantidad inválida', '?cantidad=0'],
    ['con una cantidad que no es número', '?cantidad=abc'],
  ])('%s no sabe cómo armar el mensaje y ofrece volver', (_, query) => {
    abrir(query)

    expect(screen.getByText('No se pudo determinar cómo armar el mensaje')).toBeInTheDocument()
    expect(saldo).not.toHaveBeenCalled()
    // El del cuerpo (el del encabezado se prueba al final).
    fireEvent.click(screen.getAllByRole('button', { name: 'Volver' })[1])
    expect(screen.getByText('destino /pagar')).toBeInTheDocument()
  })

  it.each([
    ['sin sesión', { jwt: null, sesionId: null, numeroMesa: null }],
    ['sin JWT', { jwt: null, sesionId: 'ses-1', numeroMesa: '4' }],
  ])('%s dice que no hay sesión activa', async (_, valor) => {
    sesion = valor

    abrir('?cantidad=3')

    expect(await screen.findByText('No hay sesión activa')).toBeInTheDocument()
  })

  describe('partes iguales', () => {
    it('divide lo que falta cobrar entre la cantidad elegida', async () => {
      abrir('?cantidad=4')

      await screen.findByText('Mensaje para el grupo')
      expect(saldo).toHaveBeenCalledWith('jwt-mesa', 'ses-1')
      expect(porConsumo).not.toHaveBeenCalled()
      expect(sesionesPedidas.every((s) => s === '')).toBe(true)
      expect(mensaje()).toBe(['🧾 Mesa 4 — MenYu', 'Total de la cuenta: $6500.00', '', 'Dividido en partes iguales entre 4: $1625.00 cada uno'].join('\n'))
    })

    it('si ya se cobró una parte lo dice y divide el saldo', async () => {
      saldo.mockResolvedValue({ totalSesion: 6500, saldoPendiente: 4000 } as never)
      sesion.numeroMesa = null

      abrir('?cantidad=2')

      await screen.findByText('Mensaje para el grupo')
      expect(mensaje()).toBe(['🧾 Mesa  — MenYu', 'Total de la cuenta: $6500.00', 'Ya cobrado: $2500.00', 'Falta cobrar: $4000.00', '', 'Dividido en partes iguales entre 2: $2000.00 cada uno'].join('\n'))
    })

    it('si la carga falla muestra el error; "Reintentar" vuelve a pedir', async () => {
      saldo.mockRejectedValueOnce(new Error('Sin conexión')).mockRejectedValueOnce('raro')

      abrir('?cantidad=2')
      expect(await screen.findByText('Sin conexión')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(await screen.findByText('Error al cargar los datos de la sesión')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(await screen.findByText('Mensaje para el grupo')).toBeInTheDocument()
    })
  })

  describe('por consumo', () => {
    it('arma la parte de cada comensal con sus platos, los compartidos y lo que falta asignar', async () => {
      abrir('?modo=por_consumo')

      await screen.findByText('Mensaje para el grupo')
      expect(sesionesPedidas).toContain('ses-1')
      expect(porConsumo).toHaveBeenCalledWith('jwt-mesa', 'ses-1')
      expect(mensaje()).toBe([
        '🧾 Mesa 4 — MenYu',
        'Total de la cuenta: $6500.00',
        '',
        'Ana',
        '• 2x Milanesa — $3000.00',
        '• 1x Pizza — $3000.00 (compartido entre 2)',
        'Total Ana: $4500.00',
        '',
        'Luis',
        '• 1x Pizza — $3000.00 (compartido entre 2)',
        'Total Luis: $1500.00',
        '',
        '⚠️ Sin asignar todavía ($500.00):',
        '• 1x Agua — $500.00',
        'Avisen quién lo pidió para sumarlo a su parte.',
      ].join('\n'))
    })

    it('con un cobro parcial lo aclara; un comensal sin parte calculada queda en $0', async () => {
      saldo.mockResolvedValue({ totalSesion: 6500, saldoPendiente: 6000 } as never)
      porConsumo.mockResolvedValue({ partes: [], huerfanos: { total: 0 } } as never)
      etiquetado.items = [{ pedidoItemId: 'pi-1', nombre: 'Milanesa', cantidad: 1, precioUnitario: 1500, etiquetas: [ANA] }]

      abrir('?modo=por_consumo')

      await screen.findByText('Mensaje para el grupo')
      expect(mensaje()).toContain('Ya cobrado: $500.00')
      expect(mensaje()).toContain('Total Ana: $0.00')
      expect(mensaje()).not.toContain('Sin asignar')
      expect(mensaje().split('\n').pop()).toBe('⚠️ Los montos de arriba son la parte de cada uno sobre el total de la cuenta. Si alguien ya pagó, no se lo vuelvas a pedir.')
    })

    it('mientras carga el etiquetado espera; si falla muestra su error', async () => {
      etiquetado.loading = true
      const { unmount } = abrir('?modo=por_consumo')
      expect(screen.queryByText('Mensaje para el grupo')).not.toBeInTheDocument()
      unmount()

      etiquetado = { ...etiquetado, loading: false, error: 'No se pudieron cargar las etiquetas' }
      abrir('?modo=por_consumo')
      expect(await screen.findByText('No se pudieron cargar las etiquetas')).toBeInTheDocument()
    })
  })

  describe('copiar el mensaje', () => {
    it('lo copia al portapapeles y avisa "¡Copiado!" por 2 s', async () => {
      const escribir = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: escribir } })
      abrir('?cantidad=2')
      await screen.findByText('Mensaje para el grupo')
      vi.useFakeTimers({ shouldAdvanceTime: true })

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiar mensaje' })) })
      expect(escribir).toHaveBeenCalledWith(mensaje())
      expect(screen.getByRole('button', { name: '¡Copiado! ✅' })).toBeInTheDocument()

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '¡Copiado! ✅' })) })
      await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
      expect(screen.getByRole('button', { name: 'Copiar mensaje' })).toBeInTheDocument()
    })

    it('sin portapapeles usa la copia del navegador; si tampoco anda pide copiarlo a mano', async () => {
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) } })
      const copiar = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false).mockImplementationOnce(() => { throw new Error('no') })
      document.execCommand = copiar
      abrir('?cantidad=2')
      await screen.findByText('Mensaje para el grupo')

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiar mensaje' })) })
      expect(copiar).toHaveBeenCalledWith('copy')
      expect(screen.getByRole('button', { name: '¡Copiado! ✅' })).toBeInTheDocument()

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '¡Copiado! ✅' })) })
      expect(screen.getByText(/No pudimos copiarlo automáticamente/)).toBeInTheDocument()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '¡Copiado! ✅' })) })
      expect(screen.getByText(/No pudimos copiarlo automáticamente/)).toBeInTheDocument()
    })
  })

  describe('pagar toda la cuenta', () => {
    async function abrirMensaje() {
      abrir('?cantidad=2')
      await screen.findByText('Mensaje para el grupo')
    }

    it('con la cuenta saldada no ofrece pagar', async () => {
      saldo.mockResolvedValue({ totalSesion: 6500, saldoPendiente: 0 } as never)
      await abrirMensaje()

      expect(screen.getByText('Esta cuenta ya está saldada.')).toBeInTheDocument()
    })

    it('en efectivo avisa que el mozo va a cobrar; mientras tanto no deja pagar otra vez', async () => {
      let terminar: () => void = () => {}
      efectivo.mockReturnValue(new Promise<void>((r) => { terminar = r }) as never)
      await abrirMensaje()

      fireEvent.click(screen.getByRole('button', { name: 'Pagar toda la cuenta en efectivo' }))
      expect(screen.getByRole('button', { name: 'Pagar toda la cuenta con Mercado Pago' })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: 'Pagar toda la cuenta con Mercado Pago' }))
      await act(async () => { terminar() })

      expect(efectivo).toHaveBeenCalledWith('jwt-mesa', 'ses-1')
      expect(mercadoPago).not.toHaveBeenCalled()
      expect(screen.getByText('El mozo se va a acercar a la mesa a cobrar el total.')).toBeInTheDocument()
    })

    it('si el efectivo falla muestra el mensaje (o el genérico)', async () => {
      efectivo.mockRejectedValueOnce(new Error('Ya está pagada')).mockRejectedValueOnce('raro')
      await abrirMensaje()

      fireEvent.click(screen.getByRole('button', { name: 'Pagar toda la cuenta en efectivo' }))
      expect(await screen.findByText('Ya está pagada')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Pagar toda la cuenta en efectivo' }))
      expect(await screen.findByText('Error al registrar el pago en efectivo')).toBeInTheDocument()
    })

    it('con Mercado Pago va al checkout', async () => {
      const ubicacion = { href: 'http://localhost/dividir/mensaje' }
      vi.stubGlobal('location', ubicacion)
      mercadoPago.mockResolvedValueOnce({ initPoint: 'https://mp.test/checkout' } as never)
      await abrirMensaje()

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pagar toda la cuenta con Mercado Pago' })) })
      expect(ubicacion.href).toBe('https://mp.test/checkout')
    })

    it('si Mercado Pago falla muestra el mensaje (o el genérico)', async () => {
      mercadoPago.mockRejectedValueOnce(new Error('Sin Mercado Pago')).mockRejectedValueOnce('raro')
      await abrirMensaje()

      fireEvent.click(screen.getByRole('button', { name: 'Pagar toda la cuenta con Mercado Pago' }))
      expect(await screen.findByText('Sin Mercado Pago')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Pagar toda la cuenta con Mercado Pago' }))
      expect(await screen.findByText('Error al iniciar el pago con Mercado Pago')).toBeInTheDocument()
    })
  })

  it('el botón de volver lleva a pagar', async () => {
    abrir('?cantidad=2')
    await screen.findByText('Mensaje para el grupo')

    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))

    expect(screen.getByText('destino /pagar')).toBeInTheDocument()
  })
})
