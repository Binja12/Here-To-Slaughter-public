import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { CTX_CHOSEN_CARD } from '../../abilities/ability-context'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DestroyTask } from '../../tasks/hero-tasks'

// Fluffy (hero-038): "DESTROY 2 Hero cards."
export const FluffyAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Party, owner: Owner.All, destroyable: true },
        { question: 'Choose the first hero to destroy' },
      ),
      new TargetRollTask(CTX_CHOSEN_CARD, Zone.Party),
    ],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new DestroyTask(),
      new ChooseCardTask(
        { zone: Zone.Party, owner: Owner.All, destroyable: true },
        { question: 'Choose the second hero to destroy' },
      ),
      new DestroyTask(),
    ],
  },
]
