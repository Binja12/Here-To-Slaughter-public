import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DrawTask } from '../../tasks/draw-task'
import { DestroyTask } from '../../tasks/hero-tasks'

// Serious Grey (hero-009): "DESTROY a Hero and DRAW a card."
export const SeriousGreyAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.All, destroyable: true }),
      new DestroyTask(),
      new DrawTask(1),
    ],
  },
]
