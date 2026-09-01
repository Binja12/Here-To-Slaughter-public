import { CardType, GameEventType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { DrawTask } from '../../tasks/draw-task'
import { PlayMagicTask } from '../../tasks/magic-tasks'
import { ConfirmTask } from '../../tasks/choose-tasks'
import { CTX_DRAWN_CARD_IDS } from '../../abilities/ability-context'
import { CardTypeCondition } from '../../tasks/conditions'

// Snowball (hero-040): "Draw a card. If it is a magic card, you may play it right away and then draw again."
//
//   [0] RollSuccess on Snowball      → draw, and test what came up
//   [1] ConditionMet 'DrewMagic'     → ask
//   [2] TaskConfirmed 'PlayAndDraw'  → play the card, then draw the second
//
// Three entries because it pauses twice: on a test, then on a question. The
// question gates BOTH halves of the reward — one answer, one entry, so "no"
// costs the play and the draw together.
//
// The drawn card reaches entry [2] across two hops as ctxSeed: the condition
// seeds the slot it tested, the confirm re-seeds the slot its subjectKey names.
const DREW_A_MAGIC = 'SnowballDrewMagic'
const CONFIRMS_PLAY_AND_DRAW = 'SnowballPlayAndDraw'

export const SnowballAbility: IAbilityRule[] = [
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
    steps: [
      new ConfirmTask({
        confirms: CONFIRMS_PLAY_AND_DRAW,
        question: 'Play the magic card and draw again?',
        subjectKey: CTX_DRAWN_CARD_IDS,
      }),
    ],
  },
  {
    trigger: {
      on: GameEventType.TaskConfirmed,
      scope: TriggerScope.SelfCard,
      when: CONFIRMS_PLAY_AND_DRAW,
    },
    // Play first, then draw — printed order, and the second draw overwrites
    // CTX_DRAWN_CARD_IDS.
    steps: [new PlayMagicTask(CTX_DRAWN_CARD_IDS), new DrawTask(1)],
  },
]
