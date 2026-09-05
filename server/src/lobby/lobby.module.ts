import { Module } from '@nestjs/common'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { AuthModule } from '../auth/auth.module'
import { StoresModule } from '../stores/stores.module'
import { InternalLobbyController } from './internal-lobby.controller'
import { LobbyController } from './lobby.controller'
import { LobbyEventStreamService } from './lobby-event-stream.service'
import { GAME_SERVER_CLIENT } from './lobby.interfaces'
import { LobbyService } from './lobby.service'
import {
  GAME_TCP_CLIENT,
  NestTcpGameServerClient,
} from './nest-tcp-game-server.client'

const gameServerPort = Number(process.env.GAME_SERVER_TCP_PORT ?? 4001)

@Module({
  imports: [
    AuthModule,
    StoresModule,
    ClientsModule.register([
      {
        name: GAME_TCP_CLIENT,
        transport: Transport.TCP,
        options: {
          host: process.env.GAME_SERVER_TCP_HOST ?? '127.0.0.1',
          port: gameServerPort,
        },
      },
    ]),
  ],
  controllers: [LobbyController, InternalLobbyController],
  providers: [
    LobbyService,
    LobbyEventStreamService,
    NestTcpGameServerClient,
    {
      provide: GAME_SERVER_CLIENT,
      useExisting: NestTcpGameServerClient,
    },
  ],
  exports: [LobbyService],
})
export class LobbyModule {}
