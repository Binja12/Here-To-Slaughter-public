import { NestFactory } from '@nestjs/core'
import { Transport } from '@nestjs/microservices'
import type { MicroserviceOptions } from '@nestjs/microservices'
import { ExpressAdapter } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'

async function bootstrap() {
  // Pass the HTTP adapter directly so workspace dependency placement is explicit.
  const app = await NestFactory.create(AppModule, new ExpressAdapter())
  app.use(cookieParser())

  // The HTTP app and internal TCP listener share the same in-memory stores.
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: process.env.LOBBY_AUTH_TCP_HOST ?? '127.0.0.1',
      port: Number(process.env.LOBBY_AUTH_TCP_PORT ?? 4000),
    },
  })
  await app.startAllMicroservices()
  await app.listen(process.env.PORT ?? 3000)
}
void bootstrap()
