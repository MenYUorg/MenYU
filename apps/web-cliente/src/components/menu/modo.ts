/**
 * Cómo se muestra el menú: `mesa` es el de una sesión de mesa (se pide, se llama al mozo, hay carrito y detalle de los
 * platos); `carta` es la carta en modo vista de `/restaurante/:id/carta` (solo se mira, sin sesión).
 */
export type ModoMenu = 'mesa' | 'carta'
