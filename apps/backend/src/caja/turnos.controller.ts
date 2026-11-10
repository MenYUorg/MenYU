import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { RequiereRolEn } from '../auth/decorators/requiere-rol.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { CAJA } from '../auth/roles-del-personal'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { AperturaService } from './apertura.service'
import { AbrirTurnoDto } from './dto/abrir-turno.dto'

// Los turnos los abren y los consultan OWNER, GERENTE y JEFE_SALON (el grupo CAJA) del restaurante. Quién abre sale de
// la cuenta, nunca del body.
@ApiTags('turnos')
@Controller('turnos')
export class TurnosController {
  constructor(private readonly apertura: AperturaService) {}

  @Post()
  @RequiereRolEn({ body: 'restauranteId' }, ...CAJA)
  @ApiOperation({ summary: 'Abrir un turno con 1 o 2 cajas y las mesas asignadas a cada mozo' })
  @ApiResponse({ status: 201, description: 'El turno abierto y los avisos de la precarga de asignaciones' })
  @ApiResponse({ status: 400, description: 'Cajas, mesas o mozos que no son del restaurante, inactivos o sin cuenta' })
  @ApiResponse({ status: 409, description: 'Ya hay un turno abierto, la caja ya está abierta o una operación simultánea' })
  abrir(@Body() dto: AbrirTurnoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.apertura.abrir(dto, usuario)
  }

  @Get('actual')
  @RequiereRolEn({ query: 'restauranteId' }, ...CAJA)
  @ApiOperation({ summary: 'El turno abierto del restaurante, o null' })
  @ApiResponse({ status: 200 })
  actual(@Query('restauranteId') restauranteId: string) {
    return this.apertura.actual(restauranteId)
  }
}
