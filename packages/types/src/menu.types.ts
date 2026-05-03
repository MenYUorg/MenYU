export interface Marca {
  id: string
  nombre: string
  slug: string
}

export interface Restaurante {
  id: string
  nombre: string
  marcaId: string
}

export interface CategoriaMenu {
  id: string
  restauranteId: string
  nombre: string
  orden: number
  subcategorias?: SubcategoriaMenu[]
}

export interface SubcategoriaMenu {
  id: string
  categoriaId: string
  nombre: string
  orden: number
}

export interface Ingrediente {
  id: string
  restauranteId: string
  nombre: string
}

export interface ItemIngrediente {
  id: string
  itemId: string
  ingredienteId: string
  esOriginal: boolean
  cantidad: number
  removible: boolean
  ingrediente?: Ingrediente
}

export interface ItemMenu {
  id: string
  marcaId: string
  subcategoriaId: string | null
  comandaId: string | null
  nombre: string
  descripcion: string | null
  precioBase: number
  disponible: boolean
  imagenUrl: string | null
  subcategoria?: {
    id: string
    nombre: string
    categoriaId: string
    orden?: number
    categoria?: CategoriaMenu
  }
  ingredientes?: ItemIngrediente[]
}
