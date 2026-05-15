import { create } from 'zustand'
import { api } from '../services/api'
import type { ItemMenu, CategoriaMenu, Ingrediente, ClasificacionDieta } from '@menyu/types'
import type { CreateItemInput, UpdateItemInput } from '../services/api'

interface MenuStore {
  items: ItemMenu[]
  categorias: CategoriaMenu[]
  ingredientes: Ingrediente[]
  clasificaciones: ClasificacionDieta[]
  loading: boolean
  error: string | null

  fetchItems: (marcaId: string) => Promise<void>
  fetchCategorias: (restauranteId: string) => Promise<void>
  fetchIngredientes: (restauranteId: string) => Promise<void>
  fetchClasificaciones: (restauranteId: string) => Promise<void>

  createItem: (data: CreateItemInput) => Promise<void>
  updateItem: (id: string, data: UpdateItemInput) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  uploadItemImage: (id: string, file: File) => Promise<void>
  deleteItemImage: (id: string) => Promise<void>

  createCategoria: (data: { nombre: string; restauranteId: string }) => Promise<void>
  updateCategoria: (id: string, data: { nombre: string }) => Promise<void>
  deleteCategoria: (id: string) => Promise<void>
  createSubcategoria: (categoriaId: string, data: { nombre: string }) => Promise<void>
  updateSubcategoria: (id: string, data: { nombre: string }) => Promise<void>
  deleteSubcategoria: (id: string) => Promise<void>

  createIngrediente: (data: { nombre: string; restauranteId: string; esAlergeno?: boolean }) => Promise<void>
  updateIngrediente: (id: string, data: { nombre?: string; esAlergeno?: boolean }) => Promise<void>
  deleteIngrediente: (id: string) => Promise<void>

  createClasificacion: (nombre: string) => Promise<void>
  updateClasificacion: (id: string, nombre: string) => Promise<void>
  deleteClasificacion: (id: string) => Promise<void>

  clearError: () => void
}

