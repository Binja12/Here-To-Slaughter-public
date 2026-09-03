import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common'
import type { Observable } from 'rxjs'
import { CurrentAccount, SessionAuthGuard } from '../auth/session-auth.guard'
import type { AuthenticatedAccount } from '../auth/auth.types'
import {
  AccountAlreadyInGameError,
  GameServerUnavailableError,
  GameStartInProgressError,
  InvalidReadyPlayerCountError,
  LobbyFullError,
  OnlyHostCanStartError,
} from './lobby.errors'
import { LobbyService } from './lobby.service'
import type {
  LobbySnapshot,
  LobbySseEvent,
  StartGameResponse,
} from './lobby.types'

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

  @Sse('events')
  events(
    @CurrentAccount() account: AuthenticatedAccount,
  ): Observable<LobbySseEvent> {
    return this.lobbyService.events(account)
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

  @Post('start-game')
  @HttpCode(HttpStatus.ACCEPTED)
  async startGame(
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<StartGameResponse> {
    try {
      return await this.lobbyService.startGame(account.accountId)
    } catch (error) {
      if (error instanceof OnlyHostCanStartError) {
        throw reasonException(HttpStatus.FORBIDDEN, error.message)
      }
      if (
        error instanceof InvalidReadyPlayerCountError ||
        error instanceof AccountAlreadyInGameError ||
        error instanceof GameStartInProgressError
      ) {
        throw reasonException(HttpStatus.CONFLICT, error.message)
      }
      if (error instanceof GameServerUnavailableError) {
        throw reasonException(HttpStatus.SERVICE_UNAVAILABLE, error.message)
      }
      throw error
    }
  }
}

function reasonException(status: HttpStatus, reason: string): HttpException {
  return new HttpException({ reason }, status)
}
