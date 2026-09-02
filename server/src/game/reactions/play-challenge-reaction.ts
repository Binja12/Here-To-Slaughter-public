import { IGameEventEmitter, ReactionType, ReactionWindowType } from 'shared'
import { IReaction } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { GameEventFactory } from '../events/game-event-factory'

// ---------------------------------------------------------------------------
// The play, and only the play. Contesting the card is StartChallengeTask, run
// from the challenge card's own registry entry — the same split a modifier has.
// ---------------------------------------------------------------------------

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

  execute(gs: GameState, em: IGameEventEmitter): void {
    if (!gs.getFrameByWindowType(ReactionWindowType.Challenge)) return

    // Into the instance pile, so the card is on the table for as long as the
    // contest is. Keeping the contest alive until the card's entry starts it
    // is part of spending, and happens in there.
    gs.spendCard(this.playerId, this.cardId)

    em.emit(
      GameEventFactory.challengePlayed(
        this.playerId,
        this.cardId,
        this.targetedCardId,
      ),
    )
  }
}
