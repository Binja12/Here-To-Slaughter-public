import { Inject, Injectable } from '@nestjs/common'
import type { ClientProxy } from '@nestjs/microservices'
import { firstValueFrom, timeout } from 'rxjs'
import { RESOLVE_SESSION_PATTERN } from 'shared'
import type { ResolveSessionRequest, ResolveSessionResult } from 'shared'
import type {
  IGameSessionResolver,
  ResolvedAccount,
} from './game-session.resolver'

export const LOBBY_TCP_CLIENT = 'LOBBY_TCP_CLIENT'
const LOBBY_TIMEOUT_MS = 5_000

/**
 * The resolver over Nest TCP: `lobby/nest-tcp-game-server.client.ts` pointed
 * the other way, landing on `auth/internal-auth.controller.ts`. Until a
 * shared session store replaces it (plan §10), this is how the game process
 * learns who is at the door.
 */
@Injectable()
export class TcpSessionResolver implements IGameSessionResolver {
  constructor(
    @Inject(LOBBY_TCP_CLIENT)
    private readonly client: ClientProxy,
  ) {}

  async resolve(sessionToken: string): Promise<ResolvedAccount | undefined> {
    const result = await firstValueFrom(
      this.client
        .send<
          ResolveSessionResult,
          ResolveSessionRequest
        >(RESOLVE_SESSION_PATTERN, { sessionToken })
        .pipe(timeout(LOBBY_TIMEOUT_MS)),
    )

    if (!result.authenticated) return undefined
    return { accountId: result.accountId, username: result.username }
  }
}
