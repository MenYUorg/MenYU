import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppHeader } from '../../components/AppHeader'
import { TituloSeccion } from '../../components/TituloSeccion'
import { BloqueEstado } from '../../components/discovery/BloqueEstado'
import { BotonGrande } from '../../components/discovery/BotonGrande'
import { EsqueletoHeroRestaurante } from '../../components/discovery/EsqueletosRestaurante'
import { Icono } from '../../components/discovery/Icono'
import { LogoRestaurante } from '../../components/discovery/LogoRestaurante'
import { TarjetaOferta } from '../../components/discovery/TarjetaOferta'
import { VolverEnlace } from '../../components/discovery/VolverEnlace'
import { useDiscoveryStore } from '../../store/discoveryStore'
import { C } from '../../theme'

/**
 * Pantalla de un restaurante: su logo, nombre y dirección, "Ingresar a una mesa" y sus ofertas. Carga sus datos por id,
 * así que también anda al entrar por un link o al recargar. "Ver la carta" abre el menú en modo vista, sin pedir.
 */
export function RestaurantePage() {
  const { restauranteId = '' } = useParams()
  const navigate = useNavigate()
  const detalle = useDiscoveryStore((s) => s.detalle)
  const cargarRestaurante = useDiscoveryStore((s) => s.cargarRestaurante)

  useEffect(() => {
    void cargarRestaurante(restauranteId)
  }, [restauranteId, cargarRestaurante])

  // El store guarda el último restaurante pedido: si es de otro (se navegó de uno a otro), todavía no llegó este.
  const actual = detalle?.id === restauranteId ? detalle : null

  const cuerpo = () => {
    if (!actual || actual.estado === 'cargando') return <EsqueletoHeroRestaurante />
    if (actual.estado === 'noEncontrado') {
      return (
        <BloqueEstado
          icono="local"
          titulo="No encontramos este restaurante"
          texto="Puede que ya no esté disponible. Volvé al inicio para ver los demás."
          boton="Volver al inicio"
          onBoton={() => navigate('/')}
        />
      )
    }
    if (actual.estado === 'error' || !actual.restaurante) {
      return (
        <BloqueEstado
          icono="aviso"
          titulo="No pudimos cargar el restaurante"
          texto="Revisá tu conexión e intentá de nuevo."
          boton="Reintentar"
          onBoton={() => void cargarRestaurante(restauranteId)}
          rol="alert"
        />
      )
    }

    const { restaurante, ofertas } = actual
    const conOfertas = ofertas.length > 0
    return (
      <div
        className={`grid grid-cols-1 items-start gap-7 ${
          conOfertas ? 'md:grid-cols-[340px_minmax(0,1fr)] md:gap-6 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-7' : 'md:justify-items-center'
        }`}
      >
        <section
          className={`flex min-w-0 flex-col items-center rounded-2xl border bg-white px-5 pb-5 pt-6 text-center ${
            conOfertas ? 'md:sticky md:top-[76px] lg:px-7 lg:pb-6 lg:pt-7' : 'md:w-full md:max-w-[440px] md:px-7 md:pb-6 md:pt-7'
          }`}
          style={{ borderColor: C.border }}
        >
          <LogoRestaurante nombre={restaurante.nombre} logoUrl={restaurante.logoUrl} tamano={96} />
          <h1 style={{ margin: '16px 0 8px', fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 24, lineHeight: 1.2, letterSpacing: '-0.02em', color: C.navy, overflowWrap: 'anywhere' }}>
            {restaurante.nombre}
          </h1>
          <p
            style={{
              margin: '0 0 24px',
              fontFamily: 'Inter, sans-serif',
              fontSize: 14,
              lineHeight: 1.45,
              color: restaurante.direccion ? C.textSub : C.gray,
              fontStyle: restaurante.direccion ? 'normal' : 'italic',
              overflowWrap: 'anywhere',
            }}
          >
            <span style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 6 }}>
              <Icono nombre="pin" tam={16} />
            </span>
            {restaurante.direccion ?? 'Dirección no cargada'}
          </p>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <BotonGrande to={`/restaurante/${encodeURIComponent(restaurante.id)}/mesa`} icono="escanear">Ingresar a una mesa</BotonGrande>
            <p style={{ margin: '0 0 14px', fontFamily: 'Inter, sans-serif', fontSize: 13, lineHeight: 1.45, color: C.textSub }}>
              Escaneá el QR o ingresá el PIN de tu mesa.
            </p>
            <BotonGrande to={`/restaurante/${encodeURIComponent(restaurante.id)}/carta`} icono="carta" variante="secundario">Ver la carta</BotonGrande>
            <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: 13, lineHeight: 1.45, color: C.textSub }}>
              Mirá los platos y los precios sin ingresar a una mesa.
            </p>
          </div>
        </section>

        {conOfertas && (
          <section style={{ minWidth: 0 }}>
            <TituloSeccion>Ofertas de este restaurante</TituloSeccion>
            <div className="grid grid-cols-2 gap-[10px] lg:grid-cols-3">
              {ofertas.map((oferta) => <TarjetaOferta key={oferta.id} oferta={oferta} sinRestaurante fija />)}
            </div>
          </section>
        )}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <AppHeader />
      <main style={{ paddingTop: 60, paddingBottom: 40 }}>
        <div className="mx-auto w-full max-w-[1120px] px-[14px] md:px-6">
          <VolverEnlace to="/" />
          {cuerpo()}
        </div>
      </main>
    </div>
  )
}
