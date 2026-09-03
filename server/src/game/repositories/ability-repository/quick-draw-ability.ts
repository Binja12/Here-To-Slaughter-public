import { CardType, GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { CTX_DRAWN_CARD_IDS } from '../../abilities/ability-context'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask, ConfirmTask } from '../../tasks/choose-tasks'
import { CardTypeCondition } from '../../tasks/conditions'
import { DrawTask } from '../../tasks/draw-task'
import { PlayItemTask } from '../../tasks/item-tasks'

// Quick Draw (hero-010): "DRAW 2 cards. If at least one of those cards is an
// Item card, you may play one of them immediately."
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
      new ChooseCardTask({
        zone: Zone.Party,
        owner: Owner.Self,
        unequipped: true,
      }),
      new PlayItemTask(CTX_DRAWN_CARD_IDS),
    ],
  },
]
