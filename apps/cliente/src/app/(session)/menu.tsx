import { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { useMenuStore } from '../../store/menuStore'
import { useSessionStore } from '../../store/sessionStore'
import { useCartStore } from '../../store/cartStore'
import type { MenuPublicoCategoria } from '@menyu/types'

export default function MenuScreen() {
  const router = useRouter()
  const { restauranteId } = useSessionStore()
  const { menu, loading, error, fetchMenu } = useMenuStore()
  const cantidadCarrito = useCartStore((s) => s.items.length)
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [buscar, setBuscar] = useState('')

  useEffect(() => {
    if (restauranteId && !menu) void fetchMenu(restauranteId)
  }, [restauranteId])

  useEffect(() => {
    if (menu && menu.categorias.length > 0 && !categoriaActiva) {
      setCategoriaActiva(menu.categorias[0]?.id ?? null)
    }
  }, [menu])

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.hint}>Cargando menú…</Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity onPress={() => restauranteId && void fetchMenu(restauranteId)}>
          <Text style={styles.link}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (!menu) return null

  const buscarLower = buscar.toLowerCase().trim()

  const categoriasFiltradas: MenuPublicoCategoria[] = menu.categorias.map((cat) => ({
    ...cat,
    itemsDirectos: cat.itemsDirectos.filter((item) =>
      buscarLower ? item.nombre.toLowerCase().includes(buscarLower) : true,
    ),
    subcategorias: cat.subcategorias.map((sub) => ({
      ...sub,
      items: sub.items.filter((item) =>
        buscarLower ? item.nombre.toLowerCase().includes(buscarLower) : true,
      ),
    })).filter((sub) => sub.items.length > 0),
  })).filter((cat) => cat.itemsDirectos.length > 0 || cat.subcategorias.length > 0)

  const categoriaVisible = categoriaActiva
    ? categoriasFiltradas.find((c) => c.id === categoriaActiva) ?? categoriasFiltradas[0]
    : categoriasFiltradas[0]

  return (
    <View style={styles.flex}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{menu.restaurante.nombre}</Text>
        <TouchableOpacity onPress={() => router.push('/(session)/carrito')} style={styles.cartBtn}>
          <Text style={styles.cartIcon}>🛒</Text>
          {cantidadCarrito > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{cantidadCarrito}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar en el menú…"
          placeholderTextColor="#AAAAAA"
          value={buscar}
          onChangeText={setBuscar}
        />
      </View>

      {/* Tabs de categorías */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        {categoriasFiltradas.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.tab, categoriaActiva === cat.id && styles.tabActive]}
            onPress={() => setCategoriaActiva(cat.id)}
          >
            <Text style={[styles.tabText, categoriaActiva === cat.id && styles.tabTextActive]}>
              {cat.nombre}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Ítems */}
      <ScrollView style={styles.flex} contentContainerStyle={styles.itemsContainer}>
        {categoriaVisible?.itemsDirectos.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.itemCard}
            onPress={() => router.push(`/(session)/menu/${item.id}`)}
          >
            {item.imagenUrl ? (
              <Image source={{ uri: item.imagenUrl }} style={styles.itemImg} />
            ) : (
              <View style={[styles.itemImg, styles.itemImgPlaceholder]}>
                <Text style={styles.itemImgPlaceholderText}>🍽</Text>
              </View>
            )}
            <View style={styles.itemInfo}>
              <Text style={styles.itemNombre}>{item.nombre}</Text>
              {item.descripcion ? <Text style={styles.itemDesc} numberOfLines={2}>{item.descripcion}</Text> : null}
              <View style={styles.itemFooter}>
                <Text style={styles.itemPrecio}>${Number(item.precioBase).toFixed(2)}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
        {categoriaVisible?.subcategorias.map((sub) => (
          <View key={sub.id}>
            <Text style={styles.subcat}>{sub.nombre}</Text>
            {sub.items.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.itemCard}
                onPress={() => router.push(`/(session)/menu/${item.id}`)}
              >
                {item.imagenUrl ? (
                  <Image source={{ uri: item.imagenUrl }} style={styles.itemImg} />
                ) : (
                  <View style={[styles.itemImg, styles.itemImgPlaceholder]}>
                    <Text style={styles.itemImgPlaceholderText}>🍽</Text>
                  </View>
                )}
                <View style={styles.itemInfo}>
                  <Text style={styles.itemNombre}>{item.nombre}</Text>
                  {item.descripcion ? <Text style={styles.itemDesc} numberOfLines={2}>{item.descripcion}</Text> : null}
                  <View style={styles.itemFooter}>
                    <Text style={styles.itemPrecio}>${Number(item.precioBase).toFixed(2)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        {categoriasFiltradas.length === 0 && (
          <Text style={styles.empty}>No hay ítems que coincidan con la búsqueda.</Text>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FFFFFF' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    gap: 12,
  },
  backBtn: { padding: 4 },
  backText: { color: '#D4621A', fontSize: 15 },
  cartBtn: { padding: 4, position: 'relative' },
  cartIcon: { fontSize: 22 },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#D4621A',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  title: { fontSize: 17, fontWeight: '700', color: '#1A1A1A', flex: 1 },
  searchContainer: { paddingHorizontal: 16, paddingVertical: 8 },
  searchInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1A1A1A',
    backgroundColor: '#F9F9F9',
  },
  tabBar: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    paddingHorizontal: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#D4621A' },
  tabText: { fontSize: 14, color: '#888888', fontWeight: '500' },
  tabTextActive: { color: '#D4621A', fontWeight: '700' },
  itemsContainer: { padding: 16, gap: 8 },
  subcat: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    marginBottom: 8,
    overflow: 'hidden',
  },
  itemImg: { width: 88, height: 88 },
  itemImgPlaceholder: {
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemImgPlaceholderText: { fontSize: 28 },
  itemInfo: { flex: 1, padding: 12, gap: 4 },
  itemNombre: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  itemDesc: { fontSize: 12, color: '#888888', lineHeight: 17 },
  itemFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  itemPrecio: { fontSize: 15, fontWeight: '700', color: '#D4621A' },
  itemTiempo: { fontSize: 12, color: '#AAAAAA' },
  hint: { fontSize: 15, color: '#888888' },
  error: { fontSize: 14, color: '#C62828', textAlign: 'center' },
  link: { fontSize: 14, color: '#D4621A', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#AAAAAA', marginTop: 40, fontSize: 14 },
})
