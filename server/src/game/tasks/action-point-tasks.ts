import { IGameEventEmitter } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { AbilityContext } from '../abilities/ability-context'

// ---------------------------------------------------------------------------
// GainActionPointsTask — points for the ability owner, now, this turn.
//
// A standing ActionPointBonus is read at the START of every turn (TurnManager)
// and so never reaches the turn it was won on; Mega Slime's "+1 on each of
// your turns" starts with the turn that slays it (the owner, 2026-09-04), so the
// entry grants the first point itself and the effect carries the rest.
// ---------------------------------------------------------------------------

export class GainActionPointsTask implements ITask {
  constructor(private readonly amount: number) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    _em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    gs.increaseActionPoints(ctx.ownerId, this.amount)
  }
}
