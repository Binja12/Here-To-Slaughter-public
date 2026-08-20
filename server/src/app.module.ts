import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { InMemoryStoresModule } from './stores/in-memory-stores.module'

@Module({
  imports: [InMemoryStoresModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