export const useMenuStore = create<MenuStore>()((set) => ({
  items: [],
  categorias: [],
  ingredientes: [],
  clasificaciones: [],
  loading: false,
  error: null,

  fetchItems: async (marcaId) => {
    set({ loading: true, error: null })
    try { set({ items: await api.items.list(marcaId) }) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error al cargar ítems' }) }
    finally { set({ loading: false }) }
  },

  fetchCategorias: async (restauranteId) => {
    set({ loading: true, error: null })
    try { set({ categorias: await api.categorias.list(restauranteId) }) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error al cargar categorías' }) }
    finally { set({ loading: false }) }
  },

  fetchIngredientes: async (restauranteId) => {
    set({ loading: true, error: null })
    try { set({ ingredientes: await api.ingredientes.list(restauranteId) }) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error al cargar ingredientes' }) }
    finally { set({ loading: false }) }
  },

  fetchClasificaciones: async (restauranteId) => {
    set({ loading: true, error: null })
    try { set({ clasificaciones: await api.clasificaciones.list(restauranteId) }) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error al cargar clasificaciones' }) }
    finally { set({ loading: false }) }
  },

  createItem: async (data) => {
    set({ loading: true, error: null })
    try { const item = await api.items.create(data); set((s) => ({ items: [...s.items, item] })) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error al crear ítem' }); throw e }
    finally { set({ loading: false }) }
  },

  updateItem: async (id, data) => {
    set({ loading: true, error: null })
    try { const u = await api.items.update(id, data); set((s) => ({ items: s.items.map((i) => (i.id === id ? u : i)) })) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error al actualizar ítem' }); throw e }
    finally { set({ loading: false }) }
  },

  deleteItem: async (id) => {
    set({ loading: true, error: null })
    try { await api.items.delete(id); set((s) => ({ items: s.items.filter((i) => i.id !== id) })) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error al eliminar ítem' }); throw e }
    finally { set({ loading: false }) }
  },

  uploadItemImage: async (id, file) => {
    set({ loading: true, error: null })
    try { const u = await api.items.uploadImage(id, file); set((s) => ({ items: s.items.map((i) => (i.id === id ? u : i)) })) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error al subir imagen' }); throw e }
    finally { set({ loading: false }) }
  },

  deleteItemImage: async (id) => {
    set({ loading: true, error: null })
    try { const u = await api.items.deleteImage(id); set((s) => ({ items: s.items.map((i) => (i.id === id ? u : i)) })) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error al quitar imagen' }); throw e }
    finally { set({ loading: false }) }
  },

  createCategoria: async (data) => {
    set({ loading: true, error: null })
    try { const cat = await api.categorias.create(data); set((s) => ({ categorias: [...s.categorias, cat] })) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error al crear categoría' }); throw e }
    finally { set({ loading: false }) }
  },

  updateCategoria: async (id, data) => {
    set({ loading: true, error: null })
    try { const u = await api.categorias.update(id, data); set((s) => ({ categorias: s.categorias.map((c) => (c.id === id ? u : c)) })) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error al actualizar categoría' }); throw e }
    finally { set({ loading: false }) }
  },

  deleteCategoria: async (id) => {
    set({ loading: true, error: null })
    try { await api.categorias.delete(id); set((s) => ({ categorias: s.categorias.filter((c) => c.id !== id) })) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error al eliminar categoría' }); throw e }
    finally { set({ loading: false }) }
  },

  createSubcategoria: async (categoriaId, data) => {
    set({ loading: true, error: null })
    try {
      const sub = await api.categorias.createSub(categoriaId, data)
      set((s) => ({ categorias: s.categorias.map((c) => c.id === categoriaId ? { ...c, subcategorias: [...(c.subcategorias ?? []), sub] } : c) }))
    } catch (e) { set({ error: e instanceof Error ? e.message : 'Error al crear subcategoría' }); throw e }
    finally { set({ loading: false }) }
  },

  updateSubcategoria: async (id, data) => {
    set({ loading: true, error: null })
    try {
      const u = await api.categorias.updateSub(id, data)
      set((s) => ({ categorias: s.categorias.map((c) => ({ ...c, subcategorias: c.subcategorias?.map((sub) => (sub.id === id ? u : sub)) })) }))
    } catch (e) { set({ error: e instanceof Error ? e.message : 'Error al actualizar subcategoría' }); throw e }
    finally { set({ loading: false }) }
  },

  deleteSubcategoria: async (id) => {
    set({ loading: true, error: null })
    try {
      await api.categorias.deleteSub(id)
      set((s) => ({ categorias: s.categorias.map((c) => ({ ...c, subcategorias: c.subcategorias?.filter((sub) => sub.id !== id) })) }))
    } catch (e) { set({ error: e instanceof Error ? e.message : 'Error al eliminar subcategoría' }); throw e }
    finally { set({ loading: false }) }
  },

  createIngrediente: async (data) => {
    set({ loading: true, error: null })
    try { const ing = await api.ingredientes.create(data); set((s) => ({ ingredientes: [...s.ingredientes, ing] })) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error al crear ingrediente' }); throw e }
    finally { set({ loading: false }) }
  },

  updateIngrediente: async (id, data) => {
    set({ loading: true, error: null })
    try { const u = await api.ingredientes.update(id, data); set((s) => ({ ingredientes: s.ingredientes.map((i) => (i.id === id ? u : i)) })) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error al actualizar ingrediente' }); throw e }
    finally { set({ loading: false }) }
  },

  deleteIngrediente: async (id) => {
    set({ loading: true, error: null })
    try { await api.ingredientes.delete(id); set((s) => ({ ingredientes: s.ingredientes.filter((i) => i.id !== id) })) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error al eliminar ingrediente' }); throw e }
    finally { set({ loading: false }) }
  },

  createClasificacion: async (nombre) => {
    set({ loading: true, error: null })
    try {
      const c = await api.clasificaciones.create({ nombre })
      set((s) => ({ clasificaciones: [...s.clasificaciones, c].sort((a, b) => a.nombre.localeCompare(b.nombre)) }))
    } catch (e) { set({ error: e instanceof Error ? e.message : 'Error al crear clasificación' }); throw e }
    finally { set({ loading: false }) }
  },

  updateClasificacion: async (id, nombre) => {
    set({ loading: true, error: null })
    try {
      const u = await api.clasificaciones.update(id, { nombre })
      set((s) => ({ clasificaciones: s.clasificaciones.map((c) => (c.id === id ? u : c)).sort((a, b) => a.nombre.localeCompare(b.nombre)) }))
    } catch (e) { set({ error: e instanceof Error ? e.message : 'Error al actualizar clasificación' }); throw e }
    finally { set({ loading: false }) }
  },

  deleteClasificacion: async (id) => {
    set({ loading: true, error: null })
    try { await api.clasificaciones.delete(id); set((s) => ({ clasificaciones: s.clasificaciones.filter((c) => c.id !== id) })) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error al eliminar clasificación' }); throw e }
    finally { set({ loading: false }) }
  },

  clearError: () => set({ error: null }),
}))
