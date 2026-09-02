import { IGameEventEmitter, ReactionType } from 'shared'
import { IReaction } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { GameEventFactory } from '../events/game-event-factory'

// ---------------------------------------------------------------------------
// The play, and only the play: spend the card and announce it. WHAT a modifier
// is worth is the card's own entry in the abilityRegistry, the same split
// every other card type has (§1).
//
// That is what makes the value unforgeable. It used to arrive here as a
// constructor argument straight off a socket, and nothing compared it with the
// `values` printed on the card; now the card offers its own numbers through a
// ValueChoiceWindow and the player picks one of those.
// ---------------------------------------------------------------------------

export class PlayModifierReaction implements IReaction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    /** Whose roll this is aimed at — a challenge has two. */
    private readonly targetPlayerId: string,
  ) {}

  getId(): string {
    return this.id
  }
  getType(): ReactionType {
    return ReactionType.ApplyModifier
  }
  getPlayerId(): string {
    return this.playerId
  }

  canExecute(gs: GameState): boolean {
    if (!gs.getPlayer(this.playerId)?.getHand().includes(this.cardId))
      return false

    // One question, and it covers both halves: is a window open, and would it
    // take a bonus aimed at this player. execute() spends the card before the
    // entry can land anything, so a target the window would refuse has to be
    // caught while the card is still in hand.
    return gs.acceptsModifierFor(this.targetPlayerId)
  }

  execute(gs: GameState, em: IGameEventEmitter): void {
    // The same question canExecute asked. It has already said otherwise; this
    // is what keeps the announcement below honest if it is ever skipped.
    if (!gs.acceptsModifierFor(this.targetPlayerId)) return

    // Hand -> the owner's instance pile, where it is a card in play for as
    // long as the roll it was spent on is open. Keeping that roll alive is
    // part of spending, and happens in there.
    gs.spendCard(this.playerId, this.cardId)

    // The card's entry triggers on this, and the target rides along on it.
    em.emit(
      GameEventFactory.modifierPlayed(
        this.playerId,
        this.cardId,
        this.targetPlayerId,
      ),
    )
  }
}
