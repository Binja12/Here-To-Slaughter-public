import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common'
import { CurrentAccount, SessionAuthGuard } from '../auth/session-auth.guard'
import type { AuthenticatedAccount } from '../auth/auth.types'
import { AccountAlreadyInGameError, LobbyFullError } from './lobby.errors'
import { LobbyService } from './lobby.service'
import type { LobbySnapshot } from './lobby.types'

@Controller('lobby')
@UseGuards(SessionAuthGuard)
export class LobbyController {
  constructor(private readonly lobbyService: LobbyService) {}

  @Get()
  getLobby(
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<LobbySnapshot> {
    return this.lobbyService.getSnapshot(account)
  }

  @Post('ready')
  @HttpCode(HttpStatus.OK)
  async ready(
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<LobbySnapshot> {
    try {
      return await this.lobbyService.ready(account)
    } catch (error) {
      if (error instanceof LobbyFullError) {
        throw reasonException(HttpStatus.CONFLICT, error.message)
      }
      if (error instanceof AccountAlreadyInGameError) {
        throw reasonException(HttpStatus.CONFLICT, error.message)
      }
      throw error
    }
  }

  @Delete('ready')
  unready(
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<LobbySnapshot> {
    return this.lobbyService.unready(account)
  }
}

function reasonException(status: HttpStatus, reason: string): HttpException {
  return new HttpException({ reason }, status)
}
