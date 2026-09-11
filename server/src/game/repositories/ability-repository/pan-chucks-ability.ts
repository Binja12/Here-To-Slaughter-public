import { CardType, GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { CTX_DRAWN_CARD_IDS } from '../../abilities/ability-context'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask, ConfirmTask } from '../../tasks/choose-tasks'
import { CardTypeCondition } from '../../tasks/conditions'
import { DrawTask } from '../../tasks/draw-task'
import { DestroyTask } from '../../tasks/hero-tasks'
import { RevealTask } from '../../tasks/tasks'

// Pan Chucks (hero-008): "Draw two cards. If either is a challenge card, you
// may show it and destroy one hero."
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
        question: 'Reveal the challenge and destroy a hero?',
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
      // "you may show it": the yes shows the drawn cards to the table
      new RevealTask({ fromKey: CTX_DRAWN_CARD_IDS, to: 'all' }),
      new ChooseCardTask(
        { zone: Zone.Party, owner: Owner.All, destroyable: true },
        { question: 'Choose a hero to destroy' },
      ),
      new DestroyTask(),
    ],
  },
]
