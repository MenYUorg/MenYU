import 'reflect-metadata'
import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe, RequestMethod } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { isAllowedOrigin } from './common/is-allowed-origin'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      callback(null, isAllowedOrigin(origin))
    },
    credentials: true,
  })
  app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

  const config = new DocumentBuilder()
    .setTitle('MenYu API')
    .setVersion('1.0')
    // Access token de Supabase (docs/auth/specs/auth.md): el único esquema desde la Fase 5.
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Access token de Supabase' },
      'supabase',
    )
    .build()
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('docs', app, document)

  await app.listen(process.env.PORT ?? 3000)
}

bootstrap()
