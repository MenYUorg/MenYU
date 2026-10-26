import { applyDecorators, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { RootGuard } from '../guards/root.guard'
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard'

/** Exige el token de Supabase de una cuenta ROOT. Para la consola (`/root/*`), a nivel de controller. */
export const RequiereRoot = () =>
  applyDecorators(
    UseGuards(SupabaseAuthGuard, RootGuard),
    ApiBearerAuth('supabase'),
    ApiUnauthorizedResponse({ description: 'Sin token de Supabase, o token inválido o vencido' }),
    ApiForbiddenResponse({ description: 'Sin acceso a MenYU o la cuenta no es ROOT' }),
  )
