import { Module } from '@nestjs/common'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { CommandDispatcherService } from './command-dispatcher.service'
import { GameGateway } from './game.gateway'
import { GameRegistryService } from './game-registry.service'
import { gameServerConfig } from './game-server.config'
import {
  GAME_SERVER_PUBLIC_URL,
  InternalGameController,
} from './internal-game.controller'
import { GAME_SESSION_RESOLVER } from './session/game-session.resolver'
import {
  LOBBY_TCP_CLIENT,
  TcpSessionResolver,
} from './session/tcp-session.resolver'
import { SnapshotPublisherService } from './snapshot-publisher.service'

@Module({
  imports: [
    // Dialled lazily, on the first resolve — the lobby need not be up for
    // this module to boot, only for a browser to be seated.
    ClientsModule.register([
      {
        name: LOBBY_TCP_CLIENT,
        transport: Transport.TCP,
        options: {
          host: gameServerConfig.lobbyTcpHost,
          port: gameServerConfig.lobbyTcpPort,
        },
      },
    ]),
  ],
  controllers: [InternalGameController],
  providers: [
    GameRegistryService,
    CommandDispatcherService,
    SnapshotPublisherService,
    GameGateway,
    TcpSessionResolver,
    {
      provide: GAME_SESSION_RESOLVER,
      useExisting: TcpSessionResolver,
    },
    {
      provide: GAME_SERVER_PUBLIC_URL,
      useValue: gameServerConfig.publicUrl,
    },
  ],
})
export class GameServerModule {}
