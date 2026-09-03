import { NestFactory } from '@nestjs/core'
import { Transport } from '@nestjs/microservices'
import type { MicroserviceOptions } from '@nestjs/microservices'
import { GameServerModule } from './game-server/game-server.module'

// The game-server process. `main.ts` is the lobby/auth process; the two are
// one codebase started twice, and the lobby's client (lobby.module.ts) dials
// the TCP port below.

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    GameServerModule,
    {
      transport: Transport.TCP,
      options: {
        host: process.env.GAME_SERVER_TCP_HOST ?? '127.0.0.1',
        port: Number(process.env.GAME_SERVER_TCP_PORT ?? 4001),
      },
    },
  )
  await app.listen()
}
void bootstrap()
