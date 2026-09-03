import { Controller } from '@nestjs/common'
import { EventPattern } from '@nestjs/microservices'
import { GAME_COMPLETED_PATTERN } from 'shared'
import type { GameCompletedEvent } from 'shared'
import { InvalidGameCompletedEventError } from './lobby.errors'
import { LobbyService } from './lobby.service'

@Controller()
export class InternalLobbyController {
  constructor(private readonly lobbyService: LobbyService) {}

  @EventPattern(GAME_COMPLETED_PATTERN)
  async handleGameCompleted(event: GameCompletedEvent): Promise<void> {
    // Reject malformed internal events before they can touch assignment state.
    if (!event || typeof event.gameId !== 'string' || !event.gameId.trim()) {
      throw new InvalidGameCompletedEventError()
    }

    await this.lobbyService.completeGame(event.gameId)
  }
}
