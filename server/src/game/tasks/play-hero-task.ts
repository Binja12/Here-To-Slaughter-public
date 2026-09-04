import { IGameEventEmitter, ReactionWindowType } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { AbilityContext, CTX_CHOSEN_CARD } from '../abilities/ability-context'
import { GameEventFactory } from '../events/game-event-factory'
import { HeroCard } from '../cards/hero-card'

// ---------------------------------------------------------------------------
// PlayHero — the mechanic, extended by PlayHeroAction (actions/) and by
// PlayHeroTask below (§1).
// ---------------------------------------------------------------------------

/** Implements neither IAction nor ITask: see PlayMagic in magic-tasks.ts. */
export abstract class PlayHero {
  /**
   * Hand → party → challenge window. Returns the frameId. `addHero` emits
   * `HeroAddedToParty` itself.
   *
   * ORDER: the card leaves the hand before `openFrame` and joins the party
   * inside it, so a lost challenge un-plays the hero without returning the
   * card; ChallengeWindow discards it on that branch. The window opens last.
   *
   * The roll a played hero is offered is arranged in
   * `repositories/ability-repository/hero-rules.ts`, not here.
   *
   * Assumes the card is in the owner's hand: the action checks in canExecute,
   * the task when it discovers its target.
   */
  protected playHero(
    gs: GameState,
    playerId: string,
    cardId: string,
    em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    const player = gs.getPlayer(playerId)
    if (!player) return

    gs.removeFromHand(playerId, cardId)
    em.emit(GameEventFactory.cardRemovedFromHand(playerId, cardId))

    const frameId = rm.openFrame()

    // Inside the frame, so a lost challenge takes it back out again.
    gs.addHero(playerId, cardId, em, 'Played')

    // Last: this window suspends the drain.
    rm.openWindow(frameId, ReactionWindowType.Challenge, playerId, { cardId })

    return frameId
  }
}

/** Same mechanic as PlayHeroAction, with no cost and a target read at runtime. */
export class PlayHeroTask extends PlayHero implements ITask {
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
        `PlayHeroTask: nothing has written ${this.fromKey} — expected a ` +
          'preceding step to supply a card.',
      )
    }

    const [cardId] = cards
    if (!cardId) return

    if (!(gs.getCard(cardId) instanceof HeroCard)) return
    // Discovered at runtime, so the card may have left the hand since the slot
    // was written — the action's equivalent guard lives in canExecute.
    if (!gs.getPlayer(ctx.ownerId)?.getHand().includes(cardId)) return

    // Returned, so the rest of the declaring card's entry waits on the same
    // challenge.
    return this.playHero(gs, ctx.ownerId, cardId, em, rm)
  }
}
