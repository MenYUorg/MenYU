import { SetMetadata } from '@nestjs/common'
import { UserTipo } from '../auth.service'

export const TIPOS_KEY = 'tipos'
export const RequiresTipo = (...tipos: UserTipo[]) => SetMetadata(TIPOS_KEY, tipos)
