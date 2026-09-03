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

  // A local client runs on its own port (its dev server), and a browser will
  // not let a page on one port call a server on another unless that server
  // says so, by name and with credentials — `*` would strip the session
  // cookie. Reflecting the asking origin is right for a local table; the
  // game server does the same (game-server.config.ts). Production routing
  // is deferred with Docker (contract §10).
  app.enableCors({ origin: true, credentials: true })

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
