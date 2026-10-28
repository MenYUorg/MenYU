import { useEffect, useState, type ReactNode } from 'react'
import { AppHeader } from '../../components/AppHeader'
import { QrScanner } from '../../components/QrScanner'
import { TituloSeccion } from '../../components/TituloSeccion'
import { BloqueEstado } from '../../components/discovery/BloqueEstado'
import { CarruselOfertas } from '../../components/discovery/CarruselOfertas'
import { EsqueletosHome } from '../../components/discovery/EsqueletosHome'
import { Girando } from '../../components/discovery/Girando'
import { Icono } from '../../components/discovery/Icono'
import { TarjetaOferta } from '../../components/discovery/TarjetaOferta'
import { TarjetaRestaurante } from '../../components/discovery/TarjetaRestaurante'
import { useEntrarAMesa } from '../../hooks/useEntrarAMesa'
import { cantidadDeCaracteres, MIN_CARACTERES_BUSQUEDA, useDiscoveryStore } from '../../store/discoveryStore'
import { C } from '../../theme'
import { leerQrDeMesa } from '../../utils/qr'

// Lo que se espera después de la última letra antes de buscar.
const ESPERA_BUSQUEDA_MS = 300

const GRILLA_RESTAURANTES = 'grid grid-cols-1 gap-[10px] md:grid-cols-2 lg:grid-cols-3'
const GRILLA_OFERTAS = 'grid grid-cols-2 gap-[10px] md:grid-cols-4 xl:grid-cols-5'

function Seccion({ titulo, id, children }: { titulo: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 28, scrollMarginTop: 76 }}>
      <TituloSeccion>{titulo}</TituloSeccion>
      {children}
    </section>
  )
}

