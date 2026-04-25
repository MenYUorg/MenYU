import 'reflect-metadata'
import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.enableCors({
    origin: ['http://localhost:8081', 'http://localhost:19006'],
    credentials: true,
  })
  app.setGlobalPrefix('api')
  await app.listen(process.env.PORT ?? 3000)
}

bootstrap()
