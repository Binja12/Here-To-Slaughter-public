import { NestFactory } from '@nestjs/core'
import { Transport } from '@nestjs/microservices'
import type { MicroserviceOptions } from '@nestjs/microservices'
import { ExpressAdapter } from '@nestjs/platform-express'
import {
  gameServerConfig,
  gameServerCors,
} from './game-server/game-server.config'
import { GameServerModule } from './game-server/game-server.module'

// The game-server process. `main.ts` is the lobby/auth process; the two are
// one codebase started twice. Two listeners, never shared: the TCP port is a
// trust boundary only the lobby speaks to (`game.create`), and the HTTP port
// carries Socket.IO for browsers. Nest mounts a gateway on the HTTP server
// through its default IoAdapter, which is why this is a full application
// rather than the bare microservice it started as.

async function bootstrap() {
  const app = await NestFactory.create(GameServerModule, new ExpressAdapter())

  // A browser reaches this process from the client's origin, not the lobby's,
  // and the session cookie only comes along when that origin is allowed with
  // credentials. The gateway declares the same options for the handshake.
  app.enableCors(gameServerCors)

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: { host: gameServerConfig.tcpHost, port: gameServerConfig.tcpPort },
  })
  await app.startAllMicroservices()
  await app.listen(gameServerConfig.httpPort)
}
void bootstrap()
