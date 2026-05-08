export interface Marca {
  id: string
  nombre: string
  slug: string
  activo: boolean
  createdAt: string
}

export interface Restaurante {
  id: string
  marcaId: string
  nombre: string
  direccion: string | null
  qrBaseUrl: string | null
  modoSesion: string
  activo: boolean
  createdAt: string
}

export interface Comanda {
  id: string
  restauranteId: string
  nombre: string
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

export interface ItemSucursal {
  itemId: string
  restauranteId: string
  disponible: boolean
  precioOverride: number | null
  item?: ItemMenu
}

export interface Menu {
  id: string
  restauranteId: string
  nombre: string
  dias: string | null
  horaInicio: string | null
  horaFin: string | null
  temporada: string | null
}

export interface MenuItem {
  menuId: string
  itemId: string
}

export interface ClasificacionDieta {
  id: string
  nombre: string
}
