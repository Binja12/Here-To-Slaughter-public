import { IGameEventEmitter } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import {
  AbilityContext,
  CTX_CHOSEN_VALUE,
  CTX_MODIFIER_TARGET,
} from '../abilities/ability-context'

// ---------------------------------------------------------------------------
// Modifier tasks — the two steps that turn "a modifier was played" into a
// number inside an open window.
//
// A modifier card's own entry is ApplyModifierTask alone — its value came with
// the play, on the event's ctxSeed. The Protecting Horn puts a ChooseValueTask
// in front of the same step: the leader grants the same thing a card does, so
// it runs the same mechanic rather than a copy of it.
// ---------------------------------------------------------------------------

/**
 * Puts the chosen bonus into the window it was played on.
 *
 * Returns nothing, deliberately. Parking on the roll's frame would read well —
 * the card is not finished until the roll is — but the pipelines UNDERNEATH
 * wait on the same frame, so a second modifier played on the same roll (the
 * Horn's, riding a card's) would never get to run. The card stays in the
 * instance zone by a different route: the frame owns what was spent into it
 * (`spendCard`), and `releaseFrame` puts it away.
 */
export class ApplyModifierTask implements ITask {
  execute(
    gs: GameState,
    ctx: AbilityContext,
    _em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const values = ctx.get<number[]>(CTX_CHOSEN_VALUE)

    // Absent = no step ahead was declared to supply a value.
    if (values === undefined) {
      throw new Error(
        `ApplyModifierTask: nothing has written ${CTX_CHOSEN_VALUE} — no ` +
          'ChooseValueTask ahead of this step, and no value on the event seed.',
      )
    }

    // Empty = the player was asked and picked nothing.
    const [value] = values
    if (value === undefined) return

    const [targetPlayerId] = ctx.get<string[]>(CTX_MODIFIER_TARGET) ?? []
    if (!targetPlayerId) return

    // Whether there is still a roll to land it in — and whether that roll
    // would take it — is the board's question, not this step's. A choice
    // window opens over an already-running roll, and the roll has its own
    // timer, so arriving late is an ordinary outcome and not a failure.
    gs.applyModifier(ctx.ownerId, {
      value,
      // Per COPY, so the roll UI can say which card each contribution came
      // from — for the Horn that is the leader, which spent nothing.
      cardId: ctx.sourceCardId,
      targetPlayerId,
    })
  }
}
