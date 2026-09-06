import { IGameEventEmitter, ReactionWindowType } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { AbilityContext } from '../abilities/ability-context'

// ---------------------------------------------------------------------------
// StartChallengeTask — what a challenge card DOES, once it has been spent.
//
// The reaction takes the card and announces it; this contests the play. Same
// split as a modifier's, and the same reason: what a card does belongs in the
// registry, keyed by its id, so the reaction is left holding only the play.
//
// The challenger is `ctx.ownerId` — the card is in its own owner's instance
// pile, which is where this entry was matched from.
// ---------------------------------------------------------------------------

export class StartChallengeTask implements ITask {
  execute(
    gs: GameState,
    ctx: AbilityContext,
    _em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const entry = gs.getFrameByWindowType(ReactionWindowType.Challenge)
    const window = entry?.frame.windows.find(
      (w) => w.getType() === ReactionWindowType.Challenge,
    )
    // Gone while the card was being spent — nothing to contest, and the card
    // is spent either way.
    if (!window?.isOpen()) return

    window.submitReaction(ctx.ownerId, {
      type: 'challenge',
      challengerId: ctx.ownerId,
    })
  }
}
