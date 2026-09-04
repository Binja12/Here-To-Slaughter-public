import { GameEventType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { DrawTask } from '../../tasks/draw-task'

// Peanut (hero-048): "DRAW 2 cards."
export const PeanutAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [new DrawTask(2)],
  },
]
