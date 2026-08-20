import { Module } from '@nestjs/common'
import { InMemoryStoresModule } from '../stores/in-memory-stores.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

@Module({
  imports: [InMemoryStoresModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
