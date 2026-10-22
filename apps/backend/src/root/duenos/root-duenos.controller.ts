import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { RequiereRoot } from '../../auth/decorators/requiere-root.decorator'
import { UsuarioActual } from '../../auth/decorators/usuario-actual.decorator'
import { UsuarioAutenticado } from '../../auth/supabase/usuario-autenticado'
import { IdPipe } from '../comun/cuentas'
import { InvitarCuentaDto } from '../comun/dto/invitar-cuenta.dto'
import { ListarDuenosDto } from './dto/listar-duenos.dto'
import { RootDuenosService } from './root-duenos.service'

/**
 * Los dueños (membresías OWNER) de las marcas. Solo ROOT. Invitar y quitar quedan en el historial dentro de la misma
 * transacción. No hay rutas para cambiar el email ni la contraseña de un dueño: son de la persona (web-auth).
 */
@ApiTags('root')
@Controller('root')
@RequiereRoot()
export class RootDuenosController {
  constructor(private readonly duenos: RootDuenosService) {}

  @Get('duenos')
  @ApiOperation({ summary: 'Lista los dueños (membresías OWNER) con su cuenta y su marca (q busca por email o nombre de la marca)' })
  @ApiResponse({ status: 200 })
  listar(@Query() dto: ListarDuenosDto) {
    return this.duenos.listar(dto)
  }

  @Post('marcas/:id/duenos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Invita a un dueño (OWNER) a una marca',
    description:
      'Manda el mail de invitación de Supabase. Si el email ya tiene cuenta (el dueño de otra marca, alguien del personal o un cliente registrado), le suma la membresía sin mandar mail: `invitacionEnviada` es false. Queda en el historial (DUENO_INVITAR).',
  })
  @ApiResponse({ status: 201, description: '{ usuarioId, membresiaId, invitacionEnviada }' })
  @ApiResponse({ status: 400, description: 'Email o nombre inválidos' })
  @ApiResponse({ status: 403, description: 'El email es el de la propia cuenta' })
  @ApiResponse({ status: 404, description: 'La marca no existe' })
  @ApiResponse({ status: 409, description: 'La marca está dada de baja, ya es dueño de esa marca o su cuenta está desactivada' })
  @ApiResponse({ status: 502, description: 'Supabase rechazó la invitación' })
  invitar(@Param('id', new IdPipe('Marca no encontrada')) marcaId: string, @Body() dto: InvitarCuentaDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.duenos.invitar(marcaId, dto, usuario)
  }

  @Delete('duenos/:membresiaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Quita a un dueño de su marca (no al último de una marca activa)',
    description: 'Borra la membresía OWNER; la cuenta queda. Queda en el historial (DUENO_QUITAR).',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'No hay una membresía OWNER con ese id' })
  @ApiResponse({ status: 409, description: 'Es el único dueño de una marca activa' })
  async quitar(@Param('membresiaId', new IdPipe('Dueño no encontrado')) membresiaId: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    await this.duenos.quitar(membresiaId, usuario)
  }
}
