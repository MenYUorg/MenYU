import { ApiProperty } from '@nestjs/swagger'
import { AsignacionDeMesaDto, ListaDeAsignaciones, MAX_ASIGNACIONES_POR_TURNO } from './abrir-turno.dto'

/** La lista completa de asignaciones del turno: reemplaza la anterior. Es obligatoria; con [], el turno queda sin ninguna. */
export class ReasignarMesasDto {
  @ApiProperty({ type: [AsignacionDeMesaDto], maxItems: MAX_ASIGNACIONES_POR_TURNO })
  @ListaDeAsignaciones()
  asignaciones!: AsignacionDeMesaDto[]
}
