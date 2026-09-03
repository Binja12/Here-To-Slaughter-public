import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DestroyTask } from '../../tasks/hero-tasks'

// Fluffy (hero-038): "DESTROY 2 Hero cards."
export const FluffyAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.All }),
      new DestroyTask(),
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.All }),
      new DestroyTask(),
    ],
  },
]
