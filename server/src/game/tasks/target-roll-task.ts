import { IGameEventEmitter, Zone } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { AbilityContext } from '../abilities/ability-context'

// ---------------------------------------------------------------------------
// TargetRollTask — hands the target a hero's effect chose to the roll window
// that is still open over it.
//
// The window keeps it (the table sees who is targeted, everyone gets another
// look at the roll) and puts it on RollSuccess as the seed of the effect's
// entry, which runs with a fresh context. The slot is named by the declaring
// card: whatever its choose step wrote. So is the ZONE the effect will reach
// on that seat — its hand (a pull, a discard) or its party (a steal, a
// destroy, a sacrifice) — which is what the table points at. An empty pick
// lands too: the window is waiting on the question, not on an answer.
// ---------------------------------------------------------------------------

export class TargetRollTask implements ITask {
  constructor(
    private readonly key: string,
    private readonly zone: Zone,
  ) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    _em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    gs.landRollTarget(this.key, ctx.get<unknown[]>(this.key) ?? [], this.zone)
  }
}
