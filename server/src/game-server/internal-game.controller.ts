import { Controller, Inject } from '@nestjs/common'
import { MessagePattern, RpcException } from '@nestjs/microservices'
import { CREATE_GAME_PATTERN, CreateGameRequestSchema } from 'shared'
import type { CreateGameResult } from 'shared'
import type { ZodError } from 'zod'
import { GameRegistryService } from './game-registry.service'

/** Where browsers reach THIS process. Every game it hosts shares the one url. */
export const GAME_SERVER_PUBLIC_URL = 'GAME_SERVER_PUBLIC_URL'

// ---------------------------------------------------------------------------
// The lobby's door: internal TCP, never exposed to browsers. Mirrors
// `lobby/internal-lobby.controller.ts` on the other side of the wire.
//
// The schema checks SHAPE only. Whether the accounts can be seated is
// `createGame`'s question, and an engine refusal is the lobby's mistake: it
// stays a plain error, which Nest logs here and reports opaquely.
// ---------------------------------------------------------------------------

@Controller()
export class InternalGameController {
  constructor(
    private readonly registry: GameRegistryService,
    @Inject(GAME_SERVER_PUBLIC_URL) private readonly webSocketUrl: string,
  ) {}

  @MessagePattern(CREATE_GAME_PATTERN)
  createGame(request: unknown): CreateGameResult {
    const parsed = CreateGameRequestSchema.safeParse(request)
    if (!parsed.success) {
      // An expected refusal crosses the wire with its reason.
      throw new RpcException(
        `Invalid create-game request: ${describe(parsed.error)}`,
      )
    }

    const { accountIds, gameConfig } = parsed.data
    const game = this.registry.create(accountIds, gameConfig)
    return { gameId: game.gameId, webSocketUrl: this.webSocketUrl }
  }
}

/** `accountIds: expected array, received string; gameConfig: ...` */
function describe(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '$'}: ${issue.message}`)
    .join('; ')
}
