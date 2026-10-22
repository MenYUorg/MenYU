import { useEffect, useId, useState } from 'react'
import { usePerfil } from '@menyu/auth-client'
import { api } from '../../../services/api'
import { useContextStore } from '../../../store/contextStore'
import { LogoUploader } from './LogoUploader'
import { SucursalCard } from './SucursalCard'
import { C, tarjeta, textoAyuda, tituloSeccion } from './estilos'

/** Logo y dirección de la marca y sus sucursales. Solo la ve el OWNER (la ruta está protegida en App.tsx). */
export function MarcaPage() {
  const perfil = usePerfil()
  const { marcas, selectedMarcaId, restaurantes, loadContext, refreshContext } = useContextStore()
  const [cargado, setCargado] = useState(false)
  const idTituloMarca = useId()
  const idTituloSucursales = useId()

  // Se piden los datos al entrar para ver siempre lo último guardado. Va con el perfil, no con `refreshContext`:
  // esta pantalla puede montarse antes de que el layout haya cargado el contexto (al entrar directo por la URL).
  useEffect(() => {
    void loadContext(perfil).finally(() => setCargado(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const marca = marcas.find((m) => m.id === selectedMarcaId) ?? marcas[0] ?? null
  const sucursales = marca ? restaurantes.filter((r) => r.marcaId === marca.id) : []

  if (!marca) {
    return (
      <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
        <p style={{ ...textoAyuda, fontSize: 14 }}>
          {cargado
            ? 'No encontramos una marca asociada a tu cuenta. Probá recargar la página.'
            : 'Cargando…'}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6 space-y-6">
      <section aria-labelledby={idTituloMarca} style={tarjeta}>
        <p
          style={{
            fontFamily:    'Montserrat, sans-serif',
            fontWeight:    700,
            fontSize:      10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color:         C.muted,
            margin:        '0 0 4px',
          }}
        >
          Marca
        </p>
        <h3 id={idTituloMarca} style={{ ...tituloSeccion, fontSize: 18 }}>
          {marca.nombre}
        </h3>
        <p style={{ ...textoAyuda, margin: '6px 0 16px' }}>
          Este logo se muestra en el menú de todas las sucursales que no tengan un logo propio.
        </p>

        <LogoUploader
          nombre={marca.nombre}
          logoUrl={marca.logoUrl}
          textoConLogo="Logo de la marca"
          textoSinLogo="Todavía no cargaste un logo"
          avisoAlQuitar="Las sucursales que no tengan logo propio van a quedar sin logo."
          onSubir={async (archivo) => {
            await api.marcas.uploadLogo(marca.id, archivo)
            await refreshContext()
          }}
          onQuitar={async () => {
            await api.marcas.deleteLogo(marca.id)
            await refreshContext()
          }}
        />
      </section>

      <section aria-labelledby={idTituloSucursales} className="space-y-4">
        <h3 id={idTituloSucursales} style={tituloSeccion}>
          Sucursales
        </h3>

        {sucursales.length === 0 ? (
          <p style={{ ...textoAyuda, fontSize: 14 }}>Esta marca todavía no tiene sucursales.</p>
        ) : (
          sucursales.map((sucursal) => (
            <SucursalCard
              key={sucursal.id}
              restaurante={sucursal}
              logoMarcaUrl={marca.logoUrl}
              onCambio={refreshContext}
            />
          ))
        )}
      </section>
    </div>
  )
}
