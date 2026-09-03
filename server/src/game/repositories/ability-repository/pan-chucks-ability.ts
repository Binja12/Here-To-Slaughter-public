import { CardType, GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { CTX_DRAWN_CARD_IDS } from '../../abilities/ability-context'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask, ConfirmTask } from '../../tasks/choose-tasks'
import { CardTypeCondition } from '../../tasks/conditions'
import { DrawTask } from '../../tasks/draw-task'
import { DestroyTask } from '../../tasks/hero-tasks'

// Pan Chucks (hero-008): "DRAW 2 cards. If at least one of those cards is a
// Challenge card, you may reveal it, then DESTROY a Hero card."
const DREW_A_CHALLENGE = 'PanChucksDrewChallenge'
const DESTROY_A_HERO = 'PanChucksDestroysHero'

export const PanChucksAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new DrawTask(2),
      new CardTypeCondition(
        CardType.Challenge,
        CTX_DRAWN_CARD_IDS,
        DREW_A_CHALLENGE,
      ),
    ],
  },
  {
    trigger: {
      on: GameEventType.ConditionMet,
      scope: TriggerScope.SelfCard,
      when: DREW_A_CHALLENGE,
    },
    steps: [
      new ConfirmTask({
        confirms: DESTROY_A_HERO,
        subjectKey: CTX_DRAWN_CARD_IDS,
      }),
    ],
  },
  {
    trigger: {
      on: GameEventType.TaskConfirmed,
      scope: TriggerScope.SelfCard,
      when: DESTROY_A_HERO,
    },
    steps: [
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.All }),
      new DestroyTask(),
    ],
  },
]
