import { useMemo, useState } from 'react'
import { Mail, Search, Users } from 'lucide-react'
import type { RootDueno } from '@menyu/types'
import { api } from '../../../services/api'
import { DialogoInvitacionEnviada } from '../dialogos/invitacion-enviada'
import { DialogoInvitarDueno } from '../dialogos/invitar-dueno'
import { DialogoNoSePuedeQuitar, DialogoQuitarDueno } from '../dialogos/quitar-dueno'
import { ErrorDeCarga, EsqueletoDeFilas, Vacio } from '../ui/piezas'
import { FilaDeDueno } from '../ui/FilaDeDueno'
import { PaginaRoot } from '../ui/PaginaRoot'
import { sinAcentos } from '../ui/texto'
import { useAvisoTemporal } from '../ui/useAvisoTemporal'
import { useCarga } from '../useCarga'

type Dialogo =
  | { tipo: 'invitar'; marcaId?: string }
  | { tipo: 'enviada'; email: string; enviada: boolean }
  | { tipo: 'quitar'; dueno: RootDueno }
  | { tipo: 'ultimo'; marca: { id: string; nombre: string } }

/**
 * Todos los dueños, con su marca: sirve para encontrar una cuenta sin saber de qué marca es. Se busca por nombre, email o marca
 * (sin importar mayúsculas ni acentos), se invita a uno nuevo y se le quita el acceso. La API trae la lista entera: la búsqueda
 * se hace acá, así «lucia» encuentra a «Lucía».
 */
export function DuenosPage() {
  const [busqueda, setBusqueda] = useState('')
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const [aviso, mostrarAviso] = useAvisoTemporal()
  const { estado, datos, recargar, actualizar } = useCarga(() => api.root.duenos.listar(), [])

  const texto = sinAcentos(busqueda.trim())
  const visibles = useMemo(
    () =>
      (datos ?? []).filter(
        (d) =>
          !texto ||
          sinAcentos(d.nombre).includes(texto) ||
          sinAcentos(d.email).includes(texto) ||
          sinAcentos(d.marca?.nombre ?? '').includes(texto),
      ),
    [datos, texto],
  )

  const cerrar = () => setDialogo(null)

  /** El último dueño de una marca activa no se quita (la API también lo rechaza con 409): se cuenta sobre la lista entera. */
  function quitar(dueno: RootDueno) {
    const marca = dueno.marca
    const ultimo = marca?.activo && (datos ?? []).filter((d) => d.marca?.id === marca.id).length === 1
    setDialogo(marca && ultimo ? { tipo: 'ultimo', marca } : { tipo: 'quitar', dueno })
  }

  return (
    <PaginaRoot>
      <div className="barra">
        <div className="barra-izq">
          <div className="buscar campo" style={{ margin: 0 }}>
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="Buscar por nombre, email o marca"
              aria-label="Buscar dueño"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setDialogo({ tipo: 'invitar' })}>
          <Mail size={16} aria-hidden="true" />
          Invitar dueño
        </button>
      </div>

      {estado === 'cargando' && <EsqueletoDeFilas filas={5} />}
      {(estado === 'error' || estado === 'sin-conexion') && <ErrorDeCarga sinConexion={estado === 'sin-conexion'} onReintentar={recargar} />}

      {estado === 'ok' && datos && datos.length === 0 && (
        <Vacio icono={Users} titulo="Todavía no hay dueños">
          Un dueño es la cuenta que administra una marca. Se lo invita por mail.
        </Vacio>
      )}

      {estado === 'ok' && datos && datos.length > 0 && visibles.length === 0 && (
        <Vacio icono={Search} titulo={`No encontramos dueños con «${busqueda.trim()}»`}>
          Probá con otro nombre, email o marca.
        </Vacio>
      )}

      {estado === 'ok' && visibles.length > 0 && (
        <section className="card" aria-label="Dueños" style={{ padding: '8px 20px' }}>
          {visibles.map((dueno) => (
            <FilaDeDueno
              key={dueno.membresiaId}
              nombre={dueno.nombre}
              email={dueno.email}
              marca={dueno.marca ?? undefined}
              desactivada={!dueno.activo}
              onQuitar={() => quitar(dueno)}
            />
          ))}
        </section>
      )}

      {aviso}

      {dialogo?.tipo === 'invitar' && (
        <DialogoInvitarDueno
          marcaInicialId={dialogo.marcaId}
          onInvitado={({ email, enviada }) => {
            actualizar()
            setDialogo({ tipo: 'enviada', email, enviada })
          }}
          onCerrar={cerrar}
        />
      )}
      {dialogo?.tipo === 'enviada' && <DialogoInvitacionEnviada email={dialogo.email} enviada={dialogo.enviada} onCerrar={cerrar} />}
      {dialogo?.tipo === 'quitar' && (
        <DialogoQuitarDueno
          dueno={dialogo.dueno}
          marcaNombre={dialogo.dueno.marca?.nombre ?? 'su marca'}
          onHecho={() => {
            cerrar()
            actualizar()
            mostrarAviso('Acceso quitado')
          }}
          onCerrar={cerrar}
        />
      )}
      {dialogo?.tipo === 'ultimo' && (
        <DialogoNoSePuedeQuitar
          marcaNombre={dialogo.marca.nombre}
          onInvitar={() => setDialogo({ tipo: 'invitar', marcaId: dialogo.marca.id })}
          onCerrar={cerrar}
        />
      )}
    </PaginaRoot>
  )
}
