import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DrawTask } from '../../tasks/draw-task'
import { DiscardTask } from '../../tasks/tasks'

// Wildshot (hero-012): "DRAW 3 cards and DISCARD a card."
export const WildshotAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new DrawTask(3),
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Self }),
      new DiscardTask(),
    ],
  },
]
