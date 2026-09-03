import { Module } from '@nestjs/common'
import { GameRegistryService } from './game-registry.service'
import {
  GAME_SERVER_PUBLIC_URL,
  InternalGameController,
} from './internal-game.controller'

@Module({
  controllers: [InternalGameController],
  providers: [
    GameRegistryService,
    {
      provide: GAME_SERVER_PUBLIC_URL,
      useValue: process.env.GAME_SERVER_PUBLIC_URL ?? 'http://127.0.0.1:3001',
    },
  ],
})
export class GameServerModule {}
