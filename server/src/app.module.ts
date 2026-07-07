import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RuntimeService } from './runtime/runtime.service';
import { GameSocketGateway } from './socket/socket.gateway';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, RuntimeService, GameSocketGateway],
})
export class AppModule {}
