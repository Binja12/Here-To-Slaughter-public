import { CardType, GameEventType, TriggerScope } from 'shared'
import { IAbility } from '../interfaces'
import { DrawTask } from '../tasks/tasks'
import { ConfirmTask } from '../tasks/choose-tasks'
import { CTX_DRAWN_CARD_IDS } from '../ability-context'
import { CardTypeCondition } from '../tasks/conditions'

// Snowball (hero-040): "DRAW a card. If it is a Magic card, you may play it
// immediately and DRAW a second card."
//
//   [0] RollSuccess on Snowball   → draw, and test what came up
//   [1] ConditionMet 'DrewMagic'  → ask
//   [2] TaskConfirmed 'DrawAgain' → draw the second card
//
// Three entries because it pauses twice: on a test, then on a question.
//
// GAP: "play it immediately" is unimplemented — there is no task for playing a
// card from hand. CardTypeCondition already seeds CTX_DRAWN_CARD_IDS onto its
// event, so the card reaches entry [1] when that task exists.
const DREW_A_MAGIC = 'SnowballDrewMagic'
const CONFIRMS_DRAW_AGAIN = 'SnowballDrawAgain'

export const SnowballAbility: IAbility[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new DrawTask(1),
      new CardTypeCondition(CardType.Magic, CTX_DRAWN_CARD_IDS, DREW_A_MAGIC),
    ],
  },
  {
    trigger: {
      on: GameEventType.ConditionMet,
      scope: TriggerScope.SelfCard,
      when: DREW_A_MAGIC,
    },
    steps: [new ConfirmTask({ confirms: CONFIRMS_DRAW_AGAIN })],
  },
  {
    trigger: {
      on: GameEventType.TaskConfirmed,
      scope: TriggerScope.SelfCard,
      when: CONFIRMS_DRAW_AGAIN,
    },
    steps: [new DrawTask(1)],
  },
]
