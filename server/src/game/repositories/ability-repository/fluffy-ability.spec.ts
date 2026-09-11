import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { FluffyAbility } from './fluffy-ability'

describe('FluffyAbility', () => {
  // Both victims are named while the roll's window is still open — each
  // choice restarts its clock — and only the settled roll destroys them.
  it('chooses BOTH heroes under the roll, then destroys both when it lands', () => {
    expectAbility('hero-038', FluffyAbility, [
      {
        on: GameEventType.RollPassing,
        scope: TriggerScope.SelfCard,
        steps: [
          'ChooseCardTask',
          'TargetRollTask',
          'ChooseCardTask',
          'TargetRollTask',
        ],
      },
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['DestroyTask', 'DestroyTask'],
      },
    ])
  })
})
