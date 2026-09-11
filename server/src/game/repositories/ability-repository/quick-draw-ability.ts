import { CardType, GameEventType, Owner, TriggerScope, Zone } from 'shared'
import {
  CTX_CHOSEN_ITEM,
  CTX_DRAWN_CARD_IDS,
} from '../../abilities/ability-context'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask, ConfirmTask } from '../../tasks/choose-tasks'
import { CardTypeCondition } from '../../tasks/conditions'
import { DrawTask } from '../../tasks/draw-task'
import { PlayItemTask } from '../../tasks/item-tasks'

// Quick Draw (hero-010): "Draw two cards. If either is an item, you may play
// it right away."
const DREW_AN_ITEM = 'QuickDrawDrewItem'
const PLAY_AN_ITEM = 'QuickDrawPlaysItem'

export const QuickDrawAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new DrawTask(2),
      new CardTypeCondition(CardType.Item, CTX_DRAWN_CARD_IDS, DREW_AN_ITEM),
    ],
  },
  {
    trigger: {
      on: GameEventType.ConditionMet,
      scope: TriggerScope.SelfCard,
      when: DREW_AN_ITEM,
    },
    steps: [
      new ConfirmTask({
        confirms: PLAY_AN_ITEM,
        question: 'Play the item you just drew?',
        subjectKey: CTX_DRAWN_CARD_IDS,
      }),
    ],
  },
  {
    trigger: {
      on: GameEventType.TaskConfirmed,
      scope: TriggerScope.SelfCard,
      when: PLAY_AN_ITEM,
    },
    steps: [
      new ChooseCardTask(
        {
          zone: Zone.Hand,
          owner: Owner.Self,
          cardType: CardType.Item,
          among: CTX_DRAWN_CARD_IDS,
        },
        { resultKey: CTX_CHOSEN_ITEM, question: 'Choose an item to play' },
      ),
      new ChooseCardTask(
        {
          zone: Zone.Party,
          owner: Owner.Self,
          unequipped: true,
        },
        {
          requiresKey: CTX_CHOSEN_ITEM,
          question: 'Choose a hero to equip it to',
        },
      ),
      new PlayItemTask(CTX_CHOSEN_ITEM),
    ],
  },
]
