import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { InMemoryStoresModule } from '../stores/in-memory-stores.module'
import { LobbyController } from './lobby.controller'
import { LobbyService } from './lobby.service'

@Module({
  imports: [AuthModule, InMemoryStoresModule],
  controllers: [LobbyController],
  providers: [LobbyService],
  exports: [LobbyService],
})
export class LobbyModule {}
