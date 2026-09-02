import { Inject, Injectable } from '@nestjs/common'
import type { ClientProxy } from '@nestjs/microservices'
import { firstValueFrom, timeout } from 'rxjs'
import { CREATE_GAME_PATTERN } from 'shared'
import type { CreateGameRequest, CreateGameResult } from 'shared'
import type { IGameServerClient } from './lobby.interfaces'

export const GAME_TCP_CLIENT = 'GAME_TCP_CLIENT'
const GAME_SERVER_TIMEOUT_MS = 5_000

@Injectable()
export class NestTcpGameServerClient implements IGameServerClient {
  constructor(
    @Inject(GAME_TCP_CLIENT)
    private readonly client: ClientProxy,
  ) {}

  async createGame(request: CreateGameRequest): Promise<CreateGameResult> {
    // Copy collection fields before handing the request to the transport.
    const tcpRequest: CreateGameRequest = {
      accountIds: [...request.accountIds],
      gameConfig: request.gameConfig,
    }

    // Convert Nest's response Observable into the Promise used by LobbyService.
    return firstValueFrom(
      this.client
        .send<
          CreateGameResult,
          CreateGameRequest
        >(CREATE_GAME_PATTERN, tcpRequest)
        .pipe(timeout(GAME_SERVER_TIMEOUT_MS)),
    )
  }
}
