import { vi } from 'vitest'
import type {
  RootCuentaResumen,
  RootHistorialItem,
  RootHistorialPagina,
  RootMarcaDetalle,
  RootMarcaResumen,
  RootRestaurante,
} from '@menyu/types'

/** `api` falso para las pruebas de la consola de ROOT. Se usa dentro de `vi.mock('.../services/api', ...)`. */
export const apiFalsa = {
  root: {
    marcas: {
      listar: vi.fn(),
      detalle: vi.fn(),
      crear: vi.fn(),
      editar: vi.fn(),
      baja: vi.fn(),
      reactivar: vi.fn(),
      crearRestaurante: vi.fn(),
    },
    restaurantes: { editar: vi.fn(), baja: vi.fn(), reactivar: vi.fn() },
    historial: { listar: vi.fn() },
    cuentas: { listar: vi.fn() },
  },
}

export function marcaResumen(parcial: Partial<RootMarcaResumen> = {}): RootMarcaResumen {
  return {
    id: 'marca-1',
    nombre: 'La Parrilla',
    slug: 'la-parrilla',
    activo: true,
    restaurantes: { activos: 2, total: 2 },
    duenos: 1,
    ...parcial,
  }
}

export function restaurante(parcial: Partial<RootRestaurante> = {}): RootRestaurante {
  return { id: 'rest-1', nombre: 'La Parrilla Centro', direccion: 'Av. Siempre Viva 742', activo: true, ...parcial }
}

export function marcaDetalle(parcial: Partial<RootMarcaDetalle> = {}): RootMarcaDetalle {
  return {
    id: 'marca-1',
    nombre: 'La Parrilla',
    slug: 'la-parrilla',
    activo: true,
    restaurantes: [restaurante(), restaurante({ id: 'rest-2', nombre: 'La Parrilla Norte', direccion: null })],
    duenos: [{ id: 'dueno-1', membresiaId: 'membresia-1', email: 'juan@laparrilla.com', nombre: 'Juan' }],
    ...parcial,
  }
}

export function itemDeHistorial(parcial: Partial<RootHistorialItem> = {}): RootHistorialItem {
  return {
    id: 10,
    cuando: '2026-10-15T15:30:00.000Z', // 12:30 en Buenos Aires
    actorTipo: 'ROOT',
    actorNombre: 'root@menyu.com',
    accion: 'MARCA_CREAR',
    entidadTipo: 'MARCA',
    entidadId: 'marca-1',
    entidadNombre: 'La Parrilla',
    marcaId: 'marca-1',
    marcaNombre: 'La Parrilla',
    cambios: [{ campo: 'nombre', antes: null, despues: 'La Parrilla' }],
    ...parcial,
  }
}

export function paginaDeHistorial(items: RootHistorialItem[], siguiente: number | null = null): RootHistorialPagina {
  return { items, siguiente }
}

export function cuenta(parcial: Partial<RootCuentaResumen> = {}): RootCuentaResumen {
  return { id: 'root-1', email: 'root@menyu.com', nombre: 'Root', activo: true, esPropia: true, ...parcial }
}

/** Una promesa que se resuelve o rechaza cuando el test lo decide (para probar respuestas que llegan tarde). */
export function promesaManual<T>() {
  let resolver!: (valor: T) => void
  let rechazar!: (motivo: unknown) => void
  const promesa = new Promise<T>((res, rej) => {
    resolver = res
    rechazar = rej
  })
  return { promesa, resolver, rechazar }
}
