import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { ItemCarrito } from '@menyu/types'
import { useCarritoStore } from '../stores/useCarritoStore'
import { CantidadControl } from './CantidadControl'

interface MenuItemCardProps {
  item: Omit<ItemCarrito, 'cantidad'>
}

export function MenuItemCard({ item }: MenuItemCardProps) {
  const cantidad = useCarritoStore(
    (state) => state.items.find((i) => i.id === item.id)?.cantidad ?? 0,
  )
  const agregarItem = useCarritoStore((s) => s.agregarItem)
  const quitarItem = useCarritoStore((s) => s.quitarItem)
  const actualizarCantidad = useCarritoStore((s) => s.actualizarCantidad)

  return (
    <View style={styles.card}>
      {item.imagenUrl ? (
        <Image source={{ uri: item.imagenUrl }} style={styles.imagen} resizeMode="cover" />
      ) : (
        <View style={[styles.imagen, styles.imagenFallback]}>
          <Text style={styles.imagenFallbackText}>🍽</Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.nombre}>{item.nombre}</Text>
        <Text style={styles.precio}>${item.precio.toFixed(2)}</Text>
      </View>

      <View style={styles.accion}>
        {cantidad === 0 ? (
          <TouchableOpacity style={styles.btnAgregar} onPress={() => agregarItem(item)} activeOpacity={0.8}>
            <Text style={styles.btnAgregarText}>Agregar</Text>
          </TouchableOpacity>
        ) : (
          <CantidadControl
            itemId={item.id}
            onIncrement={() => actualizarCantidad(item.id, cantidad + 1)}
            onDecrement={() => {
              if (cantidad === 1) {
                quitarItem(item.id)
              } else {
                actualizarCantidad(item.id, cantidad - 1)
              }
            }}
          />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 12,
    gap: 12,
  },
  imagen: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
  imagenFallback: {
    backgroundColor: '#F3F3F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagenFallbackText: {
    fontSize: 28,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  nombre: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  precio: {
    fontSize: 14,
    color: '#666666',
  },
  accion: {
    alignItems: 'flex-end',
  },
  btnAgregar: {
    backgroundColor: '#D4621A',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnAgregarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
})
