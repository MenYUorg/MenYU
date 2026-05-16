import { useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { useMozoStore } from '../../store/mozoStore'
import { joinRestauranteComoMozo, onMozoCalled, onPedidoNuevo } from '../../services/socket'
import { pedirPermiso, mostrarNotificacion } from '../../services/notifications'

export default function PanelScreen() {
  const {
    restauranteId,
    llamados,
    notifPermiso,
    addLlamado,
    marcarAtendido,
    setNotifPermiso,
  } = useMozoStore()

  // Pedir permiso de notificaciones y conectar socket al montar
  useEffect(() => {
    void pedirPermiso().then((p) => setNotifPermiso(p as NotificationPermission))

    if (restauranteId) {
      joinRestauranteComoMozo(restauranteId)
    }

    const offLlamado = onMozoCalled((data) => {
      addLlamado(data)
      mostrarNotificacion(
        `Mesa ${data.mesaNumero} llama`,
        'Un cliente necesita atención',
      )
    })

    const offPedido = onPedidoNuevo(() => {
      mostrarNotificacion('Nuevo pedido', 'Revisá el panel de pedidos')
    })

    return () => {
      offLlamado()
      offPedido()
    }
  }, [restauranteId])

  const pendientes = llamados.filter((l) => !l.atendido)
  const atendidos = llamados.filter((l) => l.atendido)

  return (
    <View style={styles.flex}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>MenYu</Text>
        <Text style={styles.rol}>Panel del mozo</Text>
        {notifPermiso !== 'granted' && (
          <TouchableOpacity
            style={styles.notifBadge}
            onPress={() => void pedirPermiso().then((p) => setNotifPermiso(p as NotificationPermission))}
          >
            <Text style={styles.notifText}>🔔 Activar notificaciones</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {/* Badge de llamados pendientes */}
        {pendientes.length > 0 && (
          <View style={styles.alertBanner}>
            <Text style={styles.alertText}>
              🚨 {pendientes.length} llamado{pendientes.length > 1 ? 's' : ''} pendiente{pendientes.length > 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {/* Llamados pendientes */}
        <Text style={styles.sectionTitle}>Llamados activos</Text>
        {pendientes.length === 0 ? (
          <Text style={styles.empty}>Sin llamados pendientes</Text>
        ) : (
          pendientes.map((l) => (
            <View key={l.sesionId} style={styles.llamadoCard}>
              <View style={styles.llamadoInfo}>
                <Text style={styles.llamadoMesa}>Mesa {l.mesaNumero}</Text>
                <Text style={styles.llamadoHora}>
                  {l.recibitoEn.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.atenderBtn}
                onPress={() => marcarAtendido(l.sesionId)}
              >
                <Text style={styles.atenderText}>Atendido</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Historial */}
        {atendidos.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Historial de hoy</Text>
            {atendidos.map((l) => (
              <View key={`${l.sesionId}-hist`} style={[styles.llamadoCard, styles.llamadoAtendido]}>
                <Text style={[styles.llamadoMesa, { color: '#888888' }]}>Mesa {l.mesaNumero}</Text>
                <Text style={styles.llamadoHora}>
                  {l.recibitoEn.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Text style={styles.checkmark}>✓</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F9F9F9' },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    gap: 2,
  },
  logo: { fontSize: 22, fontWeight: '800', color: '#D4621A' },
  rol: { fontSize: 13, color: '#888888' },
  notifBadge: {
    marginTop: 8,
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  notifText: { fontSize: 13, color: '#856404' },
  content: { padding: 16, gap: 8 },
  alertBanner: {
    backgroundColor: '#FEECEC',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  alertText: { fontSize: 15, fontWeight: '700', color: '#C62828' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  empty: { fontSize: 14, color: '#AAAAAA', textAlign: 'center', paddingVertical: 20 },
  llamadoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEEEEE',
    marginBottom: 4,
  },
  llamadoAtendido: { opacity: 0.5 },
  llamadoInfo: { flex: 1 },
  llamadoMesa: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  llamadoHora: { fontSize: 12, color: '#888888', marginTop: 2 },
  atenderBtn: {
    backgroundColor: '#D4621A',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  atenderText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  checkmark: { fontSize: 18, color: '#4CAF50' },
})
