import { Module } from '@nestjs/common'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { AuthModule } from '../auth/auth.module'
import { InMemoryStoresModule } from '../stores/in-memory-stores.module'
import { LobbyController } from './lobby.controller'
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
    InMemoryStoresModule,
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
  controllers: [LobbyController],
  providers: [
    LobbyService,
    NestTcpGameServerClient,
    {
      provide: GAME_SERVER_CLIENT,
      useExisting: NestTcpGameServerClient,
    },
  ],
  exports: [LobbyService],
})
export class LobbyModule {}
