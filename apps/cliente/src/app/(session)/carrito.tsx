import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { useCartStore } from '../../store/cartStore'

export default function CarritoScreen() {
  const router = useRouter()
  const items = useCartStore((s) => s.items)
  const quitar = useCartStore((s) => s.quitar)
  const incrementar = useCartStore((s) => s.incrementar)
  const decrementar = useCartStore((s) => s.decrementar)
  const total = useCartStore((s) => s.total())

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Tu pedido</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.vacio}>
          <Text style={styles.vacioIcono}>🛒</Text>
          <Text style={styles.vacioTexto}>Tu carrito está vacío</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.lista}>
            {items.map((item, index) => (
              <View key={index} style={styles.card}>
                <View style={styles.fila}>
                  {item.imagenUrl ? (
                    <Image source={{ uri: item.imagenUrl }} style={styles.imagen} resizeMode="cover" />
                  ) : (
                    <View style={[styles.imagen, styles.imagenFallback]}>
                      <Text style={styles.imagenFallbackText}>🍽</Text>
                    </View>
                  )}
                  <View style={styles.info}>
                    <Text style={styles.nombre}>{item.nombre}</Text>
                    {item.modificaciones.length > 0 && (
                      <Text style={styles.mods}>
                        {item.modificaciones.map((m) =>
                          m.accion === 'quitar' ? `Sin ${m.itemIngredienteId}` : `+${m.itemIngredienteId}`
                        ).join(', ')}
                      </Text>
                    )}
                    <Text style={styles.precio}>${item.precioTotal.toFixed(2)}</Text>
                  </View>
                </View>
                <View style={styles.cardFooter}>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => decrementar(index)}>
                      <Text style={styles.qtyBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyValor}>{item.cantidad}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => incrementar(index)}>
                      <Text style={styles.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => quitar(index)}>
                    <Text style={styles.btnEliminarText}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </View>
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
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F9F9F9' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  backBtn: { padding: 4 },
  backText: { color: '#D4621A', fontSize: 15 },
  title: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  vacioIcono: { fontSize: 56 },
  vacioTexto: { fontSize: 18, color: '#666666', fontWeight: '600' },
  lista: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 12,
    gap: 10,
  },
  fila: { flexDirection: 'row', gap: 12 },
  imagen: { width: 64, height: 64, borderRadius: 8 },
  imagenFallback: { backgroundColor: '#F3F3F3', alignItems: 'center', justifyContent: 'center' },
  imagenFallbackText: { fontSize: 24 },
  info: { flex: 1, gap: 2 },
  nombre: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  mods: { fontSize: 12, color: '#888888' },
  precio: { fontSize: 15, fontWeight: '700', color: '#D4621A', marginTop: 2 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 18, color: '#1A1A1A', lineHeight: 22 },
  qtyValor: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', minWidth: 24, textAlign: 'center' },
  btnEliminarText: { fontSize: 13, color: '#C62828', fontWeight: '600' },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 10,
  },
  totalFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  totalValor: { fontSize: 20, fontWeight: '800', color: '#D4621A' },
  btnConfirmar: {
    backgroundColor: '#D4621A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnConfirmarText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
})
