import { CardType, GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { CTX_PULLED_CARD_IDS, CTX_CHOSEN_PLAYER } from '../../abilities/ability-context'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import {
  ChooseCardTask,
  ChoosePlayerTask,
  ConfirmTask,
} from '../../tasks/choose-tasks'
import { CardTypeCondition } from '../../tasks/conditions'
import { PlayItemTask } from '../../tasks/item-tasks'
import { PullCardTask } from '../../tasks/tasks'

// Sly Pickings (hero-018): pull a card; if it is an Item, it may be played.
const PULLED_AN_ITEM = 'SlyPickingsPulledItem'
const PLAY_THE_ITEM = 'SlyPickingsPlaysItem'

export const SlyPickingsAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [new ChoosePlayerTask({ owner: Owner.Others }), new TargetRollTask(CTX_CHOSEN_PLAYER, Zone.Hand)],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new PullCardTask(),
      new CardTypeCondition(CardType.Item, CTX_PULLED_CARD_IDS, PULLED_AN_ITEM),
    ],
  },
  {
    trigger: {
      on: GameEventType.ConditionMet,
      scope: TriggerScope.SelfCard,
      when: PULLED_AN_ITEM,
    },
    steps: [
      new ConfirmTask({
        confirms: PLAY_THE_ITEM,
        subjectKey: CTX_PULLED_CARD_IDS,
      }),
    ],
  },
  {
    trigger: {
      on: GameEventType.TaskConfirmed,
      scope: TriggerScope.SelfCard,
      when: PLAY_THE_ITEM,
    },
    steps: [
      new ChooseCardTask({
        zone: Zone.Party,
        owner: Owner.Self,
        unequipped: true,
      }),
      new PlayItemTask(CTX_PULLED_CARD_IDS),
    ],
  },
]
