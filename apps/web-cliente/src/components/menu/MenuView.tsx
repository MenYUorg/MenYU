import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Spinner } from '@menyu/ui'
import type { MenuPublicoItem } from '@menyu/types'
import { useCuenta } from '../../hooks/useCuenta'
import { usePuedeCerrarSesion } from '../../hooks/usePuedeCerrarSesion'
import { menuEsDe, usePublicMenuStore } from '../../store/publicMenuStore'
import { useComensalStore } from '../../store/comensalStore'
import { AppHeader } from '../AppHeader'
import { BloqueEstado } from '../discovery/BloqueEstado'
import { VolverEnlace } from '../discovery/VolverEnlace'
import { BarraBusqueda } from './BarraBusqueda'
import { BotonCarrito } from './BotonCarrito'
import { ChipsSecciones } from './ChipsSecciones'
import { MenuDrawer } from './MenuDrawer'
import { MenuHeader } from './MenuHeader'
import { MesaSinCarta } from './MesaSinCarta'
import type { ModoMenu } from './modo'
import { CM } from './paleta'
import { SeccionesMenu } from './SeccionesMenu'

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchesBusqueda(nombre: string, buscar: string): boolean {
  if (!buscar.trim()) return true
  const query = buscar.toLowerCase().trim()
  return nombre.toLowerCase().split(/\s+/).some((palabra) => palabra.startsWith(query))
}

function itemPasaFiltros(item: MenuPublicoItem, buscar: string, activeDiets: Set<string>): boolean {
  if (!matchesBusqueda(item.nombre, buscar)) return false
  if (activeDiets.size > 0) {
    const ids = new Set(item.clasificaciones.map((c) => c.id))
    for (const d of activeDiets) if (!ids.has(d)) return false
  }
  return true
}

// ── Vista ─────────────────────────────────────────────────────────────────────

interface MenuViewProps {
  modo: ModoMenu
  /** El restaurante del que se muestra el menú: el de la sesión de mesa o el de la ruta de la carta. */
  restauranteId: string | null
}

/**
 * El menú de un restaurante: header, buscador con dietas, secciones y menú lateral. Lo usan dos pantallas: el de la mesa
 * (`mesa`, con pedido, mozo, carrito y detalle de los platos) y la carta en modo vista (`carta`, solo para mirar).
 */
