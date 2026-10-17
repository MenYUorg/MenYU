import { Controller, Get } from '@nestjs/common'
import { HealthResponse, HealthService } from './health.service'

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  // Siempre 200, también con la base caída ("degraded"): si el servicio de Railway tiene un
  // healthcheck en /health, un 503 haría fallar el deploy. El smoke de staging lee el JSON.
  @Get()
  check(): Promise<HealthResponse> {
    return this.health.check()
  }
}
