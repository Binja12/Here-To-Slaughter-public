import { CardType, GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { CTX_PULLED_CARD_IDS, CTX_CHOSEN_PLAYER } from '../../abilities/ability-context'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { ChoosePlayerTask, ConfirmTask } from '../../tasks/choose-tasks'
import { CardTypeCondition } from '../../tasks/conditions'
import { PlayHeroTask } from '../../tasks/play-hero-task'
import { PullCardTask } from '../../tasks/tasks'

// Lucky Bucky (hero-042): pull a card; if it is a Hero, it may be played.
const PULLED_A_HERO = 'LuckyBuckyPulledHero'
const PLAY_THE_HERO = 'LuckyBuckyPlaysHero'

export const LuckyBuckyAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [
      new ChoosePlayerTask(
        { owner: Owner.Others },
        'Choose a player to pull a card from',
      ),
      new TargetRollTask(CTX_CHOSEN_PLAYER, Zone.Hand),
    ],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new PullCardTask(),
      new CardTypeCondition(CardType.Hero, CTX_PULLED_CARD_IDS, PULLED_A_HERO),
    ],
  },
  {
    trigger: {
      on: GameEventType.ConditionMet,
      scope: TriggerScope.SelfCard,
      when: PULLED_A_HERO,
    },
    steps: [
      new ConfirmTask({
        confirms: PLAY_THE_HERO,
        question: 'Play the hero you just pulled?',
        subjectKey: CTX_PULLED_CARD_IDS,
      }),
    ],
  },
  {
    trigger: {
      on: GameEventType.TaskConfirmed,
      scope: TriggerScope.SelfCard,
      when: PLAY_THE_HERO,
    },
    steps: [new PlayHeroTask(CTX_PULLED_CARD_IDS)],
  },
]
