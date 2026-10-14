import { C } from '../../theme'

const pulso = (estilo: React.CSSProperties) => <div className="animate-pulse" style={{ background: C.border, ...estilo }} />

/** La tarjeta del restaurante mientras llegan sus datos. */
export function EsqueletoHeroRestaurante() {
  return (
    <div aria-busy="true" aria-label="Cargando el restaurante" className="grid grid-cols-1 gap-7 md:justify-items-center">
      <section className="flex w-full min-w-0 flex-col items-center rounded-2xl border bg-white px-5 pb-5 pt-6 md:max-w-[440px] md:px-7 md:pb-6 md:pt-7" style={{ borderColor: C.border }}>
        {pulso({ width: 96, height: 96, borderRadius: 20 })}
        {pulso({ height: 24, width: '70%', margin: '16px 0 10px', borderRadius: 8 })}
        {pulso({ height: 14, width: '85%', marginBottom: 28, borderRadius: 8 })}
        {pulso({ height: 52, width: '100%', borderRadius: 14 })}
      </section>
    </div>
  )
}

/** El recuadro "Ingresando a …" de la pantalla de ingreso a mesa mientras llega el restaurante (el resto ya se puede usar). */
export function EsqueletoContextoMesa() {
  return (
    <div
      aria-busy="true"
      aria-label="Cargando el restaurante"
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', margin: '4px 0 24px', background: C.white, border: `1px solid ${C.border}`, borderRadius: 12 }}
    >
      {pulso({ width: 40, height: 40, borderRadius: 10, flex: 'none' })}
      <div style={{ flex: 1 }}>
        {pulso({ height: 9, width: '35%', marginBottom: 8, borderRadius: 6 })}
        {pulso({ height: 14, width: '70%', borderRadius: 6 })}
      </div>
    </div>
  )
}
