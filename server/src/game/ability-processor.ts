import { IGameEventEmitter } from 'shared'
import { IAbility } from './interfaces'
import { GameState } from './game-state'
import { AbilityContext } from './ability-context'

export class AbilityProcessor {
  constructor(private readonly em: IGameEventEmitter) {}

  process(ability: IAbility, gs: GameState, ctx: AbilityContext): void {
    for (const task of ability.steps) {
      const events = task.execute(gs, ctx)
      for (const event of events) {
        this.em.emit(event)
      }
    }
  }
}
