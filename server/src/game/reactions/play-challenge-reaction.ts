import {
  IGameEventEmitter,
  ReactionType,
  ReactionWindowType,
  RefusalReason,
  RequestResult,
} from 'shared'
import { accepted, IReaction, refused } from '../interfaces'
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

  /**
   * The most specific refusal first: a card that survived a challenge this
   * turn cannot be contested again, and that is the one fact the player
   * could not know from their own hand or from the table.
   */
  canExecute(gs: GameState): RequestResult {
    if (gs.getCardsChallengedThisTurn().includes(this.targetedCardId)) {
      return refused(RefusalReason.AlreadyChallengedThisTurn)
    }
    if (!gs.hasInHand(this.playerId, this.cardId)) {
      return refused(RefusalReason.CardNotInHand)
    }
    if (!gs.getFrameByWindowType(ReactionWindowType.Challenge)) {
      return refused(RefusalReason.NoChallengeWindow)
    }
    return accepted()
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
