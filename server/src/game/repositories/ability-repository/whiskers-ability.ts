import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DestroyTask, StealFromPartyTask } from '../../tasks/hero-tasks'

// Whiskers (hero-037): "STEAL a Hero card and DESTROY a Hero card."
export const WhiskersAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Others }),
      new StealFromPartyTask(),
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.All }),
      new DestroyTask(),
    ],
  },
]
