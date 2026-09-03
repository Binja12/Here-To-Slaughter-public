import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { LobbyModule } from './lobby/lobby.module'

@Module({
  imports: [AuthModule, LobbyModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
