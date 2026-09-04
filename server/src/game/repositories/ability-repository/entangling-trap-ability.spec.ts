import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import type { ExpectedEntry } from './ability-declaration-test-helpers'
import { EntanglingTrapAbility } from './entangling-trap-ability'

describe('EntanglingTrapAbility', () => {
  const expected: ExpectedEntry[] = [
    {
      on: GameEventType.FrameResolved,
      scope: TriggerScope.SelfCard,
      steps: [
        'ChooseCardTask',
        'DiscardTask',
        'ChooseCardTask',
        'DiscardTask',
        'ChooseCardTask',
        'StealFromPartyTask',
      ],
    },
  ]

  it.each(['magic-051', 'magic-052'])(
    'registers both discard payments before the steal for %s',
    (cardId) => {
      expectAbility(cardId, EntanglingTrapAbility, expected)
    },
  )
})
