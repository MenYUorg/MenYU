import { applyDecorators, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard'

/**
 * Exige el token de Supabase y un `Usuario` activo, nada más. Es para las rutas de un recurso
 * (`/items/:id`): el service resuelve el restaurante y llama a `AccesoService.exigirRol`. Sin esa
 * llamada, la ruta queda abierta a cualquier persona del personal (y a ROOT).
 */
export const Personal = () =>
  applyDecorators(
    UseGuards(SupabaseAuthGuard),
    ApiBearerAuth('supabase'),
    ApiUnauthorizedResponse({ description: 'Sin token de Supabase, o token inválido o vencido' }),
    ApiForbiddenResponse({ description: 'Sin acceso a MenYU o sin el rol en el restaurante del recurso' }),
  )
