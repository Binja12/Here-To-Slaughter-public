import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { CTX_CHOSEN_CARD } from '../../abilities/ability-context'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DestroyTask } from '../../tasks/hero-tasks'

// Bad Axe (hero-001): "DESTROY a Hero card."
export const BadAxeAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [new ChooseCardTask({ zone: Zone.Party, owner: Owner.All, destroyable: true }), new TargetRollTask(CTX_CHOSEN_CARD, Zone.Party)],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new DestroyTask(),
    ],
  },
]
