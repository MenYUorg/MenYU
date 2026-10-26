import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { Rol } from '@prisma/client'
import {
  MembresiaGuard,
  ORIGEN_RESTAURANTE_KEY,
  OrigenDelRestaurante,
  ROLES_MEMBRESIA_KEY,
} from '../guards/membresia.guard'
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard'

/**
 * Exige el token de Supabase y alguno de estos roles en el restaurante de `:restauranteId`. Incluye
 * los dos guards, así no se puede olvidar la autenticación.
 */
export const RequiereRol = (...roles: Rol[]) => RequiereRolEn({ param: 'restauranteId' }, ...roles)

/**
 * Como `@RequiereRol`, con el restaurante en otro lugar: `{ param: 'id' }`, `{ query: 'restauranteId' }`
 * o `{ body: 'restauranteId' }`. Sin el id en la query o el body, 400.
 */
export const RequiereRolEn = (origen: OrigenDelRestaurante, ...roles: Rol[]) =>
  applyDecorators(
    SetMetadata(ROLES_MEMBRESIA_KEY, roles),
    SetMetadata(ORIGEN_RESTAURANTE_KEY, origen),
    UseGuards(SupabaseAuthGuard, MembresiaGuard),
    ApiBearerAuth('supabase'),
    ...('param' in origen ? [] : [ApiBadRequestResponse({ description: 'Falta el id del restaurante' })]),
    ApiUnauthorizedResponse({ description: 'Sin token de Supabase, o token inválido o vencido' }),
    ApiForbiddenResponse({ description: 'Sin acceso a MenYU o sin el rol en el restaurante' }),
  )
