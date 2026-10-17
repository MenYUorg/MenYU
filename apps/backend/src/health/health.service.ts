import { Injectable } from '@nestjs/common'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PrismaService } from '../prisma/prisma.service'

/** Tiempo máximo que espera el SELECT 1 antes de dar la base por caída. */
export const DB_TIMEOUT_MS = 2000

export interface HealthResponse {
  /** "degraded" si la base no responde. El código HTTP es siempre 200 (ver health.controller.ts). */
  status: 'ok' | 'degraded'
  /** Commit desplegado: APP_COMMIT_SHA (lo setea el workflow) o RAILWAY_GIT_COMMIT_SHA (deploys desde GitHub). */
  sha: string | null
  db: 'ok' | 'error'
  /** Segundos desde que arrancó el proceso. */
  uptime: number
  version: string | null
}

/** Versión de package.json. En el contenedor y en `pnpm --filter @menyu/api` el cwd es la carpeta del backend. */
export function leerVersion(ruta = join(process.cwd(), 'package.json')): string | null {
  try {
    const pkg = JSON.parse(readFileSync(ruta, 'utf8')) as { version?: unknown }
    return typeof pkg.version === 'string' ? pkg.version : null
  } catch {
    return null
  }
}

@Injectable()
export class HealthService {
  private readonly version = leerVersion()

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    const db = (await this.pingDb()) ? 'ok' : 'error'
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      sha: process.env.APP_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || null,
      db,
      uptime: Math.floor(process.uptime()),
      version: this.version,
    }
  }

  private async pingDb(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS)
    })
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout])
      return true
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }
}
