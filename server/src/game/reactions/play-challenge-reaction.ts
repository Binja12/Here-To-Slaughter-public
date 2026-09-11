import {
  IGameEventEmitter,
  ReactionType,
  ReactionWindowType,
  RefusalReason,
  RequestResult,
} from 'shared'
import { accepted, IReaction, IReactionWindow, refused } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { GameEventFactory } from '../events/game-event-factory'

// ---------------------------------------------------------------------------
// The play, and only the play. Contesting the card is StartChallengeTask, run
// from the challenge card's own registry entry — the same split a modifier has.
//
// The card names no target: it contests whichever play is open to a
// challenge, the last one made (the owner, 2026-09-06).
// ---------------------------------------------------------------------------

export class PlayChallengeReaction implements IReaction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    /** The challenger's own challenge card to spend. */
    private readonly cardId: string,
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

  canExecute(gs: GameState): RequestResult {
    if (!gs.hasInHand(this.playerId, this.cardId)) {
      return refused(RefusalReason.CardNotInHand)
    }
    const window = openContest(gs)
    if (!window || window.getDeadline() <= Date.now() || window.getDetail()['challengeable'] === false) {
      return refused(RefusalReason.NoChallengeWindow)
    }
    // A card that survived a challenge this turn cannot be contested again —
    // the one fact the player could not know from their own hand or the table.
    if (gs.getCardsChallengedThisTurn().includes(contestedBy(window))) {
      return refused(RefusalReason.AlreadyChallengedThisTurn)
    }
    if (window.getDetail()['challenged'] === true) {
      return refused(RefusalReason.ChallengeAlreadyStarted)
    }
    // A player never contests their own play. The window's respondent is the
    // defender, and the defender is whoever played the contested card.
    if (window.getRespondentId() === this.playerId) {
      return refused(RefusalReason.CannotChallengeOwnCard)
    }
    return accepted()
  }

  execute(gs: GameState, em: IGameEventEmitter): void {
    const window = openContest(gs)
    if (!window) return

    // Into the instance pile, so the card is on the table for as long as the
    // contest is. Keeping the contest alive until the card's entry starts it
    // is part of spending, and happens in there.
    gs.spendCard(this.playerId, this.cardId)

    em.emit(
      GameEventFactory.challengePlayed(this.playerId, this.cardId, contestedBy(window)),
    )
  }
}

/** The one challenge window open on the table, if any. */
function openContest(gs: GameState): IReactionWindow | undefined {
  return gs
    .getFrameByWindowType(ReactionWindowType.Challenge)
    ?.frame.windows.find((w) => w.getType() === ReactionWindowType.Challenge && w.isOpen())
}

/** The card a challenge window is about — every challenge window names one. */
function contestedBy(window: IReactionWindow): string {
  const cardId = window.subjectCardId?.()
  if (!cardId) throw new Error('PlayChallengeReaction: a challenge window with no card to contest')
  return cardId
}
