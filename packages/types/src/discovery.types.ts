// Discovery: lo que devuelve la API pública para listar restaurantes, ofertas y buscar.
// Son datos públicos y anónimos: nunca llevan sesión, mesas, PINs ni nada de pagos.

/** Marca de un restaurante (solo lo que se muestra). */
export interface DiscoveryMarca {
  id: string
  nombre: string
}

/** Restaurante del listado y de la búsqueda de Discovery. */
export interface DiscoveryRestaurante {
  id: string
  nombre: string
  /** Puede faltar: hay restaurantes viejos sin dirección cargada. */
  direccion: string | null
  /** Logo del restaurante o, si no tiene, el de su marca. Es null si ninguno de los dos tiene. */
  logoUrl: string | null
  marca: DiscoveryMarca
  /** Cantidad de platos disponibles con descuento. */
  cantidadOfertas: number
}

/** Plato disponible en descuento, con el restaurante al que pertenece. */
export interface DiscoveryOferta {
  id: string
  nombre: string
  imagenUrl: string | null
  precioBase: number
  /** Precio con descuento en pesos enteros. */
  precioDescuento: number
  /** Porcentaje entero de 1 a 99, calculado por el backend. */
  porcentajeDescuento: number
  /** Lo que se cobra por el plato sin extras (igual a `precioDescuento`). */
  precioVigente: number
  restaurante: { id: string; nombre: string }
}

/** `GET /discovery`: hasta 50 restaurantes (por nombre) y hasta 30 ofertas (por porcentaje mayor). */
export interface DiscoveryResponse {
  restaurantes: DiscoveryRestaurante[]
  ofertas: DiscoveryOferta[]
}

/**
 * `GET /discovery/restaurantes/:id`: un restaurante activo (de una marca activa) con sus ofertas, hasta 30 y por
 * porcentaje mayor. Es lo que necesita la pantalla del restaurante cuando se entra por un link o se recarga.
 */
export interface DiscoveryRestauranteDetalle {
  restaurante: DiscoveryRestaurante
  ofertas: DiscoveryOferta[]
}

/**
 * `GET /discovery/buscar?q=`: ignora mayúsculas y acentos, pide al menos 2 caracteres. Los grupos van en el orden en
 * que se muestran: primero las ofertas que coinciden, después los restaurantes que coinciden por nombre y al final los
 * que tienen platos que coinciden.
 * Un restaurante aparece en un solo grupo: `restaurantes` si coincide su nombre o el de su marca, si no,
 * `restaurantesConPlatos` cuando tiene algún plato disponible que coincide. En los dos grupos tiene la misma forma que
 * en el listado: no se informa qué platos coincidieron ni cuántos.
 */
export interface DiscoveryBusquedaResponse {
  ofertas: DiscoveryOferta[]
  restaurantes: DiscoveryRestaurante[]
  restaurantesConPlatos: DiscoveryRestaurante[]
}
