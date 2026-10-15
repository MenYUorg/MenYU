import { useId } from 'react'
import type { Restaurante } from '@menyu/types'
import { api } from '../../../services/api'
import { DireccionField } from './DireccionField'
import { LogoUploader } from './LogoUploader'
import { C, tarjeta, tituloSeccion } from './estilos'

interface SucursalCardProps {
  restaurante: Restaurante
  /** Logo de la marca: es el que se usa mientras la sucursal no tenga uno propio. */
  logoMarcaUrl: string | null
  /** Vuelve a pedir los datos al servidor después de un cambio. */
  onCambio: () => Promise<void>
}

export function SucursalCard({ restaurante, logoMarcaUrl, onCambio }: SucursalCardProps) {
  const idTitulo = useId()
  const { id, nombre } = restaurante

  return (
    <section aria-labelledby={idTitulo} style={tarjeta}>
      <h4 id={idTitulo} style={{ ...tituloSeccion, fontSize: 15, marginBottom: 16 }}>
        {nombre}
      </h4>

      {/* En tablet el menú lateral deja poco ancho: las dos columnas recién entran en pantallas grandes. */}
      <div className="grid gap-6 xl:grid-cols-2">
        <div>
          <p
            style={{
              fontFamily:   'Montserrat, sans-serif',
              fontWeight:   600,
              fontSize:     13,
              color:        C.navy,
              margin:       '0 0 10px',
            }}
          >
            Logo
          </p>
          <LogoUploader
            nombre={nombre}
            logoUrl={restaurante.logoUrl}
            logoHeredadoUrl={logoMarcaUrl}
            textoConLogo="Logo propio de la sucursal"
            textoHeredado="Usa el logo de la marca"
            textoSinLogo="Sin logo"
            avisoAlQuitar={
              logoMarcaUrl
                ? 'Va a usar el logo de la marca.'
                : 'Va a quedar sin logo porque la marca tampoco tiene uno.'
            }
            onSubir={async (archivo) => {
              await api.restaurantes.uploadLogo(id, archivo)
              await onCambio()
            }}
            onQuitar={async () => {
              await api.restaurantes.deleteLogo(id)
              await onCambio()
            }}
          />
        </div>

        <DireccionField
          nombre={nombre}
          direccion={restaurante.direccion}
          onGuardar={async (direccion) => {
            await api.restaurantes.update(id, { direccion })
            await onCambio()
          }}
        />
      </div>
    </section>
  )
}
