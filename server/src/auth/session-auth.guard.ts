import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { AuthService } from './auth.service'
import type { AuthenticatedAccount } from './auth.types'
import { readSessionToken } from './session-cookie'

export type AuthenticatedRequest = Request & {
  authenticatedAccount?: AuthenticatedAccount
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()

    // Resolve the cookie to a trusted server-side account.
    const account = await this.authService.resolveAccount(
      readSessionToken(request),
    )
    if (!account) {
      throw new UnauthorizedException({ reason: 'Authentication required' })
    }

    // Make the authenticated account available to the protected controller.
    request.authenticatedAccount = account
    return true
  }
}

export const CurrentAccount = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAccount => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const account = request.authenticatedAccount

    // This decorator must only be used behind SessionAuthGuard.
    if (!account) {
      throw new UnauthorizedException({ reason: 'Authentication required' })
    }
    return account
  },
)
