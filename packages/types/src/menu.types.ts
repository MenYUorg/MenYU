export interface ClasificacionDieta {
  id: string
  nombre: string
}

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
  marca?: Marca | null
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
}

export interface Ingrediente {
  id: string
  restauranteId: string
  nombre: string
  esAlergeno: boolean
}

export interface ItemIngrediente {
  id: string
  itemId: string
  ingredienteId: string
  esOriginal: boolean
  cantidad: number
  esRemovible: boolean
  esAgregable: boolean
  precioExtra: number
  cantidadMin: number
  cantidadMax: number
  ingrediente?: Ingrediente
}

export interface ItemMenu {
  id: string
  restauranteId: string
  categoriaId: string | null
  comandaId: string | null
  nombre: string
  descripcion: string | null
  precioBase: number
  disponible: boolean
  esRecomendado?: boolean
  imagenUrl: string | null
  ingredientes?: ItemIngrediente[]
  clasificaciones?: { clasificacionId: string; clasificacion: ClasificacionDieta }[]
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

export interface MenuPublicoItem {
  id: string
  nombre: string
  descripcion: string | null
  precioBase: number
  imagenUrl: string | null
  ingredientes: ItemIngrediente[]
  clasificaciones: ClasificacionDieta[]
  esRecomendado?: boolean
}

export interface MenuPublicoCategoria {
  id: string
  nombre: string
  orden: number
  itemsDirectos: MenuPublicoItem[]
}

export interface MenuPublico {
  restaurante: { id: string; nombre: string; nombreSeccionRecomendados: string }
  categorias: MenuPublicoCategoria[]
  recomendados: MenuPublicoItem[]
}
