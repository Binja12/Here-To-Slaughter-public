import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { StealFromPartyTask } from '../../tasks/hero-tasks'

// Kit Napper (hero-017): "STEAL a Hero card."
export const KitNapperAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Others }),
      new StealFromPartyTask(),
    ],
  },
]
