import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../services/api'
import type { MesaConQr } from '../../services/api'

function QrModal({ mesa, onClose }: { mesa: MesaConQr; onClose: () => void }) {
  const copiar = () => {
    navigator.clipboard.writeText(mesa.qrToken).catch(() => undefined)
  }

  const descargar = () => {
    const a = document.createElement('a')
    a.href = mesa.qrImage
    a.download = `mesa-${mesa.numero}-qr.png`
    a.click()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 360, width: '100%' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Mesa {mesa.numero} — QR</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#888' }}>Token: {mesa.qrToken}</p>
        <img src={mesa.qrImage} alt="QR de la mesa" style={{ width: '100%', borderRadius: 8, border: '1px solid #eee' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={descargar} style={{ flex: 1, padding: '8px 0', background: '#D4621A', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
            Descargar PNG
          </button>
          <button onClick={copiar} style={{ flex: 1, padding: '8px 0', background: '#F5F5F5', color: '#1A1A1A', border: '1px solid #E0E0E0', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
            Copiar token
          </button>
        </div>
        <button onClick={onClose} style={{ width: '100%', marginTop: 8, padding: '8px 0', background: 'transparent', color: '#888', border: 'none', cursor: 'pointer' }}>
          Cerrar
        </button>
      </div>
    </div>
  )
}

export function TablesPage() {
  const { selectedRestauranteId } = useAuthStore()
  const [mesas, setMesas] = useState<MesaConQr[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrMesa, setQrMesa] = useState<MesaConQr | null>(null)

  // Formulario crear mesa
  const [newNumero, setNewNumero] = useState('')
  const [creating, setCreating] = useState(false)

  const cargarMesas = async () => {
    if (!selectedRestauranteId) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.mesas.list(selectedRestauranteId)
      setMesas(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar mesas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void cargarMesas()
  }, [selectedRestauranteId])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!newNumero.trim() || !selectedRestauranteId) return
    setCreating(true)
    try {
      const m = await api.mesas.create({ restauranteId: selectedRestauranteId, numero: newNumero.trim() })
      setMesas((prev) => [...prev, m])
      setNewNumero('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear mesa')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleActiva = async (mesa: MesaConQr) => {
    try {
      await api.mesas.update(mesa.id, { activo: !mesa.activo })
      setMesas((prev) =>
        prev.map((m) => (m.id === mesa.id ? { ...m, activo: !m.activo } : m)),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar mesa')
    }
  }

  const handleRegenerarQr = async (id: string) => {
    try {
      const updated = await api.mesas.regenerarQr(id)
      setMesas((prev) => prev.map((m) => (m.id === id ? updated : m)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al regenerar QR')
    }
  }

  if (!selectedRestauranteId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#888', fontSize: 14 }}>
        Seleccioná un restaurante para ver las mesas
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>Gestión de mesas</h2>

      {/* Crear nueva mesa */}
      <form onSubmit={(e) => void handleCreate(e)} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          value={newNumero}
          onChange={(e) => setNewNumero(e.target.value)}
          placeholder="Número de mesa (ej: 1, A1, VIP)"
          style={{ flex: 1, maxWidth: 240, border: '1px solid #E0E0E0', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}
        />
        <button
          type="submit"
          disabled={creating || !newNumero.trim()}
          style={{ padding: '8px 18px', background: '#D4621A', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', opacity: creating ? 0.6 : 1 }}
        >
          {creating ? 'Creando…' : 'Agregar mesa'}
        </button>
      </form>

      {error && (
        <p style={{ color: '#C62828', fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}

      {loading ? (
        <p style={{ color: '#888', fontSize: 14 }}>Cargando mesas…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#F5F5F5' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Mesa</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>PIN</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Estado</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Activa</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {mesas.map((mesa) => (
              <tr key={mesa.id} style={{ borderBottom: '1px solid #F0F0F0' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{mesa.numero}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#555' }}>{mesa.pin}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    background: mesa.estado === 'libre' ? '#E8F5E9' : '#FFF3E0',
                    color: mesa.estado === 'libre' ? '#2E7D32' : '#E65100',
                  }}>
                    {mesa.estado}
                  </span>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <input
                    type="checkbox"
                    checked={mesa.activo}
                    onChange={() => void handleToggleActiva(mesa)}
                    style={{ cursor: 'pointer' }}
                  />
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setQrMesa(mesa)}
                      style={{ padding: '4px 10px', fontSize: 12, background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 6, cursor: 'pointer' }}
                    >
                      Ver QR
                    </button>
                    <button
                      onClick={() => void handleRegenerarQr(mesa.id)}
                      style={{ padding: '4px 10px', fontSize: 12, background: '#FFF8F5', border: '1px solid #FBBF9A', color: '#D4621A', borderRadius: 6, cursor: 'pointer' }}
                    >
                      Regenerar QR
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {mesas.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '20px 12px', textAlign: 'center', color: '#AAAAAA' }}>
                  No hay mesas. Agregá la primera.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {qrMesa && <QrModal mesa={qrMesa} onClose={() => setQrMesa(null)} />}
    </div>
  )
}
