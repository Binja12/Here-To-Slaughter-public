import { IGameEventEmitter, ReactionType, ReactionWindowType } from 'shared'
import { IReaction } from '../interfaces'
import { GameState } from '../pipelines/game-state'

export class PlayChallengeReaction implements IReaction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    /** The challenger's own challenge card to spend. */
    private readonly cardId: string,
    /** The card being challenged — used for duplicate-challenge guard. */
    private readonly targetedCardId: string,
  ) {}

  getId(): string {
    return this.id
  }

  getType(): ReactionType {
    return ReactionType.Challenge
  }

  getPlayerId(): string {
    return this.playerId
  }

  canExecute(gs: GameState): boolean {
    if (!gs.getPlayer(this.playerId)?.getHand().includes(this.cardId)) return false
    if (gs.getCardsChallengedThisTurn().includes(this.targetedCardId)) return false
    return !!gs.getFrameByWindowType(ReactionWindowType.Challenge)
  }

  execute(gs: GameState, _em: IGameEventEmitter): void {
    const entry = gs.getFrameByWindowType(ReactionWindowType.Challenge)
    if (!entry) return
    gs.burnCard(entry.frameId, this.playerId, this.cardId)
    entry.frame.windows
      .find((w) => w.getType() === ReactionWindowType.Challenge)
      ?.submitReaction(this.playerId, { type: 'challenge', challengerId: this.playerId })
  }
}
