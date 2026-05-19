import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMenuStore } from '../../../store/menuStore'
import { useCartStore } from '../../../store/cartStore'
import type { ItemIngrediente, ModificacionIngrediente } from '@menyu/types'

export default function ItemDetailScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>()
  const router = useRouter()
  const getItemById = useMenuStore((s) => s.getItemById)
  const item = getItemById(itemId ?? '')

  const agregarAlCarrito = useCartStore((s) => s.agregar)

  const [removidos, setRemovidos] = useState<Set<string>>(new Set())
  const [agregados, setAgregados] = useState<Map<string, number>>(new Map())

  if (!item) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Ítem no encontrado</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>← Volver</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const precioModificaciones = Array.from(agregados.entries()).reduce((acc, [id, qty]) => {
    const ing = item.ingredientes?.find((ii) => ii.id === id)
    return acc + (ing ? Number(ing.precioExtra) * qty : 0)
  }, 0)
  const precioTotal = Number(item.precioBase) + precioModificaciones

  const toggleRemovido = (id: string) => {
    setRemovidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const cambiarCantidadAgregado = (ii: ItemIngrediente, delta: number) => {
    setAgregados((prev) => {
      const next = new Map(prev)
      const actual = next.get(ii.id) ?? 0
      const nuevo = Math.max(ii.cantidadMin, Math.min(ii.cantidadMax, actual + delta))
      if (nuevo === 0) next.delete(ii.id)
      else next.set(ii.id, nuevo)
      return next
    })
  }

  const handleAgregarAlCarrito = () => {
    const modificaciones: ModificacionIngrediente[] = []

    for (const id of removidos) {
      const ii = item.ingredientes?.find((i) => i.id === id)
      if (!ii) continue
      modificaciones.push({
        itemIngredienteId: ii.id,
        ingredienteId: ii.ingredienteId,
        accion: 'quitar',
        cantidad: Number(ii.cantidad),
        precioExtra: 0,
      })
    }

    for (const [id, qty] of agregados) {
      const ii = item.ingredientes?.find((i) => i.id === id)
      if (!ii) continue
      modificaciones.push({
        itemIngredienteId: ii.id,
        ingredienteId: ii.ingredienteId,
        accion: 'agregar',
        cantidad: qty,
        precioExtra: Number(ii.precioExtra),
      })
    }

    agregarAlCarrito({
      itemMenuId: item.id,
      cantidad: 1,
      precioBase: Number(item.precioBase),
      modificaciones,
      precioTotal,
      nombre: item.nombre,
      imagenUrl: item.imagenUrl,
    })

    router.back()
  }

  const ingredientesOriginales = (item.ingredientes ?? []).filter((ii) => ii.esOriginal)
  const ingredientesAgregables = (item.ingredientes ?? []).filter((ii) => ii.esAgregable && !ii.esOriginal)

  return (
    <View style={styles.flex}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.flex}>
        {/* Imagen */}
        {item.imagenUrl ? (
          <Image source={{ uri: item.imagenUrl }} style={styles.heroImg} />
        ) : (
          <View style={[styles.heroImg, styles.heroPlaceholder]}>
            <Text style={styles.heroEmoji}>🍽</Text>
          </View>
        )}

        <View style={styles.body}>
          {/* Info básica */}
          <Text style={styles.nombre}>{item.nombre}</Text>
          {item.descripcion ? <Text style={styles.descripcion}>{item.descripcion}</Text> : null}

          <View style={styles.metaRow}>
            <Text style={styles.precioBase}>${Number(item.precioBase).toFixed(2)}</Text>
          </View>

          {/* Ingredientes incluidos (removibles) */}
          {ingredientesOriginales.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Incluye</Text>
              {ingredientesOriginales.map((ii) => (
                <View key={ii.id} style={styles.optionRow}>
                  <Text style={[styles.optionLabel, removidos.has(ii.id) && styles.strikethrough]}>
                    {ii.ingrediente?.nombre ?? ii.ingredienteId}
                    {ii.ingrediente?.esAlergeno ? ' ⚠️' : ''}
                  </Text>
                  {ii.esRemovible && (
                    <TouchableOpacity onPress={() => toggleRemovido(ii.id)} style={styles.toggleBtn}>
                      <Text style={styles.toggleText}>
                        {removidos.has(ii.id) ? 'Restaurar' : 'Quitar'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {!ii.esRemovible && (
                    <Text style={styles.fixed}>Fijo</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Ingredientes agregables */}
          {ingredientesAgregables.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Extras opcionales</Text>
              {ingredientesAgregables.map((ii) => {
                const qty = agregados.get(ii.id) ?? 0
                return (
                  <View key={ii.id} style={styles.optionRow}>
                    <View style={styles.optionLabelGroup}>
                      <Text style={styles.optionLabel}>{ii.ingrediente?.nombre ?? ii.ingredienteId}</Text>
                      {Number(ii.precioExtra) > 0 && (
                        <Text style={styles.optionPrice}>+${Number(ii.precioExtra).toFixed(2)} c/u</Text>
                      )}
                    </View>
                    <View style={styles.qtyRow}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => cambiarCantidadAgregado(ii, -1)}
                        disabled={qty <= 0}
                      >
                        <Text style={styles.qtyBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.qtyValue}>{qty}</Text>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => cambiarCantidadAgregado(ii, 1)}
                        disabled={qty >= ii.cantidadMax}
                      >
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Footer: precio total + botón agregar */}
      <View style={styles.footer}>
        <View>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalPrecio}>${precioTotal.toFixed(2)}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={handleAgregarAlCarrito}>
          <Text style={styles.addBtnText}>Agregar al carrito</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FFFFFF' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  error: { color: '#C62828', fontSize: 15 },
  link: { color: '#D4621A', fontSize: 14, fontWeight: '600' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  backBtn: { padding: 4 },
  backText: { color: '#D4621A', fontSize: 15 },
  heroImg: { width: '100%', height: 220 },
  heroPlaceholder: { backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  heroEmoji: { fontSize: 56 },
  body: { padding: 20, gap: 4 },
  nombre: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  descripcion: { fontSize: 14, color: '#666666', lineHeight: 20, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  precioBase: { fontSize: 20, fontWeight: '700', color: '#D4621A' },
  meta: { fontSize: 13, color: '#888888' },
  section: { marginTop: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 8,
  },
  optionRowActive: { backgroundColor: '#FFF8F5' },
  optionLabelGroup: { flex: 1, gap: 2 },
  optionLabel: { fontSize: 14, color: '#1A1A1A', flex: 1 },
  optionPrice: { fontSize: 12, color: '#D4621A', fontWeight: '600' },
  optionCheck: { fontSize: 18, color: '#D4621A', width: 24, textAlign: 'center' },
  strikethrough: { textDecorationLine: 'line-through', color: '#AAAAAA' },
  toggleBtn: {
    backgroundColor: '#FFF0E8',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  toggleText: { fontSize: 12, color: '#D4621A', fontWeight: '600' },
  fixed: { fontSize: 11, color: '#CCCCCC' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 18, color: '#1A1A1A', lineHeight: 22 },
  qtyValue: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', minWidth: 20, textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    backgroundColor: '#FFFFFF',
  },
  totalLabel: { fontSize: 12, color: '#888888' },
  totalPrecio: { fontSize: 20, fontWeight: '800', color: '#D4621A' },
  addBtn: {
    backgroundColor: '#D4621A',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
})
