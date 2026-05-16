import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useCarritoStore } from '../stores/useCarritoStore'
import { CarritoItem } from '../components/CarritoItem'

export function CarritoScreen() {
  const items = useCarritoStore((s) => s.items)
  const total = useCarritoStore((s) => s.total())
  const vaciarCarrito = useCarritoStore((s) => s.vaciarCarrito)

  if (items.length === 0) {
    return (
      <View style={styles.vacio}>
        <Text style={styles.vacioIcono}>🛒</Text>
        <Text style={styles.vacioTexto}>Tu carrito está vacío</Text>
      </View>
    )
  }

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.lista}>
        <Text style={styles.titulo}>Tu pedido</Text>
        {items.map((item) => (
          <CarritoItem key={item.id} item={item} />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.totalFila}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValor}>${total.toFixed(2)}</Text>
        </View>
        <TouchableOpacity style={styles.btnConfirmar} activeOpacity={0.85}>
          <Text style={styles.btnConfirmarText}>Confirmar pedido</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnVaciar} onPress={vaciarCarrito} activeOpacity={0.7}>
          <Text style={styles.btnVaciarText}>Vaciar carrito</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  vacio: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#F9F9F9',
  },
  vacioIcono: {
    fontSize: 56,
  },
  vacioTexto: {
    fontSize: 18,
    color: '#666666',
    fontWeight: '600',
  },
  lista: {
    padding: 16,
    gap: 12,
  },
  titulo: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 10,
  },
  totalFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  totalValor: {
    fontSize: 20,
    fontWeight: '800',
    color: '#D4621A',
  },
  btnConfirmar: {
    backgroundColor: '#D4621A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnConfirmarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  btnVaciar: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnVaciarText: {
    color: '#666666',
    fontSize: 14,
    fontWeight: '600',
  },
})
