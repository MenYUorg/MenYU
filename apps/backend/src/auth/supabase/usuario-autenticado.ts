import { Request } from 'express'

/** Lo que deja SupabaseAuthGuard en `request.usuario`. Sale de nuestra base, no del token. */
export interface UsuarioAutenticado {
  id: string
  supabaseUserId: string
  email: string
  nombre: string
  esRoot: boolean
}

export interface RequestConUsuario extends Request {
  usuario: UsuarioAutenticado
}
