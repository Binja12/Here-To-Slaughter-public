import { CardType, GameEventType, Owner, TriggerScope } from 'shared'
import { CTX_PULLED_CARD_IDS } from '../../abilities/ability-context'
import { IAbilityRule } from '../../interfaces'
import { ChoosePlayerTask, ConfirmTask } from '../../tasks/choose-tasks'
import { CardTypeCondition } from '../../tasks/conditions'
import { PlayMagicTask } from '../../tasks/magic-tasks'
import { PullCardTask } from '../../tasks/tasks'

// Buttons (hero-034): pull a card; if it is Magic, it may be played.
const PULLED_MAGIC = 'ButtonsPulledMagic'
const PLAY_MAGIC = 'ButtonsPlaysMagic'

export const ButtonsAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChoosePlayerTask({ owner: Owner.Others }),
      new PullCardTask(),
      new CardTypeCondition(CardType.Magic, CTX_PULLED_CARD_IDS, PULLED_MAGIC),
    ],
  },
  {
    trigger: {
      on: GameEventType.ConditionMet,
      scope: TriggerScope.SelfCard,
      when: PULLED_MAGIC,
    },
    steps: [
      new ConfirmTask({
        confirms: PLAY_MAGIC,
        subjectKey: CTX_PULLED_CARD_IDS,
      }),
    ],
  },
  {
    trigger: {
      on: GameEventType.TaskConfirmed,
      scope: TriggerScope.SelfCard,
      when: PLAY_MAGIC,
    },
    steps: [new PlayMagicTask(CTX_PULLED_CARD_IDS)],
  },
]
