import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { ItemCarrito } from '@menyu/types'
import { useCarritoStore } from '../stores/useCarritoStore'
import { CantidadControl } from './CantidadControl'

interface CarritoItemProps {
  item: ItemCarrito
}

export function CarritoItem({ item }: CarritoItemProps) {
  const quitarItem = useCarritoStore((s) => s.quitarItem)
  const actualizarCantidad = useCarritoStore((s) => s.actualizarCantidad)

  return (
    <View style={styles.card}>
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
          <Text style={styles.precioUnitario}>${item.precio.toFixed(2)} c/u</Text>
          <Text style={styles.subtotal}>Subtotal: ${(item.precio * item.cantidad).toFixed(2)}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <CantidadControl
          itemId={item.id}
          onIncrement={() => actualizarCantidad(item.id, item.cantidad + 1)}
          onDecrement={() => {
            if (item.cantidad === 1) {
              quitarItem(item.id)
            } else {
              actualizarCantidad(item.id, item.cantidad - 1)
            }
          }}
        />
        <TouchableOpacity onPress={() => quitarItem(item.id)} activeOpacity={0.7}>
          <Text style={styles.btnEliminar}>Eliminar</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 12,
    gap: 12,
  },
  fila: {
    flexDirection: 'row',
    gap: 12,
  },
  imagen: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  imagenFallback: {
    backgroundColor: '#F3F3F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagenFallbackText: {
    fontSize: 24,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  nombre: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  precioUnitario: {
    fontSize: 13,
    color: '#666666',
  },
  subtotal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D4621A',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  btnEliminar: {
    fontSize: 13,
    color: '#C62828',
    fontWeight: '600',
  },
})
