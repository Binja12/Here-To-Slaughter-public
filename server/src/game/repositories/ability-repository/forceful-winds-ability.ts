import { GameEventType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ReturnAllItemsTask } from '../../tasks/item-tasks'

// Forceful Winds (magic-060): "Every equipped item goes back to its owner's
// hand."
//
//   [0] the settled challenge frame → every worn item on the table goes home
//
// No choice: the whole table's gear comes off at once, one ItemUnequipped per
// item so every granted effect expires as it would for a single return.
export const ForcefulWindsAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.FrameResolved, scope: TriggerScope.SelfCard },
    steps: [new ReturnAllItemsTask()],
  },
]