/** Página de inicio de web-cliente: ofertas, restaurantes, buscador y el atajo para escanear el QR de la mesa. */
export function DiscoveryPage() {
  const restaurantes = useDiscoveryStore((s) => s.restaurantes)
  const ofertas = useDiscoveryStore((s) => s.ofertas)
  const estado = useDiscoveryStore((s) => s.estado)
  const cargar = useDiscoveryStore((s) => s.cargar)
  const buscar = useDiscoveryStore((s) => s.buscar)
  const limpiarBusqueda = useDiscoveryStore((s) => s.limpiarBusqueda)
  const resultados = useDiscoveryStore((s) => s.resultados)
  const textoBuscado = useDiscoveryStore((s) => s.textoBuscado)
  const estadoBusqueda = useDiscoveryStore((s) => s.estadoBusqueda)

  const [texto, setTexto] = useState('')
  const [escaneando, setEscaneando] = useState(false)
  const [falloElQr, setFalloElQr] = useState(false)
  const { entrar, cargando: abriendo, pantalla } = useEntrarAMesa({ alFallar: () => setFalloElQr(true) })

  useEffect(() => {
    limpiarBusqueda()
    void cargar()
  }, [cargar, limpiarBusqueda])

  // La búsqueda espera un instante a que termines de escribir. Con menos de 2 letras borra la búsqueda y se ve la home.
  useEffect(() => {
    const espera = setTimeout(() => void buscar(texto), ESPERA_BUSQUEDA_MS)
    return () => clearTimeout(espera)
  }, [texto, buscar])

  if (pantalla) return pantalla

  const q = texto.trim()
  const modoBusqueda = cantidadDeCaracteres(q) >= MIN_CARACTERES_BUSQUEDA
  // Mientras llega la respuesta (o la próxima, si se sigue escribiendo) los resultados anteriores se atenúan.
  const buscando = estadoBusqueda === 'buscando' || q !== textoBuscado

  const borrarBusqueda = () => setTexto('')

  const abrirEscaner = () => {
    setFalloElQr(false)
    setEscaneando(true)
  }

  const alLeerElQr = (leido: string) => {
    setEscaneando(false)
    // El QR de la mesa es el link del check-in: con su restaurante, el servidor comprueba que la mesa sea de ese restaurante.
    void entrar(leerQrDeMesa(leido))
  }

  // Sin restaurante elegido el PIN no sirve todavía: se vuelve a la lista para elegirlo.
  const elegirRestaurante = () => {
    setEscaneando(false)
    setTexto('')
    setTimeout(() => document.getElementById('restaurantes')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 0)
  }

  const cuerpoBusqueda = () => {
    if (estadoBusqueda === 'error') {
      return (
        <BloqueEstado icono="aviso" titulo="No pudimos buscar" texto="Revisá tu conexión e intentá de nuevo." boton="Reintentar" onBoton={() => void buscar(q)} rol="alert" />
      )
    }
    const { ofertas: dePlatos, restaurantes: dePorNombre, restaurantesConPlatos } = resultados ?? { ofertas: [], restaurantes: [], restaurantesConPlatos: [] }
    const total = dePlatos.length + dePorNombre.length + restaurantesConPlatos.length

    if (total === 0) {
      if (buscando) return <p style={estiloBuscando}><Girando /> Buscando…</p>
      return (
        <BloqueEstado
          icono="lupa"
          titulo={`No encontramos nada para “${q}”`}
          texto="Revisá cómo lo escribiste o probá con otra palabra."
          boton="Borrar búsqueda"
          onBoton={borrarBusqueda}
          contorno
        />
      )
    }

    // Los grupos van en este orden: primero las ofertas, después los restaurantes y al final los restaurantes con
    // platos que coinciden (que se ven como cualquier otro restaurante, sin decir qué platos).
    const grupos = (
      <>
        <p style={{ margin: '0 0 20px', fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.textSub }} className="md:text-center">
          Resultados para <b style={{ color: C.text, fontWeight: 600 }}>“{q}”</b>
        </p>
        {dePlatos.length > 0 && (
          <Seccion titulo="Ofertas">
            <div className={GRILLA_OFERTAS}>{dePlatos.map((o) => <TarjetaOferta key={o.id} oferta={o} />)}</div>
          </Seccion>
        )}
        {dePorNombre.length > 0 && (
          <Seccion titulo="Restaurantes">
            <div className={GRILLA_RESTAURANTES}>{dePorNombre.map((r) => <TarjetaRestaurante key={r.id} restaurante={r} />)}</div>
          </Seccion>
        )}
        {restaurantesConPlatos.length > 0 && (
          <Seccion titulo="Con platos que coinciden">
            <div className={GRILLA_RESTAURANTES}>{restaurantesConPlatos.map((r) => <TarjetaRestaurante key={r.id} restaurante={r} />)}</div>
          </Seccion>
        )}
      </>
    )

    if (!buscando) return grupos
    return (
      <>
        <p style={estiloBuscando} role="status"><Girando /> Buscando…</p>
        <div data-testid="resultados-atenuados" style={{ opacity: 0.45, pointerEvents: 'none' }}>{grupos}</div>
      </>
    )
  }

  const cuerpoHome = () => {
    if (estado === 'cargando' && restaurantes.length === 0 && ofertas.length === 0) return <EsqueletosHome />
    if (estado === 'error') {
      return (
        <BloqueEstado
          icono="aviso"
          titulo="No pudimos cargar los restaurantes"
          texto="Revisá tu conexión e intentá de nuevo."
          boton="Reintentar"
          onBoton={() => void cargar()}
          rol="alert"
        />
      )
    }
    return (
      <>
        {ofertas.length > 0 && (
          <Seccion titulo="Ofertas">
            <CarruselOfertas ofertas={ofertas} />
          </Seccion>
        )}
        <Seccion titulo="Restaurantes" id="restaurantes">
          {restaurantes.length > 0 ? (
            <div className={GRILLA_RESTAURANTES}>{restaurantes.map((r) => <TarjetaRestaurante key={r.id} restaurante={r} />)}</div>
          ) : (
            <BloqueEstado icono="local" titulo="Todavía no hay restaurantes" texto="Cuando se sumen, los vas a ver acá." />
          )}
        </Seccion>
      </>
    )
  }

  return (
    <>
      {escaneando && (
        <QrScanner
          onDetected={alLeerElQr}
          onCancel={() => setEscaneando(false)}
          alternativa={{
            texto: 'Elegir mi restaurante',
            ayuda: 'Elegí tu restaurante en la lista e ingresá con el PIN de tu mesa.',
            onElegir: elegirRestaurante,
          }}
        />
      )}

      <div style={{ minHeight: '100vh', background: C.bg }}>
        <AppHeader />

        <main style={{ paddingTop: 60 }}>
          <div className="mx-auto w-full max-w-[1120px] px-[14px] md:px-6">
            <section className="pb-5 pt-6 md:pb-7 md:pt-10 md:text-center">
              <h1 className="mb-2 text-[26px] md:text-[28px]" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em', color: C.navy }}>
                Descubrí dónde comer
              </h1>
              <p className="mb-4 max-w-[520px] md:mx-auto md:mb-5" style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, lineHeight: 1.5, color: C.textSub }}>
                Ofertas y restaurantes. Elegí uno para ver su carta o ingresar a tu mesa.
              </p>

              <form role="search" onSubmit={(e) => { e.preventDefault(); void buscar(texto) }} className="relative mx-auto flex max-w-[560px] items-center">
                <span aria-hidden="true" style={{ position: 'absolute', left: 16, fontSize: 15, color: C.gray, pointerEvents: 'none' }}>🔍</span>
                <input
                  type="text"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  placeholder="Buscar restaurantes o platos"
                  aria-label="Buscar restaurantes o platos"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  className="w-full appearance-none outline-none transition-colors focus:border-[#E8563A]"
                  style={{
                    height: 46,
                    padding: '0 46px 0 42px',
                    borderRadius: 999,
                    border: `1px solid ${C.border}`,
                    background: C.white,
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 16,
                    color: C.text,
                  }}
                />
                {texto.length > 0 && (
                  <button
                    type="button"
                    aria-label="Borrar búsqueda"
                    onClick={borrarBusqueda}
                    style={{ position: 'absolute', right: 0, top: 0, width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: C.gray, fontSize: 22, lineHeight: 1, cursor: 'pointer' }}
                  >
                    ×
                  </button>
                )}
              </form>
              {cantidadDeCaracteres(q) === 1 && (
                <p className="mx-auto mt-2 max-w-[560px] md:text-center" style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.textSub }}>
                  Escribí al menos {MIN_CARACTERES_BUSQUEDA} letras para buscar.
                </p>
              )}

              <button
                type="button"
                onClick={abrirEscaner}
                disabled={abriendo}
                className="mx-auto mt-1 flex w-full max-w-[560px] items-center justify-center gap-2 hover:text-[#E8563A]"
                style={{ minHeight: 44, background: 'none', border: 'none', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13, color: C.navy, cursor: abriendo ? 'wait' : 'pointer' }}
              >
                <span style={{ color: C.orange, display: 'flex' }}><Icono nombre="escanear" tam={20} grosor={2.2} /></span>
                {abriendo ? 'Abriendo tu mesa…' : 'Escanear el QR de mi mesa'}
              </button>

              {falloElQr && (
                <div
                  role="alert"
                  className="mx-auto mt-2 max-w-[560px] text-left"
                  style={{ background: C.orangeSoft, border: `1px solid ${C.orange}`, borderRadius: 10, padding: '12px 16px', fontFamily: 'Inter, sans-serif', fontSize: 13, lineHeight: 1.45, color: C.error }}
                >
                  No pudimos abrir tu mesa con ese QR. Probá de nuevo o elegí tu restaurante e ingresá con el PIN de tu mesa.
                </div>
              )}
            </section>

            {modoBusqueda ? cuerpoBusqueda() : cuerpoHome()}
          </div>
        </main>
      </div>
    </>
  )
}

const estiloBuscando = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  margin: '14px 0 4px',
  fontFamily: 'Inter, sans-serif',
  fontWeight: 500,
  fontSize: 13,
  color: C.textSub,
} as const
