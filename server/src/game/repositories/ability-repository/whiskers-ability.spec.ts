import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { WhiskersAbility } from './whiskers-ability'

describe('WhiskersAbility', () => {
  // Two victims, and they may be two different players: both are named while
  // the roll's window is still open, so each of them sees it and can answer.
  it('names BOTH victims under the roll, then steals and destroys when it lands', () => {
    expectAbility('hero-037', WhiskersAbility, [
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
        steps: ['StealFromPartyTask', 'DestroyTask'],
      },
    ])
  })
})
