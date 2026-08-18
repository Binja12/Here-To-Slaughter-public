import { CardType, GameEventType, TriggerScope } from 'shared'
import { IAbility } from '../interfaces'
import { DrawTask } from '../tasks/tasks'
import { ConfirmTask } from '../tasks/choose-tasks'
import { CTX_DRAWN_CARD_IDS } from '../ability-context'
import { CardTypeCondition } from '../tasks/conditions'

// Snowball (hero-040): "DRAW a card. If it is a Magic card, you may play it
// immediately and DRAW a second card."
//
//   [0] RollSuccess on Snowball  → draw, and test what came up
//   [1] ConditionMet 'DrewMagic'  → ask
//   [2] TaskConfirmed 'DrawAgain' → draw the second card
//
// Three entries because the ability pauses twice: once on a test, once on a
// question. Both hand off the same way — an event with a label — so neither
// the condition nor the confirm holds the steps it guards.
//
// The card says "you MAY", which the old single-entry version ignored — it drew
// the second card automatically. The question needs an answer to gate, and a
// confirm is terminal, so the second draw moves to its own entry.
//
// The prompt has no subjectKey yet: it is always asked once the condition
// holds, and drawing a second card needs nothing carried. The drawn card DOES
// reach entry [1] — CardTypeCondition seeds CTX_DRAWN_CARD_IDS onto its event —
// so finishing "play it immediately" is a subjectKey away.
//
// GAP: "play it immediately" is still unimplemented — there is no task for
// playing a card out of hand from inside an ability. The draw half is complete.
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
