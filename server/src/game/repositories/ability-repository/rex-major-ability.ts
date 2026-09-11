import { CardType, GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { CTX_DRAWN_CARD_IDS } from '../../abilities/ability-context'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask, ConfirmTask } from '../../tasks/choose-tasks'
import { CardTypeCondition } from '../../tasks/conditions'
import { DrawTask } from '../../tasks/draw-task'
import { DiscardTask, RevealTask } from '../../tasks/tasks'

// Rex Major (monster-132)
//   Passive:    Whenever you draw a modifier, you may show it and draw
//               another card.
//   Fight back: Discard two cards.
const DREW_A_MODIFIER = 'RexMajorDrewModifier'
const DRAW_AGAIN = 'RexMajorDrawsAgain'

export const RexMajorAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.CardDrawn, scope: TriggerScope.OwnerEvent },
    steps: [
      new CardTypeCondition(
        CardType.Modifier,
        CTX_DRAWN_CARD_IDS,
        DREW_A_MODIFIER,
      ),
    ],
  },
  {
    trigger: {
      on: GameEventType.ConditionMet,
      scope: TriggerScope.SelfCard,
      when: DREW_A_MODIFIER,
    },
    steps: [
      new ConfirmTask({
        confirms: DRAW_AGAIN,
        question: 'Reveal the modifier and draw again?',
        subjectKey: CTX_DRAWN_CARD_IDS,
      }),
    ],
  },
  {
    trigger: {
      on: GameEventType.TaskConfirmed,
      scope: TriggerScope.SelfCard,
      when: DRAW_AGAIN,
    },
    steps: [
      // "you may show it": the yes shows the drawn card to the table
      new RevealTask({ fromKey: CTX_DRAWN_CARD_IDS, to: 'all' }),
      new DrawTask(1),
    ],
  },
  {
    trigger: {
      on: GameEventType.MonsterFoughtBack,
      scope: TriggerScope.Attacker,
    },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Hand, owner: Owner.Self },
        { question: 'Choose a card to discard' },
      ),
      new DiscardTask(),
      new ChooseCardTask(
        { zone: Zone.Hand, owner: Owner.Self },
        { question: 'Choose a card to discard' },
      ),
      new DiscardTask(),
    ],
  },
]
