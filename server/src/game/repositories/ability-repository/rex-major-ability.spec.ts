import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { RexMajorAbility } from './rex-major-ability'

describe('RexMajorAbility', () => {
  it('registers the Modifier draw chain and discard fight-back', () => {
    expectAbility('monster-132', RexMajorAbility, [
      {
        on: GameEventType.CardDrawn,
        scope: TriggerScope.OwnerEvent,
        steps: ['CardTypeCondition'],
      },
      {
        on: GameEventType.ConditionMet,
        scope: TriggerScope.SelfCard,
        when: 'RexMajorDrewModifier',
        steps: ['ConfirmTask'],
      },
      {
        on: GameEventType.TaskConfirmed,
        scope: TriggerScope.SelfCard,
        when: 'RexMajorDrawsAgain',
        steps: ['RevealTask', 'DrawTask'],
      },
      {
        on: GameEventType.MonsterFoughtBack,
        scope: TriggerScope.Attacker,
        steps: [
          'ChooseCardTask',
          'DiscardTask',
          'ChooseCardTask',
          'DiscardTask',
        ],
      },
    ])
  })
})
