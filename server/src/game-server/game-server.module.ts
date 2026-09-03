import { Module } from '@nestjs/common'
import { CommandDispatcherService } from './command-dispatcher.service'
import { GameRegistryService } from './game-registry.service'
import {
  GAME_SERVER_PUBLIC_URL,
  InternalGameController,
} from './internal-game.controller'

@Module({
  controllers: [InternalGameController],
  providers: [
    GameRegistryService,
    CommandDispatcherService,
    {
      provide: GAME_SERVER_PUBLIC_URL,
      useValue: process.env.GAME_SERVER_PUBLIC_URL ?? 'http://127.0.0.1:3001',
    },
  ],
})
export class GameServerModule {}
