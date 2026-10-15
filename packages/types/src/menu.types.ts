export interface ClasificacionDieta {
  id: string
  nombre: string
}

export interface Marca {
  id: string
  nombre: string
  slug: string
  logoUrl: string | null
  activo: boolean
  createdAt: string
}

export interface Restaurante {
  id: string
  marcaId: string
  nombre: string
  direccion: string | null
  logoUrl: string | null
  modoSesion: string
  activo: boolean
  createdAt: string
  nombreSeccionRecomendados: string
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
  precioDescuento: number | null
  porcentajeDescuento: number | null
  precioVigente: number
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
  /** Precio con descuento en pesos enteros, o null si el ítem no está en descuento. */
  precioDescuento: number | null
  /** Porcentaje entero de 1 a 99 calculado por el backend, o null si no hay descuento. */
  porcentajeDescuento: number | null
  /** Lo que se cobra por el ítem sin extras: precioDescuento si lo tiene, si no precioBase. */
  precioVigente: number
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
  restaurante: {
    id: string
    nombre: string
    nombreSeccionRecomendados: string
    direccion: string | null
    /** El logo propio del restaurante o, si no tiene, el de su marca; `null` si ninguno tiene (la app muestra el de MenYU). */
    logoUrl: string | null
  }
  categorias: MenuPublicoCategoria[]
  recomendados: MenuPublicoItem[]
  descuentos: MenuPublicoItem[]
}
