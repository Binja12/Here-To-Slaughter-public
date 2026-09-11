import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { MeowzioAbility } from './meowzio-ability'

describe('MeowzioAbility', () => {
  it('registers one-player steal and pull flow', () => {
    expectAbility('hero-019', MeowzioAbility, [
      {
        on: GameEventType.RollPassing,
        scope: TriggerScope.SelfCard,
        steps: ['ChoosePlayerTask', 'TargetRollTask'],
      },
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['ChooseCardTask', 'StealFromPartyTask', 'PullCardTask',],
      },
    ])
  })
})
