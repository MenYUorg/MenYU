import 'reflect-metadata'
import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe, RequestMethod } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'

const CORS_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:4173',
]

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) ?? CORS_ORIGINS
  const originPatterns = (process.env.CORS_ORIGIN_PATTERNS ?? '')
    .split(',')
    .filter(Boolean)
    .map(p => new RegExp(p.trim()))

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || origin.startsWith('http://localhost:')) {
        return callback(null, true)
      }
      const allowed =
        allowedOrigins.includes(origin) ||
        originPatterns.some(re => re.test(origin))
      callback(null, allowed)
    },
    credentials: true,
  })
  app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

  const config = new DocumentBuilder()
    .setTitle('MenYu API')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('docs', app, document)

  await app.listen(process.env.PORT ?? 3000)
}

bootstrap()
