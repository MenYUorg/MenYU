import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { SessionsService } from './sessions.service'
import { OpenSessionDto } from './dto/open-session.dto'

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post('open')
  @HttpCode(HttpStatus.OK)
  open(
    @Body() dto: OpenSessionDto,
    @Headers('authorization') authHeader: string | undefined,
  ) {
    return this.sessions.open(dto, authHeader)
  }
}
