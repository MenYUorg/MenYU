import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useCarritoStore } from '../stores/useCarritoStore'

interface CantidadControlProps {
  itemId: string
  onIncrement: () => void
  onDecrement: () => void
}

export function CantidadControl({ itemId, onIncrement, onDecrement }: CantidadControlProps) {
  const cantidad = useCarritoStore(
    (state) => state.items.find((i) => i.id === itemId)?.cantidad ?? 0,
  )

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.btn} onPress={onDecrement} activeOpacity={0.7}>
        <Text style={styles.btnText}>−</Text>
      </TouchableOpacity>
      <Text style={styles.cantidad}>{cantidad}</Text>
      <TouchableOpacity style={styles.btn} onPress={onIncrement} activeOpacity={0.7}>
        <Text style={styles.btnText}>+</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#D4621A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  cantidad: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    minWidth: 24,
    textAlign: 'center',
  },
})
