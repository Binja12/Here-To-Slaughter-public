import { Controller } from '@nestjs/common'
import { MessagePattern } from '@nestjs/microservices'
import { RESOLVE_SESSION_PATTERN } from 'shared'
import type { ResolveSessionRequest, ResolveSessionResult } from 'shared'
import { AuthService } from './auth.service'

@Controller()
export class InternalAuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern(RESOLVE_SESSION_PATTERN)
  async resolveSession(
    request: ResolveSessionRequest,
  ): Promise<ResolveSessionResult> {
    // The Game server forwards the opaque token from the Socket.IO cookie.
    const token =
      request && typeof request.sessionToken === 'string'
        ? request.sessionToken
        : undefined
    const account = await this.authService.resolveAccount(token)

    // Invalid and expired sessions are expected authentication failures.
    if (!account) return { authenticated: false }
    return {
      authenticated: true,
      accountId: account.accountId,
      username: account.username,
    }
  }
}
