import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { ItemCarrito } from '@menyu/types'
import { useCarritoStore } from '../stores/useCarritoStore'
import { MenuItemCard } from '../components/MenuItemCard'

const ITEMS_MOCK: Omit<ItemCarrito, 'cantidad'>[] = [
  {
    id: '1',
    nombre: 'Milanesa napolitana',
    precio: 3500,
    imagenUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Milanesa_napolitana.jpg/640px-Milanesa_napolitana.jpg',
  },
  {
    id: '2',
    nombre: 'Empanada de carne',
    precio: 850,
  },
  {
    id: '3',
    nombre: 'Ensalada mixta',
    precio: 2200,
    imagenUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Mixed_salad_platter.jpg/640px-Mixed_salad_platter.jpg',
  },
  {
    id: '4',
    nombre: 'Agua mineral 500ml',
    precio: 600,
  },
]

export function MenuScreen() {
  const cantidadTotal = useCarritoStore((s) => s.cantidadTotal())

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.lista}>
        <Text style={styles.titulo}>Menú</Text>
        {ITEMS_MOCK.map((item) => (
          <MenuItemCard key={item.id} item={item} />
        ))}
      </ScrollView>

      {cantidadTotal > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.btnVerCarrito} activeOpacity={0.85}>
            <Text style={styles.btnVerCarritoText}>Ver carrito · {cantidadTotal} {cantidadTotal === 1 ? 'ítem' : 'ítems'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#F9F9F9',
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
  },
  btnVerCarrito: {
    backgroundColor: '#D4621A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnVerCarritoText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
})
