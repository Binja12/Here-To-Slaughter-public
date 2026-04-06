import { ActionType, Audience, GameEventType, IGameEvent } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { GameEvent } from '../game-event'
import { ReactionManager } from '../reactions/reaction-manager'

const COST = 0

/**
 * A challenge action played by an opponent during a ChallengeWindow.
 * Cost is 0; it can be played outside the active player's turn.
 * Goes through ReactionManager.enqueueReaction(), NOT TurnManager.
 */
export class ChallengeCardAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    /** The challenger's own challenge card to spend. */
    private readonly cardId: string,
    /** The card that is being challenged (must have an open window). */
    private readonly targetedCardId: string,
    private readonly reactionManager: ReactionManager,
  ) {}

  getId(): string {
    return this.id
  }

  getType(): ActionType {
    return ActionType.Challenge
  }

  getPlayerId(): string {
    return this.playerId
  }

  getCost(): number {
    return COST
  }

  isChallengeable(): boolean {
    return false
  }

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    if (!player.getHand().includes(this.cardId)) return false
    // A card can only be challenged once per turn.
    if (gs.getCardsChallengedThisTurn().includes(this.targetedCardId))
      return false
    // A challenge window must be open for the targeted card.
    if (!gs.getReactionWindows().some((w) => w.isOpen())) return false
    return true
  }

  execute(gs: GameState): IGameEvent[] {
    const player = gs.getPlayer(this.playerId)!
    // Spend the challenge card.
    player.removeFromHand(this.cardId)

    // Trigger the challenge in the open window.
    this.reactionManager.startChallenge(this.playerId)

    return [
      new GameEvent(
        GameEventType.ChallengeWindowOpened,
        this.playerId,
        {
          challengerId: this.playerId,
          cardId: this.cardId,
          targetedCardId: this.targetedCardId,
        },
        Audience.All,
      ),
    ]
  }
}
