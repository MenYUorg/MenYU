import { useState } from 'react'
import { Mail } from 'lucide-react'
import { api } from '../../../services/api'
import { DialogoInvitacionEnviada } from '../dialogos/invitacion-enviada'
import { DialogoInvitarRoot } from '../dialogos/invitar-root'
import { Aviso, ErrorDeCarga, EsqueletoDeFilas, Sigla } from '../ui/piezas'
import { PaginaRoot } from '../ui/PaginaRoot'
import { useCarga } from '../useCarga'

type Dialogo = { tipo: 'invitar' } | { tipo: 'enviada'; email: string; enviada: boolean }

/**
 * Las cuentas ROOT del equipo: se las ve y se invita a otra por mail. A propósito no hay acciones por cuenta: las cuentas ROOT no
 * se quitan ni se les restablece la contraseña desde la consola (cada persona la recupera desde la pantalla de ingreso).
 */
export function CuentasRootPage() {
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const { estado, datos, recargar, actualizar } = useCarga(() => api.root.cuentas.listar(), [])

  return (
    <PaginaRoot>
      <div className="barra">
        <span className="ayuda">Cada integrante del equipo tiene la suya.</span>
        <button type="button" className="btn btn-primary" onClick={() => setDialogo({ tipo: 'invitar' })}>
          <Mail size={16} aria-hidden="true" />
          Invitar cuenta ROOT
        </button>
      </div>

      <Aviso tipo="info">
        <b>Las cuentas ROOT no se quitan desde la consola.</b> Cada persona maneja su contraseña desde la pantalla de ingreso
        («Olvidé mi contraseña»).
      </Aviso>

      {estado === 'cargando' && <EsqueletoDeFilas filas={3} />}
      {(estado === 'error' || estado === 'sin-conexion') && <ErrorDeCarga sinConexion={estado === 'sin-conexion'} onReintentar={recargar} />}

      {estado === 'ok' && datos && (
        <section className="card" aria-label="Cuentas ROOT" style={{ padding: '8px 20px' }}>
          {datos.map((cuenta) => (
            <div className="item" key={cuenta.id}>
              <Sigla nombre={cuenta.nombre} />
              <div className="item-txt">
                <b>{cuenta.nombre}</b>
                <small className="cortar2">{cuenta.email}</small>
                {(cuenta.esPropia || !cuenta.activo) && (
                  <div className="item-chips">
                    {cuenta.esPropia && <span className="chip chip-ok">Vos</span>}
                    {!cuenta.activo && (
                      <span className="chip chip-aviso" title="Su cuenta está desactivada: no entra a la consola">
                        Cuenta desactivada
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {dialogo?.tipo === 'invitar' && (
        <DialogoInvitarRoot
          onInvitada={({ email, enviada }) => {
            actualizar()
            setDialogo({ tipo: 'enviada', email, enviada })
          }}
          onCerrar={() => setDialogo(null)}
        />
      )}
      {dialogo?.tipo === 'enviada' && (
        <DialogoInvitacionEnviada email={dialogo.email} enviada={dialogo.enviada} aRoot onCerrar={() => setDialogo(null)} />
      )}
    </PaginaRoot>
  )
}
