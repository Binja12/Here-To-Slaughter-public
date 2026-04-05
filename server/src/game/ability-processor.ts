import { IGameEvent, IGameEventEmitter, IGameEventListener } from 'shared'
import { IAbility, IPassive } from './interfaces'
import { GameState } from './game-state'
import { AbilityContext } from './ability-context'

interface RegisteredPassive {
  cardId: string
  ownerId: string
  passive: IPassive
}

export class AbilityProcessor implements IGameEventListener {
  private passives: RegisteredPassive[] = []

  constructor(
    private gs: GameState,
    private emitter: IGameEventEmitter,
  ) {}

  process(ability: IAbility, gs: GameState, ctx: AbilityContext): IGameEvent[] {
    const events: IGameEvent[] = []
    for (const task of ability.steps) {
      events.push(...task.execute(gs, ctx))
    }
    return events
  }

  registerPassive(cardId: string, ownerId: string, passive: IPassive): void {
    this.passives.push({ cardId, ownerId, passive })
  }

  unregisterPassivesFor(cardId: string): void {
    this.passives = this.passives.filter((p) => p.cardId !== cardId)
  }

  onEvent(event: IGameEvent): void {
    for (const { cardId, ownerId, passive } of this.passives) {
      if (passive.trigger !== event.getType()) continue
      const ctx = new AbilityContext(cardId, ownerId)
      for (const task of passive.steps) {
        const taskEvents = task.execute(this.gs, ctx)
        for (const taskEvent of taskEvents) {
          this.emitter.emit(taskEvent)
        }
      }
    }
  }
}
