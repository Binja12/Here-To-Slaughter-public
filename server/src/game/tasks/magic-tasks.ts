import { IGameEventEmitter, ReactionWindowType } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { AbilityContext, CTX_CHOSEN_CARD } from '../abilities/ability-context'
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
export abstract class PlayMagic {
  /**
   * Hand → instance pile → `PlayMagiced` → challenge window. Returns the
   * frameId.
   *
   * The card leaves the hand BEFORE the frame and joins the instance pile
   * inside it, so a lost challenge takes the play back but not the card;
   * ChallengeWindow discards it on that branch.
   *
   * `PlayMagiced` announces the attempt — it is what the table challenges. The
   * card's own steps trigger on the settled challenge frame instead: the
   * window names this card on its FrameResolved, and a defeated card is no
   * longer in the pile to be matched from.
   *
   * Assumes the card is in the owner's hand — the action checks in canExecute,
   * the task checks when it discovers its target.
   */
  protected playMagic(
    gs: GameState,
    playerId: string,
    cardId: string,
    em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    const player = gs.getPlayer(playerId)
    if (!player) return

    player.removeFromHand(cardId)
    em.emit(GameEventFactory.cardRemovedFromHand(playerId, cardId))

    const frameId = rm.openFrame()

    // Inside the frame, so a lost challenge takes it back out again.
    gs.getParty(playerId).addInstanceCard(cardId)
    em.emit(GameEventFactory.magicPlayed(playerId, cardId))

    // Last: this window suspends the drain.
    rm.openWindow(frameId, ReactionWindowType.Challenge, playerId, { cardId })

    return frameId
  }
}

/**
 * Same mechanic as PlayMagicAction, no price — the ability already paid for
 * itself. Names WHAT it needs (a slot holding a card), never where that card
 * came from.
 */
export class PlayMagicTask extends PlayMagic implements ITask {
  /** Card to play. Defaults to the card a ChooseCardTask put on the context. */
  constructor(private readonly fromKey: string = CTX_CHOSEN_CARD) {
    super()
  }

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
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

    // Returned, so the rest of the declaring card's entry waits on the same
    // challenge.
    return this.playMagic(gs, ctx.ownerId, cardId, em, rm)
  }
}

/**
 * The last step of every played magic card's entry: instance pile → discard.
 *
 * Acts on the entry's own source card, so it takes no argument. Silent —
 * PlayMagiced already told the table the card was spent. A magic card whose
 * entry omits it is left sitting in the instance pile.
 */
export class DisposeMagicTask implements ITask {
  execute(gs: GameState, ctx: AbilityContext): void {
    gs.getParty(ctx.ownerId).removeInstanceCard(ctx.sourceCardId)
    gs.getDiscardPile().add(ctx.sourceCardId)
  }
}
