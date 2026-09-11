import { CardType, GameEventType, TriggerScope } from 'shared'
import { CTX_DRAWN_CARD_IDS } from '../../abilities/ability-context'
import { IAbilityRule } from '../../interfaces'
import { ConfirmTask } from '../../tasks/choose-tasks'
import { CardTypeCondition } from '../../tasks/conditions'
import { DrawTask } from '../../tasks/draw-task'
import { PlayHeroTask } from '../../tasks/play-hero-task'

// Mellow Dee (hero-041): draw a card; a drawn hero may be played right away.
const DREW_A_HERO = 'MellowDeeDrewHero'
const PLAY_THE_HERO = 'MellowDeePlaysHero'

export const MellowDeeAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new DrawTask(1),
      new CardTypeCondition(CardType.Hero, CTX_DRAWN_CARD_IDS, DREW_A_HERO),
    ],
  },
  {
    trigger: {
      on: GameEventType.ConditionMet,
      scope: TriggerScope.SelfCard,
      when: DREW_A_HERO,
    },
    steps: [
      new ConfirmTask({
        confirms: PLAY_THE_HERO,
        question: 'Play the hero you just drew?',
        subjectKey: CTX_DRAWN_CARD_IDS,
      }),
    ],
  },
  {
    trigger: {
      on: GameEventType.TaskConfirmed,
      scope: TriggerScope.SelfCard,
      when: PLAY_THE_HERO,
    },
    steps: [new PlayHeroTask(CTX_DRAWN_CARD_IDS)],
  },
]
