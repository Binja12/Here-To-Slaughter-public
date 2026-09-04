import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { DracosAbility } from './dracos-ability'

describe('DracosAbility', () => {
  it('registers the optional draw and sacrifice fight-back', () => {
    expectAbility('monster-126', DracosAbility, [
      {
        on: GameEventType.HeroDestroyed,
        scope: TriggerScope.OwnerEvent,
        steps: ['ConfirmTask'],
      },
      {
        on: GameEventType.TaskConfirmed,
        scope: TriggerScope.SelfCard,
        when: 'DracosDrawsCard',
        steps: ['DrawTask'],
      },
      {
        on: GameEventType.MonsterFoughtBack,
        scope: TriggerScope.Attacker,
        steps: ['ChooseCardTask', 'SacrificeTask'],
      },
    ])
  })
})