export function MenuView({ modo, restauranteId }: MenuViewProps) {
  const navigate = useNavigate()
  const comensalNombre = useComensalStore((s) => s.nombre)
  const { menu: menuGuardado, loading, error, errorStatus, fetchMenu } = usePublicMenuStore()
  // El store guarda un solo menú: si es de otro restaurante (se pasó de uno a otro), todavía no llegó el de este.
  const menu = menuEsDe(menuGuardado, restauranteId) ? menuGuardado : null
  const menuId = menuGuardado?.restaurante.id

  // UI state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [categoriaActiva, setCategoriaActiva] = useState<string>('')
  const [activeDiets, setActiveDiets] = useState<Set<string>>(new Set())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const { cuenta, cerrarSesion: cerrarLaCuenta } = useCuenta()
  // "Cerrar sesión" no se ofrece si la mesa en la que está ya pidió algo.
  const puedeCerrarSesion = usePuedeCerrarSesion({ abierto: drawerOpen, conCuenta: !!cuenta })

  useEffect(() => {
    if (restauranteId && !menu) void fetchMenu(restauranteId)
  }, [restauranteId, menuId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if ((menu?.descuentos ?? []).length > 0) {
      setCategoriaActiva('descuentos')
    } else if (menu?.recomendados && menu.recomendados.length > 0) {
      setCategoriaActiva('recomendados')
    } else if (menu?.categorias[0]?.id) {
      setCategoriaActiva(menu.categorias[0].id)
    }
  }, [menu])

  // Unique classifications with item counts
  const allClasifs = useMemo(() => {
    if (!menu) return [] as { id: string; nombre: string; count: number }[]
    const map = new Map<string, { id: string; nombre: string; count: number }>()
    for (const cat of menu.categorias) {
      for (const item of cat.itemsDirectos) {
        for (const c of item.clasificaciones) {
          const ex = map.get(c.id)
          if (ex) ex.count++
          else map.set(c.id, { id: c.id, nombre: c.nombre, count: 1 })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [menu])

  // Grouped categories with filtering applied (for scroll-spy mode)
  const categoriasFiltradas = useMemo(() => {
    if (!menu) return []
    return menu.categorias.map((cat) => ({
      ...cat,
      itemsDirectos: cat.itemsDirectos.filter((item) => itemPasaFiltros(item, buscar, activeDiets)),
    })).filter((cat) => cat.itemsDirectos.length > 0)
  }, [menu, buscar, activeDiets])

  // Chef's recommendations with the same filters applied
  const recomendadosFiltrados = useMemo(() => {
    return (menu?.recomendados ?? []).filter((item) => itemPasaFiltros(item, buscar, activeDiets))
  }, [menu, buscar, activeDiets])

  // Platos en descuento con los mismos filtros (el backend los manda aparte, en el mismo orden que los recomendados)
  const descuentosFiltrados = useMemo(() => {
    return (menu?.descuentos ?? []).filter((item) => itemPasaFiltros(item, buscar, activeDiets))
  }, [menu, buscar, activeDiets])

  // Descuentos + recomendados + categorías combinados, para chips y scroll-spy
  const seccionesConId = useMemo(() => {
    const secciones: { id: string; nombre: string }[] = []
    if (descuentosFiltrados.length > 0) {
      secciones.push({ id: 'descuentos', nombre: 'Descuentos' })
    }
    if (recomendadosFiltrados.length > 0) {
      secciones.push({
        id: 'recomendados',
        nombre: menu?.restaurante.nombreSeccionRecomendados ?? 'RECOMENDACIONES',
      })
    }
    secciones.push(...categoriasFiltradas.map((c) => ({ id: c.id, nombre: c.nombre })))
    return secciones
  }, [descuentosFiltrados, recomendadosFiltrados, categoriasFiltradas, menu])

  // Scroll-spy: update active chip based on which section is visible
  useEffect(() => {
    // Purge refs for categories no longer in the DOM
    const activeIds = new Set(seccionesConId.map((s) => s.id))
    Object.keys(sectionRefs.current).forEach((id) => {
      if (!activeIds.has(id)) delete sectionRefs.current[id]
    })

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-categoria-id')
            if (id) setCategoriaActiva(id)
          }
        })
      },
      { threshold: 0.3 },
    )

    Object.values(sectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref)
    })

    return () => observer.disconnect()
  }, [seccionesConId])

  // Scroll listener: highlight "Todo" chip when scrolled to top
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const handleScroll = () => {
      if (container.scrollTop === 0) {
        const firstId = seccionesConId[0]?.id
        if (firstId) setCategoriaActiva(firstId)
      }
    }
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [seccionesConId])

  const handleCategoriaClick = (catId: string) => {
    sectionRefs.current[catId]?.scrollIntoView({ behavior: 'smooth' })
  }

  const cerrarSesion = () => {
    void cerrarLaCuenta()
    setDrawerOpen(false)
  }

  // Sin restaurante no hay menú (la mesa siempre trae el suyo y la carta lo toma de la dirección).
  if (!restauranteId) return null

  // Un restaurante que no existe (o dejó de estar activo): solo puede pasar al abrir la carta por un link.
  if (modo === 'carta' && !loading && error && errorStatus === 404) {
    return (
      <div style={{ minHeight: '100vh', background: CM.bg }}>
        <AppHeader />
        <main style={{ paddingTop: 60, paddingBottom: 40 }}>
          <div className="mx-auto w-full max-w-[428px] px-6">
            <VolverEnlace to="/" />
            <BloqueEstado
              icono="local"
              titulo="No encontramos este restaurante"
              texto="Puede que ya no esté disponible. Volvé al inicio para ver los demás."
              boton="Volver al inicio"
              onBoton={() => navigate('/')}
            />
          </div>
        </main>
      </div>
    )
  }

  // El menú de una mesa ya abierta responde 404: el restaurante (o su marca) se dio de baja con la mesa en marcha. La mesa se
  // deja terminar, así que se explica qué pasó y se ofrece pedir la cuenta, en vez de un error sin salida.
  if (modo === 'mesa' && !loading && error && errorStatus === 404) return <MesaSinCarta />

  // Mientras llega (o todavía no se pidió el de este restaurante).
  if (loading || (!menu && !error)) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100svh', background: CM.bg }}>
      <Spinner size="lg" />
    </div>
  )

  if (error || !menu) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100svh', gap: 12, padding: 24, background: CM.bg }}>
      <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: CM.orange, textAlign: 'center', margin: 0 }}>No se pudo cargar el menú</p>
      <button
        onClick={() => void fetchMenu(restauranteId)}
        style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 13, color: CM.orange, background: 'none', border: 'none', cursor: 'pointer' }}
      >
        Reintentar
      </button>
      {modo === 'carta' && (
        <Link
          to={`/restaurante/${encodeURIComponent(restauranteId)}`}
          style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: CM.textSub }}
        >
          Volver al restaurante
        </Link>
      )}
    </div>
  )

  // En la carta no se pide: las tarjetas no se tocan.
  const abrirDetalle = modo === 'mesa' ? (item: MenuPublicoItem) => navigate(`/menu/${item.id}`) : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: CM.bg }}>
      <MenuDrawer
        abierto={drawerOpen}
        onCerrar={() => setDrawerOpen(false)}
        modo={modo}
        restauranteId={restauranteId}
        nombreRestaurante={menu.restaurante.nombre}
        direccion={menu.restaurante.direccion}
        logoUrl={menu.restaurante.logoUrl}
        usuario={cuenta && { nombre: cuenta.nombre, email: cuenta.email }}
        comensalNombre={comensalNombre}
        puedeCerrarSesion={puedeCerrarSesion}
        onCerrarSesion={cerrarSesion}
      />

      <MenuHeader nombre={menu.restaurante.nombre} logoUrl={menu.restaurante.logoUrl} modo={modo} onAbrirMenu={() => setDrawerOpen(true)} />

      <BarraBusqueda
        buscar={buscar}
        onBuscar={setBuscar}
        clasificaciones={allClasifs}
        dietasActivas={activeDiets}
        onDietasActivas={setActiveDiets}
      />

      <ChipsSecciones secciones={seccionesConId} activa={categoriaActiva} onElegir={handleCategoriaClick} />

      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        <SeccionesMenu
          descuentos={descuentosFiltrados}
          recomendados={recomendadosFiltrados}
          nombreRecomendados={menu.restaurante.nombreSeccionRecomendados}
          categorias={categoriasFiltradas}
          onPress={abrirDetalle}
          registrar={(id, el) => { sectionRefs.current[id] = el }}
          buscar={buscar}
          hayDietas={activeDiets.size > 0}
          onLimpiarFiltros={() => { setBuscar(''); setActiveDiets(new Set()) }}
        />
      </div>

      {modo === 'mesa' && <BotonCarrito />}
    </div>
  )
}
