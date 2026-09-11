import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { CTX_CHOSEN_CARD } from '../../abilities/ability-context'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { StealFromPartyTask } from '../../tasks/hero-tasks'

// Kit Napper (hero-017): "STEAL a Hero card."
export const KitNapperAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [new ChooseCardTask({ zone: Zone.Party, owner: Owner.Others }, { question: 'Choose a hero to steal' }), new TargetRollTask(CTX_CHOSEN_CARD, Zone.Party)],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new StealFromPartyTask(),
    ],
  },
]
