import { Global, Module } from '@nestjs/common'
import { MembresiaGuard } from '../guards/membresia.guard'
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard'
import { AccesoService } from './acceso.service'
import { SupabaseAdminService } from './supabase-admin.service'
import { crearJwksDeSupabase, JWKS_SUPABASE, VerificadorTokenSupabase } from './verificador-token.service'

/**
 * Autenticación con Supabase y autorización por membresía (docs/auth/specs/auth.md). Global, como
 * PrismaModule: cualquier controller puede usar `@RequiereRol` o SupabaseAuthGuard sin importarlo.
 */
@Global()
@Module({
  providers: [
    { provide: JWKS_SUPABASE, useFactory: crearJwksDeSupabase },
    VerificadorTokenSupabase,
    AccesoService,
    SupabaseAdminService,
    SupabaseAuthGuard,
    MembresiaGuard,
  ],
  exports: [VerificadorTokenSupabase, AccesoService, SupabaseAdminService, SupabaseAuthGuard, MembresiaGuard],
})
export class SupabaseAuthModule {}
