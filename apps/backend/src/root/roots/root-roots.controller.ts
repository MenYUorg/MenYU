import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { RequiereRoot } from '../../auth/decorators/requiere-root.decorator'
import { UsuarioActual } from '../../auth/decorators/usuario-actual.decorator'
import { UsuarioAutenticado } from '../../auth/supabase/usuario-autenticado'
import { InvitarCuentaDto } from '../comun/dto/invitar-cuenta.dto'
import { RootRootsService } from './root-roots.service'

/**
 * Cuentas ROOT. Solo ROOT. A propósito NO hay `DELETE` ni `PATCH /root/roots/:id`: las cuentas ROOT no se borran ni dejan de
 * ser ROOT desde la app ni la API (decisión 15 de docs/plan-consola-root.md). Un test recorre el enrutador y falla si aparece
 * una ruta para eso. Tampoco hay "restablecer la contraseña": la persona la cambia desde "Olvidé mi contraseña" de web-auth.
 */
@ApiTags('root')
@Controller('root/roots')
@RequiereRoot()
export class RootRootsController {
  constructor(private readonly roots: RootRootsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista las cuentas ROOT (marca cuál es la propia)' })
  @ApiResponse({ status: 200 })
  listar(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.roots.listar(usuario)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Invita a una persona nueva como cuenta ROOT',
    description:
      'Manda el mail de invitación de Supabase (si el email ya tenía una cuenta confirmada en Supabase, la usa sin mandar mail: `invitacionEnviada` es false). Un email que ya es de una cuenta de MenYU responde 409: para hacerla ROOT está el script de cuentas ROOT. Queda en el historial (ROOT_INVITAR).',
  })
  @ApiResponse({ status: 201, description: '{ usuarioId, email, invitacionEnviada }' })
  @ApiResponse({ status: 400, description: 'Email o nombre inválidos' })
  @ApiResponse({ status: 409, description: 'El email ya es de una cuenta de MenYU' })
  @ApiResponse({ status: 502, description: 'Supabase rechazó la invitación' })
  invitar(@Body() dto: InvitarCuentaDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.roots.invitar(dto, usuario)
  }
}
