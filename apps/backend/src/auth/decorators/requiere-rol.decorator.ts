import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { Rol } from '@prisma/client'
import { MembresiaGuard, ROLES_MEMBRESIA_KEY } from '../guards/membresia.guard'
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard'

/**
 * Exige el token de Supabase y alguno de estos roles en el restaurante de `:restauranteId`. Incluye
 * los dos guards, así no se puede olvidar la autenticación.
 */
export const RequiereRol = (...roles: Rol[]) =>
  applyDecorators(
    SetMetadata(ROLES_MEMBRESIA_KEY, roles),
    UseGuards(SupabaseAuthGuard, MembresiaGuard),
    ApiBearerAuth('supabase'),
    ApiUnauthorizedResponse({ description: 'Sin token de Supabase, o token inválido o vencido' }),
    ApiForbiddenResponse({ description: 'Sin acceso a MenYU o sin el rol en el restaurante' }),
  )
