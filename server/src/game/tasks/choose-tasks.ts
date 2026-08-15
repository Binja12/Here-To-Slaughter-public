import { IGameEventEmitter, ReactionWindowType } from 'shared'
import { ITask } from '../interfaces'
import { GameState } from '../game-state'
import { AbilityContext } from '../ability-context'
import {
  CardFilter,
  PlayerFilter,
  filterCards,
  filterPlayers,
} from '../reactions/choice-filters'
import type { ReactionManager } from '../reactions/reaction-manager'

// ---------------------------------------------------------------------------
// Choose tasks — resolve candidates from GameState, open a choice window and
// suspend the pipeline.
//
// The task never says where the answer goes: the WINDOW names its own slot via
// resultKey(), that key rides along on FrameResolved, and AbilityProcessor
// files the result there on resume.
// ---------------------------------------------------------------------------

export class ChoosePlayerTask implements ITask {
  constructor(private readonly filter: PlayerFilter = {}) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    _em: IGameEventEmitter,
    rm: ReactionManager,
  ): void {
    const options = filterPlayers(gs, ctx, this.filter)

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.PlayerChoice, ctx.ownerId, {
      options,
    })
  }
}

export class ChooseCardTask implements ITask {
  constructor(private readonly filter: CardFilter) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    _em: IGameEventEmitter,
    rm: ReactionManager,
  ): void {
    const options = filterCards(gs, ctx, this.filter)

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.CardChoice, ctx.ownerId, {
      options,
    })
  }
}

// ---------------------------------------------------------------------------
// ConfirmTask — "do you want to do X?" asked BEFORE the effect fires.
//
// DISMISS makes TaskChoiceWindow restore its frame, and the rollback discards
// the suspended pipeline along with the snapshot — so the remaining steps
// never run. Same mechanism as a failed roll; nothing task-specific here.
// ---------------------------------------------------------------------------

export class ConfirmTask implements ITask {
  execute(
    _gs: GameState,
    ctx: AbilityContext,
    _em: IGameEventEmitter,
    rm: ReactionManager,
  ): void {
    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.TaskChoice, ctx.ownerId, {})
  }
}
