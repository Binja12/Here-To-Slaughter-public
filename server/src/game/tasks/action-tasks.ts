import { IGameEventEmitter } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../game-state'
import { AbilityContext, CTX_CHOSEN_CARD } from '../ability-context'
import { MagicCard } from '../cards/magic-card'
import { GameEventFactory } from '../events/game-event-factory'

// ---------------------------------------------------------------------------
// Action tasks — steps that do what a player action does, for an ability that
// does it without being asked.
//
// The mechanic itself lives in the abstract base here, and the matching
// IAction in `actions/` extends it: one description of what playing a card IS,
// worn by both pipelines (§1). The base is exported for that reason only.
// ---------------------------------------------------------------------------

/**
 * Implements NEITHER IAction nor ITask on purpose: `execute(gs)` is a legal
 * override of `execute(gs, ctx, em, rm)`, so one class satisfying both would
 * type-check while letting TaskManager run an action — playing its
 * constructor-bound card and ignoring the context.
 */
export abstract class MagicPlay {
  /**
   * Hand → instance pile → MagicPlayed → discard.
   *
   * The card only has to be in the instance pile for the emit: that is the
   * position TaskManager matches from (§6), and matching is what queues its
   * steps. They run afterwards off the stack, so disposing of the card
   * straight away does not disturb them.
   *
   * Assumes the card is in the owner's hand — the action checks in canExecute,
   * the task checks when it discovers its target.
   */
  protected playMagic(
    gs: GameState,
    playerId: string,
    cardId: string,
    em: IGameEventEmitter,
  ): void {
    const player = gs.getPlayer(playerId)
    if (!player) return

    player.removeFromHand(cardId)
    em.emit(GameEventFactory.cardRemovedFromHand(playerId, cardId))

    gs.getParty(playerId).addInstanceCard(cardId)
    em.emit(GameEventFactory.magicPlayed(playerId, cardId))
    this.disposeMagic(gs, playerId, cardId)
  }

  /**
   * Where a played card ends up. Not a task, so nothing in TaskManager can
   * reach it, and silent — MagicPlayed already said the card was spent.
   */
  private disposeMagic(gs: GameState, playerId: string, cardId: string): void {
    gs.getParty(playerId).removeInstanceCard(cardId)
    gs.getDiscardPile().add(cardId)
  }
}

/**
 * Same mechanic as PlayMagicAction, no price — the ability already paid for
 * itself. Names WHAT it needs (a slot holding a card), never where that card
 * came from.
 */
export class PlayMagicTask extends MagicPlay implements ITask {
  /** Card to play. Defaults to the card a ChooseCardTask put on the context. */
  constructor(private readonly fromKey: string = CTX_CHOSEN_CARD) {
    super()
  }

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const cards = ctx.get<string[]>(this.fromKey)

    // Absent = no step ahead was declared to supply a card.
    if (cards === undefined) {
      throw new Error(
        `PlayMagicTask: nothing has written ${this.fromKey} — expected a ` +
          'preceding step to supply a card.',
      )
    }

    const [cardId] = cards
    if (!cardId) return

    if (!(gs.getCard(cardId) instanceof MagicCard)) return
    // Discovered at runtime, so the card may have left the hand since the slot
    // was written — the action's equivalent guard lives in canExecute.
    if (!gs.getPlayer(ctx.ownerId)?.getHand().includes(cardId)) return

    this.playMagic(gs, ctx.ownerId, cardId, em)
  }
}
