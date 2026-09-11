import { Module, RequestMethod } from '@nestjs/common'
import type { MiddlewareConsumer, NestModule } from '@nestjs/common'
import { StoresModule } from '../stores/stores.module'
import { AuthController } from './auth.controller'
import { InternalAuthController } from './internal-auth.controller'
import { PageRedirectMiddleware } from './page-redirect.middleware'
import { SessionAuthGuard } from './session-auth.guard'
import { AuthService } from './auth.service'

@Module({
  imports: [StoresModule],
  controllers: [AuthController, InternalAuthController],
  providers: [AuthService, SessionAuthGuard, PageRedirectMiddleware],
  exports: [AuthService, SessionAuthGuard],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(PageRedirectMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.GET })
  }
}
